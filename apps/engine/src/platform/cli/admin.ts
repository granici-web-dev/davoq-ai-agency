/**
 * Административный CLI Phase 1. По §13 админка на этом этапе — «hardcoded-config via SQL»;
 * это тот самый слой, только с проверками вместо голых INSERT'ов.
 *
 *   npm run cli create-tenant "Example Ltd" example.com ro
 *   npm run cli ingest-url <tenantId> https://example.com/
 *   npm run cli ingest-file <tenantId> ./page.html
 *   npm run cli search <tenantId> "какая гарантия на диван"
 *   npm run cli rank   <tenantId> "какая гарантия на диван"   # калибровка порога
 *   npm run cli create-user <tenantId> admin@example.com <пароль>
 */

// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../../engine/env.js';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { pool, withPlatform, withTenant } from '../../engine/db/pool.js';
import { ingestNow, ingestUrl } from '../../engine/ingest/index.js';
import { retrieve } from '../../engine/rag/retrieve.js';

const [cmd, ...args] = process.argv.slice(2);

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

switch (cmd) {
  case 'create-tenant': {
    const [name, domain, locale = 'de'] = args;
    if (!name || !domain) throw new Error('usage: create-tenant <name> <domain> [locale]');

    const publicKey = `pk_${randomBytes(16).toString('hex')}`;
    const id = await withPlatform(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO tenants (name, allowed_domains, locale_default, public_key)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, [domain], locale, publicKey],
      );
      const tenantId = rows[0]!.id;
      await client.query(
        `INSERT INTO widget_configs (tenant_id, bot_name) VALUES ($1, $2)`,
        [tenantId, name],
      );
      return tenantId;
    });

    console.log(`tenant   ${id}\npublicKey ${publicKey}\ndomain   ${domain}`);
    break;
  }

  case 'ingest-url': {
    const [tenantId, url] = args;
    if (!tenantId || !url) throw new Error('usage: ingest-url <tenantId> <url>');
    console.log('indexed document', await ingestUrl(tenantId, url));
    break;
  }

  case 'ingest-file': {
    const [tenantId, path] = args;
    if (!tenantId || !path) throw new Error('usage: ingest-file <tenantId> <path>');
    const mime = MIME_BY_EXT[extname(path).toLowerCase()];
    if (!mime) throw new Error(`неизвестное расширение: ${extname(path)}`);
    const docId = await ingestNow(tenantId, {
      filename: basename(path),
      bytes: await readFile(path),
      mime,
    });
    console.log('indexed document', docId);
    break;
  }

  case 'search': {
    const [tenantId, ...q] = args;
    const query = q.join(' ');
    if (!tenantId || !query) throw new Error('usage: search <tenantId> <query>');
    const hits = await withTenant(tenantId, (client) => retrieve(client, tenantId, query));
    if (hits.length === 0) console.log('ничего выше порога близости');
    for (const hit of hits) {
      console.log(`\n${hit.similarity.toFixed(3)}  ${hit.headingPath.join(' > ') || '—'}`);
      console.log(`  ${hit.content.slice(0, 160).replace(/\n/g, ' ')}…`);
    }
    break;
  }

  case 'set-logo': {
    const [tenantId, path] = args;
    if (!tenantId || !path) throw new Error('usage: set-logo <tenantId> <файл .svg|.png|.webp>');
    const ext = extname(path).toLowerCase();
    const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[ext];
    if (!mime) throw new Error(`логотип может быть .svg, .png или .webp, получено ${ext}`);

    // Ключ фиксированный: у тенанта один логотип, и повторная установка
    // должна заменять его, а не копить файлы под разными именами.
    const { put } = await import('../../engine/ingest/storage.js');
    const key = `${tenantId}/brand/logo${ext}`;
    await put(key, await readFile(path));
    await withTenant(tenantId, (client) =>
      client.query('UPDATE tenants SET logo_key = $2, logo_mime = $3 WHERE id = $1',
        [tenantId, key, mime]));
    console.log(`логотип сохранён: ${key}`);
    break;
  }

  case 'create-user': {
    const [tenantId, email, password] = args;
    if (!tenantId || !email || !password) {
      throw new Error('usage: create-user <tenantId> <email> <password>');
    }
    const { hashPassword } = await import('../../engine/api/session.js');
    const hash = await hashPassword(password);
    await withPlatform((client) =>
      client.query(
        `INSERT INTO admin_users (tenant_id, email, password_hash, role)
         VALUES ($1, $2, $3, 'tenant_admin')
         ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [tenantId, email, hash],
      ),
    );
    console.log(`admin ${email} готов`);
    break;
  }

  case 'crawl': {
    const [tenantId, url, limit] = args;
    if (!tenantId || !url) throw new Error('usage: crawl <tenantId> <url> [limit]');
    const { crawl } = await import('../../engine/ingest/crawl.js');
    const pages = await crawl(url, { maxPages: Number(limit ?? 60) });
    console.log(`найдено страниц: ${pages.length}`);
    let ok = 0;
    for (const page of pages) {
      try {
        await ingestUrl(tenantId, page);
        ok++;
        process.stdout.write(`  ✓ ${page}\n`);
      } catch (err) {
        process.stdout.write(`  ✗ ${page} — ${(err as Error).message.slice(0, 60)}\n`);
      }
    }
    console.log(`проиндексировано ${ok} из ${pages.length}`);
    break;
  }

  case 'drive-connect': {
    const [tenantId, folderUrl] = args;
    if (!tenantId || !folderUrl) throw new Error('usage: drive-connect <tenantId> <folderUrl>');

    const id = /[-\w]{25,}/.exec(folderUrl)?.[0];
    if (!id) throw new Error('не удалось выделить идентификатор папки из ссылки');

    const { authorize } = await import('../../engine/drive/oauth.js');
    const { encryptSecret } = await import('../../engine/llm/secrets.js');
    const tokens = await authorize();

    // Refresh-токен шифруется тем же ключом, что и секреты коннекторов:
    // это долгоживущий доступ к диску клиента, и в базе ему открытым быть нельзя.
    await withTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO connectors (tenant_id, type, name, base_url, secret_encrypted, config)
         VALUES ($1, 'google_drive', 'Google Drive', '', $2, $3)`,
        [tenantId, encryptSecret(tokens.refreshToken), JSON.stringify({ folderId: id })],
      ),
    );
    console.log(`\nдиск подключён, папка ${id}`);
    break;
  }

  case 'drive-sync': {
    const [tenantId] = args;
    if (!tenantId) throw new Error('usage: drive-sync <tenantId>');
    const { DriveClient } = await import('../../engine/drive/client.js');
    const conn = await withTenant(tenantId, (c) => DriveClient.forTenant(c, tenantId));
    if (!conn) throw new Error('диск не подключён');

    const files = await conn.drive.list(conn.folderId);
    console.log(`файлов на диске: ${files.length}`);
    for (const f of files) {
      try {
        const { bytes, mime } = await conn.drive.download(f);
        // Имя файла с путём подпапок — оно же ключ версии: повторная синхронизация
        // заменяет содержимое, а не плодит дубли.
        await ingestNow(tenantId, { filename: `drive:${f.path}`, bytes, mime });
        console.log(`  ✓ ${f.path}`);
      } catch (err) {
        console.log(`  ✗ ${f.path} — ${(err as Error).message.slice(0, 90)}`);
      }
    }
    break;
  }

  case 'drive-list': {
    const [tenantId] = args;
    if (!tenantId) throw new Error('usage: drive-list <tenantId>');
    const { DriveClient } = await import('../../engine/drive/client.js');
    const conn = await withTenant(tenantId, (c) => DriveClient.forTenant(c, tenantId));
    if (!conn) throw new Error('диск не подключён');
    const files = await conn.drive.list(conn.folderId);
    console.log(`файлов: ${files.length}\n`);
    for (const f of files) {
      const kb = f.size ? `${Math.round(Number(f.size) / 1024)} КБ` : '—';
      console.log(`  ${f.path}\n     ${f.mimeType}  ${kb}  изменён ${f.modifiedTime.slice(0, 10)}`);
    }
    break;
  }

  case 'rank': {
    // Показывает ВСЕ чанки со степенью близости, игнорируя порог. Нужен, чтобы
    // подобрать RETRIEVAL_MIN_SIMILARITY: видно, где проходит граница между
    // релевантным и случайным на конкретном корпусе.
    const [tenantId, ...q] = args;
    const query = q.join(' ');
    if (!tenantId || !query) throw new Error('usage: rank <tenantId> <query>');
    const { createEmbeddingProvider, toVectorLiteral } = await import('../../engine/llm/embeddings.js');
    const provider = createEmbeddingProvider();
    const [vector] = await provider.embed([query], 'query');
    await withTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ path: string; sim: string }>(
        `SELECT coalesce(metadata->>'headingPath', '—') AS path,
                round((1 - (embedding <=> $1::vector))::numeric, 3) AS sim
           FROM chunks WHERE embedding_model = $2
          ORDER BY embedding <=> $1::vector`,
        [toVectorLiteral(vector!), provider.model],
      );
      for (const r of rows) console.log(`${r.sim}  ${r.path}`);
    });
    break;
  }

  default:
    console.error(
      'команды: create-tenant | create-user | set-logo | crawl | ingest-url | ingest-file' +
      ' | drive-connect | search | rank',
    );
    process.exitCode = 1;
}

await pool.end();
