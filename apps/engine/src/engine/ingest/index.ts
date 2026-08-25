import { extname } from 'node:path';
import type pg from 'pg';
import { withTenant } from '../db/pool.js';
import { createEmbeddingProvider, toVectorLiteral } from '../llm/embeddings.js';
import { chunkBlocks, type Chunk } from './chunk.js';
import { extract, fetchPage } from './extract.js';
import { planFor } from '../plans.js';
import * as storage from './storage.js';
import { clientError } from '../api/errors.js';

const embeddings = createEmbeddingProvider();

/** Bedrock ограничивает размер тела запроса — эмбеддим партиями, а не всем корпусом сразу. */
const EMBED_BATCH = 64;

export interface NewDocument {
  filename: string;
  mime: string;
  /** Либо байты файла, либо адрес страницы — страница забирается в момент обработки. */
  bytes?: Buffer;
  sourceUrl?: string;
}

/**
 * Регистрирует документ и возвращает его id. Содержимое ещё не разобрано: разбор
 * идёт отдельным шагом, потому что .pdf на сотню страниц не должен держать HTTP-запрос
 * администратора открытым (§7).
 */
export async function createDocument(tenantId: string, doc: NewDocument): Promise<string> {
  return withTenant(tenantId, async (client) => {
    await assertWithinLimits(client, tenantId, doc.bytes?.length ?? 0);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO documents (tenant_id, filename, source_url, storage_key, mime, size_bytes, status)
       VALUES ($1, $2, $3, '', $4, $5, 'uploaded') RETURNING id`,
      [tenantId, doc.filename, doc.sourceUrl ?? null, doc.mime, doc.bytes?.length ?? 0],
    );
    const id = rows[0]!.id;

    if (doc.bytes) {
      const key = storage.storageKey(tenantId, id, extname(doc.filename).toLowerCase());
      await storage.put(key, doc.bytes);
      await client.query('UPDATE documents SET storage_key = $2 WHERE id = $1', [id, key]);
    }

    return id;
  });
}

/**
 * Разбирает, нарезает, эмбеддит и индексирует документ. Вызывается воркером очереди
 * или напрямую из CLI. Ошибка не бросается наружу, а оседает в documents.error_text
 * текстом, который читает человек в админке.
 */
export async function processDocument(tenantId: string, documentId: string): Promise<void> {
  try {
    const { blocks, filename, bytes } = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query<{
        filename: string; mime: string; storage_key: string; source_url: string | null;
      }>('SELECT filename, mime, storage_key, source_url FROM documents WHERE id = $1', [documentId]);

      const doc = rows[0];
      if (!doc) throw clientError('document_missing', 'Documentul nu a fost găsit');
      await client.query(`UPDATE documents SET status = 'processing' WHERE id = $1`, [documentId]);

      // Страница забирается заново на каждой попытке: повторная обработка должна
      // видеть актуальный сайт, а не слепок недельной давности.
      if (doc.source_url) {
        const page = await fetchPage(doc.source_url);
        return {
          blocks: await extract(page.content, page.mime, doc.source_url),
          filename: doc.filename,
          // Документ по ссылке записывался с size_bytes = 0 — то есть страницы
          // не занимали в тарифе ничего вовсе, сколько бы их ни добавили.
          // Настоящий размер известен только здесь, после загрузки.
          bytes: Buffer.byteLength(page.content, 'utf8'),
        };
      }
      const raw = await storage.get(doc.storage_key);
      return {
        blocks: await extract(raw, doc.mime, doc.filename),
        filename: doc.filename,
        bytes: raw.length,
      };
    });

    const chunks = chunkBlocks(blocks);
    if (chunks.length === 0) throw clientError('file_no_text', 'Fișierul nu conține text care să poată fi indexat');

    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
      vectors.push(...(await embeddings.embed(batch, 'document')));
    }

    await withTenant(tenantId, async (client) => {
      await insertChunks(client, tenantId, documentId, chunks, vectors);
      await client.query(
        `UPDATE documents SET status = 'indexed', indexed_at = now(), error_text = NULL,
                size_bytes = $2
          WHERE id = $1`,
        [documentId, bytes],
      );
      // §7 п.4: старая версия удаляется только после успешной индексации новой
      // и в той же транзакции — упавшая переиндексация не оставит тенанта без базы.
      await client.query(
        `DELETE FROM documents WHERE tenant_id = $1 AND filename = $2 AND id <> $3`,
        [tenantId, filename, documentId],
      );
    });
  } catch (err) {
    await withTenant(tenantId, (client) =>
      client.query(`UPDATE documents SET status = 'failed', error_text = $2 WHERE id = $1`, [
        documentId,
        (err as Error).message.slice(0, 500),
      ]),
    );
    throw err;
  }
}

/** Удобная обёртка для CLI: зарегистрировать и сразу обработать. */
export async function ingestNow(tenantId: string, doc: NewDocument): Promise<string> {
  const id = await createDocument(tenantId, doc);
  await processDocument(tenantId, id);
  return id;
}

export async function ingestUrl(tenantId: string, url: string): Promise<string> {
  return ingestNow(tenantId, { filename: url, sourceUrl: url, mime: 'text/html' });
}

async function assertWithinLimits(
  client: pg.PoolClient,
  tenantId: string,
  incomingBytes: number,
): Promise<void> {
  const { rows } = await client.query<{ plan: string }>(
    'SELECT plan FROM tenants WHERE id = $1', [tenantId],
  );
  const limits = planFor(rows[0]?.plan);

  const { rows: usage } = await client.query<{ docs: string; bytes: string; chunks: string }>(
    `SELECT count(*) AS docs, coalesce(sum(size_bytes), 0) AS bytes,
            (SELECT count(*) FROM chunks) AS chunks
       FROM documents`,
  );
  const used = usage[0]!;

  if (Number(used.docs) >= limits.maxDocuments) {
    throw clientError('plan_limit_documents',
      `Ați atins limita planului: ${limits.maxDocuments} documente.`,
      { limit: limits.maxDocuments });
  }
  if (Number(used.bytes) + incomingBytes > limits.maxTotalBytes) {
    throw clientError('plan_limit_bytes',
      `Ați atins limita planului: ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB în total.`,
      { limit: Math.round(limits.maxTotalBytes / 1024 / 1024) });
  }
  if (Number(used.chunks) >= limits.maxChunks) {
    throw clientError('plan_limit_chunks',
      `Ați atins limita planului: ${limits.maxChunks} fragmente.`,
      { limit: limits.maxChunks });
  }
}

async function insertChunks(
  client: pg.PoolClient,
  tenantId: string,
  documentId: string,
  chunks: Chunk[],
  vectors: number[][],
): Promise<void> {
  // Переиндексация того же документа: старые фрагменты уходят вместе с новой вставкой.
  await client.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);

  // Потолок фрагментов проверяется ЗДЕСЬ, а не только при регистрации документа.
  // До разбора числа фрагментов не знает никто: проверка «сколько уже есть»
  // пропускала любой один документ целиком, каким бы он ни был. Каталог на
  // тысячу страниц проходил в тариф starter с потолком в две тысячи фрагментов.
  const { rows: planRows } = await client.query<{ plan: string }>(
    'SELECT plan FROM tenants WHERE id = $1', [tenantId],
  );
  const limits = planFor(planRows[0]?.plan);
  const { rows: countRows } = await client.query<{ n: string }>('SELECT count(*) AS n FROM chunks');
  const already = Number(countRows[0]?.n ?? 0);
  if (already + chunks.length > limits.maxChunks) {
    throw clientError('plan_limit_chunks',
      `Documentul depășește limita planului: ${limits.maxChunks} fragmente ` +
      `(aveți ${already}, documentul adaugă ${chunks.length}).`,
      { limit: limits.maxChunks });
  }

  const values: unknown[] = [];
  const rows: string[] = [];

  chunks.forEach((chunk, i) => {
    const base = i * 8; // 8 плейсхолдеров на строку
    rows.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector, $${base + 6}, $${base + 7}, $${base + 8})`,
    );
    values.push(
      tenantId, documentId, chunk.seq, chunk.content,
      toVectorLiteral(vectors[i]!), embeddings.model, chunk.tokenCount,
      JSON.stringify(chunk.metadata),
    );
  });

  await client.query(
    `INSERT INTO chunks (tenant_id, document_id, seq, content, embedding, embedding_model, token_count, metadata)
     VALUES ${rows.join(', ')}`,
    values,
  );
}
