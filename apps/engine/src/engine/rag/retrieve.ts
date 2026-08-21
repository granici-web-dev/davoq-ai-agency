import type pg from 'pg';
import { createEmbeddingProvider, toVectorLiteral } from '../llm/embeddings.js';

const embeddings = createEmbeddingProvider();

/** §6 п.3: top-k = 6, отфильтровано по тенанту. */
const TOP_K = 6;

/**
 * Порог косинусной близости. Ниже него контекст не подставляется вовсе: подсунуть
 * модели нерелевантный кусок хуже, чем не подсунуть ничего — она начнёт его пересказывать.
 *
 * Значение зависит от модели эмбеддингов и корпуса, поэтому вынесено в конфиг:
 * калибруется командой `admin.ts rank` на реальных вопросах клиента. Стартовое —
 * консервативное для Cohere multilingual. У dev-заглушки абсолютные значения
 * не имеют смысла вовсе (она лексическая), сравнивать по ним порог бесполезно.
 */
/**
 * Запасные пороги. Рабочие приходят из вертикали и переопределяются клиентом:
 * значение зависит от языка и характера корпуса, то есть это свойство ниши,
 * а не процесса. Здесь остаётся только то, чем пользуются вызовы без контекста
 * ниши — CLI-поиск и диагностика.
 */
const MIN_SIMILARITY = Number(process.env.RETRIEVAL_MIN_SIMILARITY ?? 0.35);

export interface Hit {
  id: string;
  content: string;
  similarity: number;
  headingPath: string[];
}

/**
 * Порог для утверждённых ответов — низкий намеренно, и решение принимает не он.
 *
 * Замерено 20.08.2026 на Titan: «cât durează livrarea la Cluj» близко к
 * утверждённому «cât durează livrarea la Brașov» на 0.620, а «în cât timp ajunge
 * comanda la Brasov» — та же мысль другими словами — всего на 0.497. Модель
 * эмбеддингов смотрит на слова, а не на смысл, и порога, который отделяет
 * «то же самое иначе» от «другое так же», не существует: любой отсекает
 * пересказы раньше, чем чужие вопросы.
 *
 * Поэтому поиск здесь работает только как грубый отбор кандидатов, а совпадает
 * вопрос или нет, решает Claude — он различает Брашов и Клуж, а косинус нет.
 */
const APPROVED_MIN_SIMILARITY = Number(process.env.APPROVED_MIN_SIMILARITY ?? 0.30);

/** Больше четырёх кандидатов — это уже расход токенов без прироста попадания. */
const APPROVED_LIMIT = 4;

export interface ApprovedMatch {
  id: string;
  question: string;
  answer: string;
  similarity: number;
}

/**
 * Поиск по базе знаний и по утверждённым ответам за один эмбеддинг вопроса.
 * Разделять их — значит платить за два вызова провайдера на каждое сообщение.
 */
export interface Thresholds {
  minSimilarity?: number | undefined;
  approvedMinSimilarity?: number | undefined;
}

export async function retrieveAll(
  client: pg.PoolClient,
  tenantId: string,
  query: string,
  thresholds: Thresholds = {},
): Promise<{ hits: Hit[]; approved: ApprovedMatch[] }> {
  const [vector] = await embeddings.embed([query], 'query');
  if (!vector) return { hits: [], approved: [] };
  const literal = toVectorLiteral(vector);

  const { rows } = await client.query<{
    id: string; question: string; answer: string; similarity: number;
  }>(
    `SELECT id, question, answer, 1 - (embedding <=> $1::vector) AS similarity
       FROM approved_answers
      WHERE tenant_id = $2 AND active AND embedding_model = $3
        AND 1 - (embedding <=> $1::vector) >= $4
      ORDER BY embedding <=> $1::vector
      LIMIT $5`,
    [literal, tenantId, embeddings.model,
     thresholds.approvedMinSimilarity ?? APPROVED_MIN_SIMILARITY, APPROVED_LIMIT],
  );

  return {
    hits: await retrieve(client, tenantId, query, vector, thresholds.minSimilarity),
    approved: rows.map((r) => ({ ...r, similarity: Number(r.similarity) })),
  };
}

export async function retrieve(
  client: pg.PoolClient,
  tenantId: string,
  query: string,
  precomputed?: number[],
  minSimilarity: number = MIN_SIMILARITY,
): Promise<Hit[]> {
  const vector = precomputed ?? (await embeddings.embed([query], 'query'))[0];
  if (!vector) return [];

  // Модель эмбеддингов фильтруется явно: после смены модели в базе какое-то время
  // сосуществуют два поколения векторов, и сравнивать их между собой нельзя.
  const { rows } = await client.query<{
    id: string;
    content: string;
    similarity: number;
    metadata: { headingPath?: string[] };
  }>(
    `SELECT id, content, metadata, 1 - (embedding <=> $1::vector) AS similarity
       FROM chunks
      WHERE tenant_id = $2 AND embedding_model = $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
    [toVectorLiteral(vector), tenantId, embeddings.model, TOP_K],
  );

  return rows
    .filter((r) => r.similarity >= minSimilarity)
    .map((r) => ({
      id: r.id,
      content: r.content,
      similarity: Number(r.similarity),
      headingPath: r.metadata?.headingPath ?? [],
    }));
}
