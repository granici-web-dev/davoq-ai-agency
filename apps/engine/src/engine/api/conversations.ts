import type pg from 'pg';

export interface ConversationFilters {
  from?: string;
  to?: string;
  q?: string;
  hasLead?: boolean;
  hasGap?: boolean;
  locale?: string;
}

/**
 * Условия собираются один раз и переиспользуются списком и выгрузкой: разойдись
 * они — и экспорт отдавал бы не то, что человек видит на экране.
 */
export function buildWhere(
  f: ConversationFilters,
  params: unknown[],
): string {
  const parts: string[] = [];

  if (f.from) { params.push(f.from); parts.push(`c.started_at >= $${params.length}::date`); }
  // Верхняя граница включительно: «по 20 августа» для человека означает весь день.
  if (f.to) { params.push(f.to); parts.push(`c.started_at < ($${params.length}::date + 1)`); }
  if (f.locale) { params.push(f.locale); parts.push(`c.locale = $${params.length}`); }

  if (f.q) {
    params.push(f.q);
    parts.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id
                AND m.search @@ plainto_tsquery('simple', $${params.length}))`,
    );
  }
  if (f.hasLead) parts.push(`EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id)`);
  if (f.hasGap) {
    parts.push(
      `EXISTS (SELECT 1 FROM unanswered_log u
                WHERE u.conversation_id = c.id AND u.source = 'model')`,
    );
  }

  return parts.length ? `WHERE ${parts.join(' AND ')}` : '';
}

export interface ConversationRow {
  id: string;
  started_at: Date;
  last_message_at: Date;
  locale: string;
  status: string;
  message_count: number;
  has_lead: boolean;
  gap_count: number;
  first_question: string | null;
}

export async function listConversations(
  client: pg.PoolClient,
  f: ConversationFilters,
  limit: number,
  offset: number,
): Promise<{ rows: ConversationRow[]; total: number }> {
  const params: unknown[] = [];
  const where = buildWhere(f, params);

  const { rows: countRows } = await client.query<{ total: string }>(
    `SELECT count(*) AS total FROM conversations c ${where}`, params,
  );

  params.push(limit, offset);
  const { rows } = await client.query<ConversationRow>(
    `SELECT c.id, c.started_at, c.last_message_at, c.locale, c.status,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count,
            EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id) AS has_lead,
            (SELECT count(*)::int FROM unanswered_log u
              WHERE u.conversation_id = c.id AND u.source = 'model') AS gap_count,
            -- Первая реплика посетителя в списке важнее даты: по ней узнают разговор.
            (SELECT m.content FROM messages m
              WHERE m.conversation_id = c.id AND m.role = 'user'
              ORDER BY m.created_at LIMIT 1) AS first_question
       FROM conversations c ${where}
      ORDER BY c.started_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { rows, total: Number(countRows[0]?.total ?? 0) };
}

/**
 * Даты приводятся к «ГГГГ-ММ-ДД ЧЧ:ММ:СС». По умолчанию Date отдаёт
 * «Thu Aug 20 2026 17:21:34 GMT+0200 (Central European Summer Time)» —
 * Excel такое не распознаёт как дату, и сортировка с группировкой по дням,
 * ради которых выгрузка и делается, не работают.
 */
const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
  ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

const csvCell = (v: unknown): string => {
  if (v instanceof Date) return `"${formatDate(v)}"`;
  const s = v === null || v === undefined ? '' : String(v);
  // Формулой Excel считает всё, что начинается с =, +, - или @ — включая номер
  // телефона вида +40… Апостроф спереди обезвреживает подстановку.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(';') + '\r\n';

/**
 * BOM в начале и точка с запятой как разделитель: Excel в европейских локалях
 * иначе показывает кириллицу и диакритику кракозябрами, а запятые не делит
 * на столбцы. Google Sheets понимает оба варианта.
 */
export const CSV_PREAMBLE = '﻿';
