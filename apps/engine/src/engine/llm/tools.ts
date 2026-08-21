import type pg from 'pg';
import { callConnector, formatResult, type ConnectorTool } from './connector.js';

/**
 * Инструмент, доступный всегда (§6 п.5). Коннекторные инструменты тенанта добавятся
 * к нему на Phase 3 из таблицы connector_tools.
 */
/**
 * Модель сама сообщает, что ответить не смогла (§10, отчёт о пробелах).
 *
 * Без этого инструмента в отчёт попадали только вопросы, по которым поиск не нашёл
 * вообще ничего. Самый частый случай — «нашёл товарные страницы, но ответа в них нет» —
 * проходил мимо: на живом прогоне вопрос про цену не попал в список, хотя именно
 * он и есть главный пробел. Определять отказ по тексту ответа нельзя — он приходит
 * на четырёх языках.
 */
export const REPORT_UNANSWERED = {
  name: 'report_unanswered',
  description:
    "Record that the visitor's question could not be answered from the knowledge base. " +
    'Call this ALWAYS when the needed information is absent from the context — even if ' +
    'you offered to take their contact details or answered partially. It is how the ' +
    'company learns what to write next. The call is invisible to the visitor.',
  input_schema: {
    type: 'object' as const,
    properties: {
      question: {
        type: 'string',
        description: "The visitor's question in your own words, briefly, in their language",
      },
      reason: {
        type: 'string',
        enum: ['no_retrieval_hit', 'low_confidence', 'out_of_scope'],
        description:
          'no_retrieval_hit — nothing in the context touches the topic; ' +
          'low_confidence — something was found but it does not answer directly; ' +
          'out_of_scope — the question is not about the company or its products',
      },
    },
    required: ['question', 'reason'] as string[],
    additionalProperties: false,
  },
};

export const CAPTURE_LEAD = {
  name: 'capture_lead',
  description:
    'Save the visitor contact details once they are willing to leave them: they ask to ' +
    'be contacted, request a quote, or the answer is missing and a human is needed. ' +
    'Call only once the visitor has actually given an email or a phone number.',
  input_schema: {
    type: 'object' as const,
    properties: {
      email: { type: 'string', description: 'Visitor email' },
      phone: { type: 'string', description: 'Visitor phone number' },
      name: { type: 'string', description: 'Visitor name' },
      note: { type: 'string', description: 'What they want, in one sentence' },
    },
    required: [] as string[],
    additionalProperties: false,
  },
};

export interface ToolContext {
  client: pg.PoolClient;
  tenantId: string;
  conversationId: string;
  /** Диалог ещё не записан в базу — лид складываем в буфер и пишем вместе с ним. */
  pendingLeads: Array<{
    email?: string; phone?: string; name?: string; note?: string;
    payload?: Record<string, string>;
  }>;
  /** Инструменты тенанта из connector_tools. Список статичен (§11): */
  connectorTools: Map<string, ConnectorTool>;
  /** Диалога в базе ещё нет — пробелы копим и пишем вместе с ним. */
  pendingUnanswered: Array<{ question: string; reason: string }>;
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ content: string; isError: boolean }> {
  const connector = ctx.connectorTools.get(name);
  if (connector) {
    const result = await callConnector(connector, input);
    return {
      content: formatResult(connector, result),
      isError: Boolean(result.error) || (result.status ?? 0) >= 400,
    };
  }

  if (name === 'report_unanswered') {
    const question = str(input.question);
    if (!question) return { content: 'The question text is required.', isError: true };
    const reason = str(input.reason);
    ctx.pendingUnanswered.push({
      question,
      reason: ['no_retrieval_hit', 'low_confidence', 'out_of_scope'].includes(reason ?? '')
        ? reason!
        : 'low_confidence',
    });
    // Ответ нейтральный: модель не должна пересказывать посетителю, что она
    // «зафиксировала пробел» — для него это внутренняя кухня.
    return { content: 'Recorded. Carry on answering the visitor.', isError: false };
  }

  if (name !== 'capture_lead' && name !== 'request_quote') {
    // §11: список инструментов — статичная конфигурация тенанта. Модель не может
    // придумать эндпоинт: имени нет в реестре — вызова не будет.
    return { content: `Unknown tool: ${name}`, isError: true };
  }

  const email = str(input.email);
  const phone = str(input.phone);
  if (!email && !phone) {
    // Модель иногда вызывает инструмент авансом, ещё не получив контакт.
    // Возвращаем это как ошибку инструмента, а не как отказ: она переспросит.
    return { content: 'An email or a phone number is required — ask the visitor for one.', isError: true };
  }

  // Всё, кроме контактных полей, — это ответы на вопросы продавца: они уходят
  // в payload и превращают лид в заполненный бриф для расчёта цены.
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (['email', 'phone', 'name', 'note'].includes(key)) continue;
    const v = str(value);
    if (v) payload[key] = v;
  }

  ctx.pendingLeads.push({
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(str(input.name) ? { name: str(input.name)! } : {}),
    ...(str(input.note) ? { note: str(input.note)! } : {}),
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
  });

  return {
    content:
      name === 'request_quote'
        ? 'Request handed to a manager. Tell the visitor they will be contacted with a quote.'
        : 'Contact saved. Confirm to the visitor that someone will be in touch.',
    isError: false,
  };
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
