import type pg from 'pg';
import { createEmbeddingProvider, toVectorLiteral } from '../llm/embeddings.js';
import { clientError } from '../api/errors.js';

/**
 * Утверждённые ответы: директор по продажам правит ответ бота прямо из переписки,
 * и дальше бот отвечает так же. Единственное место, где человек управляет словами
 * бота напрямую, минуя материалы.
 */

const embeddings = createEmbeddingProvider();

export interface ApprovedRow {
  id: string;
  question: string;
  answer: string;
  source_conversation_id: string | null;
  updated_at: string;
}

export interface SaveApproved {
  question: string;
  answer: string;
  conversationId?: string | null;
  createdBy?: string | null;
}

export async function saveApproved(
  client: pg.PoolClient,
  tenantId: string,
  input: SaveApproved,
): Promise<string> {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question) throw clientError('approved_question_empty', 'Întrebarea nu poate fi goală');
  if (!answer) throw clientError('approved_answer_empty', 'Răspunsul nu poate fi gol');

  const [vector] = await embeddings.embed([question], 'query');
  if (!vector) throw clientError('approved_embed_failed', 'Nu am putut procesa întrebarea, încercați din nou');

  // Повторное утверждение того же вопроса заменяет ответ, а не заводит второй:
  // иначе два разных ответа на один вопрос конкурируют по близости, и какой
  // из них скажет бот — лотерея.
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM approved_answers
      WHERE tenant_id = $1 AND lower(question) = lower($2) LIMIT 1`,
    [tenantId, question],
  );

  if (existing[0]) {
    await client.query(
      `UPDATE approved_answers
          SET answer = $2, embedding = $3::vector, embedding_model = $4,
              active = true, updated_at = now()
        WHERE id = $1`,
      [existing[0].id, answer, toVectorLiteral(vector), embeddings.model],
    );
    return existing[0].id;
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO approved_answers
       (tenant_id, question, answer, embedding, embedding_model,
        source_conversation_id, created_by)
     VALUES ($1, $2, $3, $4::vector, $5, $6, $7) RETURNING id`,
    [
      tenantId, question, answer, toVectorLiteral(vector), embeddings.model,
      input.conversationId ?? null, input.createdBy ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function listApproved(client: pg.PoolClient): Promise<ApprovedRow[]> {
  const { rows } = await client.query<ApprovedRow>(
    `SELECT id, question, answer, source_conversation_id, updated_at
       FROM approved_answers WHERE active ORDER BY updated_at DESC LIMIT 200`,
  );
  return rows;
}
