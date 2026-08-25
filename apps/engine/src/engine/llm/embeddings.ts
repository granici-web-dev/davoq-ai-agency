import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createHash } from 'node:crypto';

/** Размерность зафиксирована схемой: chunks.embedding — vector(1024). */
/** Потолок входа Titan v2: 8192 токена, с запасом по знакам. */
const TITAN_MAX_CHARS = 20_000;

export const EMBEDDING_DIMS = 1024;

export type EmbeddingKind = 'document' | 'query';

export interface EmbeddingProvider {
  /** Идентификатор пишется в chunks.embedding_model — смена модели требует пере-эмбеддинга (§14.4). */
  readonly model: string;
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

/**
 * Cohere embed-multilingual-v3 через Bedrock в том же регионе ЕС, что и Claude
 * (см. 06-Implement/stack.md): один аккаунт, один DPA, ноль GPU в обслуживании.
 * Многоязычность обязательна — виджет говорит на de/ro/ru/en (§9).
 */
class BedrockCohereEmbeddings implements EmbeddingProvider {
  readonly model: string;
  #client: BedrockRuntimeClient;

  constructor(model: string, region: string) {
    this.model = model;
    this.#client = new BedrockRuntimeClient({ region });
  }

  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    if (texts.length === 0) return [];

    const res = await this.#client.send(
      new InvokeModelCommand({
        modelId: this.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          texts,
          // Cohere кодирует документы и запросы асимметрично: перепутанный input_type
          // тихо роняет качество поиска, не выдавая никакой ошибки.
          input_type: kind === 'document' ? 'search_document' : 'search_query',
          truncate: 'END',
        }),
      }),
    );

    const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embeddings: number[][] };
    const dims = parsed.embeddings[0]?.length;
    if (dims !== undefined && dims !== EMBEDDING_DIMS) {
      throw new Error(
        `embeddings: model ${this.model} returned ${dims} dimensions, schema expects ${EMBEDDING_DIMS}`,
      );
    }
    return parsed.embeddings;
  }
}

/**
 * Amazon Titan Embed Text v2. Модель самой AWS, поэтому не требует подписки
 * AWS Marketplace — в отличие от Cohere, для которой нужен разовый вызов
 * администратором с правом aws-marketplace:Subscribe.
 *
 * Размерность запрашивается явно: Titan умеет 256/512/1024, а схема ждёт 1024.
 * Батчей у неё нет — один текст за вызов, поэтому корпус эмбеддится с ограниченным
 * параллелизмом, а не одним запросом на партию.
 */
class BedrockTitanEmbeddings implements EmbeddingProvider {
  readonly model: string;
  #client: BedrockRuntimeClient;
  #concurrency = 8;

  constructor(model: string, region: string) {
    this.model = model;
    this.#client = new BedrockRuntimeClient({ region });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = new Array(texts.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      for (let i = cursor++; i < texts.length; i = cursor++) {
        out[i] = await this.#one(texts[i]!);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.#concurrency, texts.length) }, worker),
    );
    return out;
  }

  /**
   * У Titan свой потолок на вход, и параметра «обрежь сам» у него нет —
   * в отличие от Cohere. Без обрезки длинное сообщение посетителя роняло
   * запрос в 500 ещё до обращения к модели. Обрезка молчаливая: смысл вопроса
   * задаётся первыми абзацами, а отказать посетителю за длину — хуже.
   */
  async #one(text: string): Promise<number[]> {
    const res = await this.#client.send(
      new InvokeModelCommand({
        modelId: this.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text.slice(0, TITAN_MAX_CHARS),
          dimensions: EMBEDDING_DIMS,
          normalize: true,
        }),
      }),
    );
    const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embedding: number[] };
    if (parsed.embedding.length !== EMBEDDING_DIMS) {
      throw new Error(
        `embeddings: ${this.model} returned ${parsed.embedding.length} dimensions, schema expects ${EMBEDDING_DIMS}`,
      );
    }
    return parsed.embedding;
  }
}

/**
 * Детерминированная заглушка ДЛЯ РАЗРАБОТКИ. Позволяет прогонять ингестию и поиск
 * без учётки AWS. Семантики не даёт никакой — совпадения только лексические,
 * поэтому качество ретрива на ней измерять бессмысленно.
 */
class DevStubEmbeddings implements EmbeddingProvider {
  readonly model = 'dev-stub-1024';

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vec = new Array<number>(EMBEDDING_DIMS).fill(0);
      for (const token of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
        const h = createHash('sha256').update(token).digest();
        for (let i = 0; i < 8; i++) {
          const slot = ((h[i * 2]! << 8) | h[i * 2 + 1]!) % EMBEDDING_DIMS;
          vec[slot] = vec[slot]! + 1;
        }
      }
      const norm = Math.hypot(...vec) || 1;
      return vec.map((v) => v / norm);
    });
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const region = process.env.AWS_REGION ?? 'eu-central-1';
  const model = process.env.EMBEDDING_MODEL ?? 'amazon.titan-embed-text-v2:0';

  if (process.env.EMBEDDING_PROVIDER === 'dev-stub') return new DevStubEmbeddings();
  // Провайдер выбирается по имени модели: у Cohere и Titan разные форматы
  // запроса и ответа, и подобрать их автоматически нельзя.
  if (model.startsWith('cohere.')) return new BedrockCohereEmbeddings(model, region);
  return new BedrockTitanEmbeddings(model, region);
}

/** pgvector принимает литерал вида '[0.1,0.2,...]'. */
export const toVectorLiteral = (v: number[]): string => `[${v.join(',')}]`;
