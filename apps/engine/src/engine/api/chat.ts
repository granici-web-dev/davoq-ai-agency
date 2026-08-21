import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { withTenant } from '../db/pool.js';
import { enqueueLeadNotify } from '../ingest/queue.js';
import { contactKey } from '../notify/contact.js';
import { claude, modelFor } from '../llm/claude.js';
import { loadTools, toClaudeTool } from '../llm/connector.js';
import { buildQuoteTool, loadQuoteConfig } from '../llm/quote.js';
import { CAPTURE_LEAD, REPORT_UNANSWERED, runTool, type ToolContext } from '../llm/tools.js';
import { verticalOf } from '../prompt/vertical.js';
import { buildSystem, buildUserContent } from '../rag/prompt.js';
import { retrieveAll } from '../rag/retrieve.js';
import { originAllowed, resolveTenant } from './auth.js';

/** Тип реплики выводим из самого клиента: путь к нему внутри пакета — не публичный контракт. */
type MessageParam = Parameters<typeof claude.messages.stream>[0]['messages'][number];

/** История диалога, отдаваемая модели. Больше — дороже и без выигрыша в качестве. */
const HISTORY_LIMIT = 10;

interface ChatBody {
  publicKey: string;
  visitorId: string;
  conversationId?: string;
  message: string;
  locale?: string;
}

export function registerChat(app: FastifyInstance): void {
  app.post<{ Body: ChatBody }>('/v1/chat', async (request, reply) => {
    const body = request.body;
    if (!body?.publicKey || !body.visitorId || !body.message?.trim()) {
      return reply.code(400).send({ error: 'publicKey, visitorId and message are required' });
    }

    const tenant = await resolveTenant(body.publicKey);
    if (!tenant) return reply.code(404).send({ error: 'unknown key' });

    if (!originAllowed(request.headers.origin, tenant.allowedDomains)) {
      return reply.code(403).send({ error: 'origin not allowed' });
    }

    return withTenant(tenant.id, async (client) => {
      if (await overQuota(client, tenant.id, tenant.monthlyMessageCap)) {
        // Возвращаем осмысленный отказ, а не обрыв соединения: жалоба №1 на Chatbase
        // в research.md — «the agent stops when they run out» без объяснения.
        return reply.code(402).send({ error: 'quota exceeded', retryAfterMonthStart: true });
      }

      // Существующий диалог ищем; новый не заводим до успешного ответа, иначе каждый
      // сбой апстрима оставляет в базе пустую беседу. Идентификатор генерируем заранее —
      // он нужен клиенту в meta-событии раньше, чем строка появится в таблице.
      const existing = await findConversation(client, body.conversationId);
      const conversationId = existing ?? randomUUID();
      const history = existing ? await loadHistory(client, existing) : [];
      // Имя бота и компании берутся из настроек тенанта, а не из заглушки:
      // иначе бот представляется посетителю названием, которого клиент не выбирал.
      const { rows: cfg } = await client.query<{
        bot_name: string; tenant_name: string; vertical: string | null;
        retrieval_overrides: Record<string, number>; profile: Record<string, unknown>;
      }>(
        `SELECT coalesce(w.bot_name, 'Assistant') AS bot_name, t.name AS tenant_name,
                t.vertical, t.retrieval_overrides, t.profile
           FROM tenants t LEFT JOIN widget_configs w ON w.tenant_id = t.id
          WHERE t.id = $1`,
        [tenant.id],
      );

      const vertical = verticalOf(cfg[0]?.vertical);

      // Пороги поиска: значение ниши, поверх него — переопределение клиента.
      const overrides = cfg[0]?.retrieval_overrides ?? {};
      const { hits, approved } = await retrieveAll(client, tenant.id, body.message, {
        minSimilarity: overrides.min_similarity ?? vertical?.retrieval.minSimilarity,
        approvedMinSimilarity:
          overrides.approved_min_similarity ?? vertical?.retrieval.approvedMinSimilarity,
      });

      // Инструменты тенанта загружаются на каждый запрос: тенант мог поменять их
      // в админке минуту назад, а кешировать реестр эндпоинтов — значит какое-то
      // время ходить по адресам, которые он уже отозвал.
      const connectorTools = new Map((await loadTools(client, tenant.id)).map((t) => [t.toolName, t]));

      const quote = await loadQuoteConfig(client, tenant.id);

      const model = modelFor(tenant.modelTier);
      const system = buildSystem({
        botName: cfg[0]?.bot_name ?? 'Assistant',
        companyName: cfg[0]?.tenant_name ?? 'the company',
        localeDefault: body.locale ?? tenant.localeDefault,
        priceGuidance: quote.priceGuidance,
        quoteFields: quote.fields,
        vertical,
        profile: cfg[0]?.profile ?? {},
      });
      const convo: MessageParam[] = [
        ...history,
        { role: 'user', content: buildUserContent(body.message, hits, approved) },
      ];

      const runTurn = () =>
        claude.messages.stream({
          model,
          max_tokens: 1024,
          system,
          tools: [
            CAPTURE_LEAD,
            REPORT_UNANSWERED,
            ...(quote.fields.length > 0 ? [buildQuoteTool(quote.fields)] : []),
            ...[...connectorTools.values()].map(toClaudeTool),
          ],
          messages: convo,
        });

      let stream = runTurn();
      let iterator = stream[Symbol.asyncIterator]();
      let step: Awaited<ReturnType<typeof iterator.next>>;

      // Первый шаг итератора и есть момент обращения к модели. Пока он не прошёл,
      // заголовки не отправляем: иначе сбой апстрима превращается в честный 200
      // с оборванным потоком, по которому клиент не отличит отказ от пустого ответа.
      try {
        step = await iterator.next();
      } catch (err) {
        request.log.error({ err }, 'llm stream failed before first token');
        return reply.code(502).send({ error: 'assistant temporarily unavailable' });
      }

      openSse(reply);
      reply.raw.write(`event: meta\ndata: ${JSON.stringify({ conversationId })}\n\n`);

      const pendingLeads: ToolContext['pendingLeads'] = [];
      const pendingUnanswered: ToolContext['pendingUnanswered'] = [];
      const usage = { in: 0, out: 0, cache: 0 };
      const toolCalls: Array<{ name: string; input: unknown; ok: boolean }> = [];
      let answer = '';

      try {
        // Цикл инструментов (§6 п.5). Три оборота — потолок: дальше это уже не
        // уточнение контакта, а зацикливание, за которое платит клиент.
        for (let turn = 0; ; turn++) {
          for (; !step.done; step = await iterator.next()) {
            const event = step.value;
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              reply.raw.write(`event: delta\ndata: ${JSON.stringify({ t: event.delta.text })}\n\n`);
            }
          }

          const final = await stream.finalMessage();
          usage.in += final.usage.input_tokens;
          usage.out += final.usage.output_tokens;
          usage.cache += final.usage.cache_read_input_tokens ?? 0;
          answer += final.content
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('');

          if (final.stop_reason !== 'tool_use' || turn >= 2) break;

          convo.push({ role: 'assistant', content: final.content });
          const results: Array<{
            type: 'tool_result';
            tool_use_id: string;
            content: string;
            is_error: boolean;
          }> = [];
          for (const block of final.content) {
            if (block.type !== 'tool_use') continue;
            const outcome = await runTool(
              block.name,
              block.input as Record<string, unknown>,
              { client, tenantId: tenant.id, conversationId, pendingLeads, pendingUnanswered, connectorTools },
            );
            // Что именно вызвал бот — часть переписки, а не деталь реализации:
            // без этого в «Диалогах» видно ответ, но не видно, откуда взялись цифры.
            toolCalls.push({ name: block.name, input: block.input, ok: !outcome.isError });
            results.push({
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: outcome.content,
              is_error: outcome.isError,
            });
          }
          convo.push({ role: 'user', content: results });

          stream = runTurn();
          iterator = stream[Symbol.asyncIterator]();
          step = await iterator.next();
        }

        // Всё сохраняется одним куском после успеха. Записывать вопрос до вызова модели
        // нельзя: упавший запрос оставил бы в истории висящую реплику пользователя
        // без ответа, и следующий вызов ушёл бы с двумя user-репликами подряд.
        await persist(client, {
          tenantId: tenant.id,
          conversationId,
          isNewConversation: existing === null,
          visitorId: body.visitorId,
          locale: body.locale ?? tenant.localeDefault,
          question: body.message,
          answer,
          hits,
          model,
          tier: tenant.modelTier,
          usage,
          leads: pendingLeads,
          unanswered: pendingUnanswered,
          toolCalls,
        });

        reply.raw.write('event: done\ndata: {}\n\n');
      } catch (err) {
        // Заголовки уже ушли — сообщить о сбое можно только внутри самого потока.
        // Бросать отсюда нельзя: Fastify попытается отправить 500 поверх открытого
        // ответа и уронит процесс на ERR_HTTP_HEADERS_SENT.
        request.log.error({ err }, 'llm stream failed mid-flight');
        reply.raw.write('event: error\ndata: {"error":"stream interrupted"}\n\n');
      } finally {
        reply.raw.end();
      }
      return reply;
    });
  });
}

function openSse(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
}

/** RLS ограничивает выборку своим тенантом, так что чужой id просто не найдётся. */
async function findConversation(
  client: import('pg').PoolClient,
  id: string | undefined,
): Promise<string | null> {
  if (!id) return null;
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM conversations WHERE id = $1',
    [id],
  );
  return rows[0]?.id ?? null;
}

async function loadHistory(
  client: import('pg').PoolClient,
  conversationId: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { rows } = await client.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM messages
      WHERE conversation_id = $1 AND role <> 'system'
      ORDER BY created_at DESC LIMIT $2`,
    [conversationId, HISTORY_LIMIT],
  );
  return rows.reverse();
}

async function overQuota(
  client: import('pg').PoolClient,
  tenantId: string,
  cap: number | null,
): Promise<boolean> {
  if (cap === null) return false;
  const { rows } = await client.query<{ used: string }>(
    `SELECT coalesce(sum(messages), 0) AS used FROM usage_daily
      WHERE tenant_id = $1 AND date >= date_trunc('month', current_date)`,
    [tenantId],
  );
  return Number(rows[0]?.used ?? 0) >= cap;
}

interface PersistArgs {
  tenantId: string;
  conversationId: string;
  isNewConversation: boolean;
  visitorId: string;
  locale: string;
  question: string;
  answer: string;
  hits: Array<{ id: string }>;
  model: string;
  tier: 'base' | 'premium';
  usage: { in: number; out: number; cache: number };
  leads: Array<{
    email?: string; phone?: string; name?: string; note?: string;
    payload?: Record<string, string>;
  }>;
  unanswered: Array<{ question: string; reason: string }>;
  toolCalls: Array<{ name: string; input: unknown; ok: boolean }>;
}

async function persist(client: import('pg').PoolClient, a: PersistArgs): Promise<void> {
  if (a.isNewConversation) {
    await client.query(
      `INSERT INTO conversations (id, tenant_id, visitor_id, locale) VALUES ($1, $2, $3, $4)`,
      [a.conversationId, a.tenantId, a.visitorId, a.locale],
    );
  }

  await client.query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content) VALUES ($1, $2, 'user', $3)`,
    [a.conversationId, a.tenantId, a.question],
  );

  await client.query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content,
                           tokens_in, tokens_out, cache_read_tokens, model, retrieval_chunk_ids,
                           tool_calls)
     VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8, $9)`,
    [
      a.conversationId,
      a.tenantId,
      a.answer,
      a.usage.in,
      a.usage.out,
      a.usage.cache,
      a.model,
      a.hits.map((h) => h.id),
      a.toolCalls.length > 0 ? JSON.stringify(a.toolCalls) : null,
    ],
  );

  // Вопрос без единого попадания в базу знаний — топливо для отчёта о пробелах
  // в контенте (§10).
  //
  // Успешный вызов инструмента снимает запись: на «какой статус моего заказа»
  // ответил коннектор, и это правильное поведение, а не пробел. Иначе отчёт
  // советовал бы клиенту дописать документ про статусы заказов — то есть
  // руками сделать то, что уже делает CRM.
  // Приоритет у того, что сообщила сама модель: она знает, ответила ли по существу.
  // Пустой поиск — запасной сигнал на случай, если инструмент не был вызван.
  const gaps: Array<{ question: string; reason: string; source: string }> =
    a.unanswered.map((g) => ({ ...g, source: 'model' }));

  // Запасной сигнал пишется, но помечается: он шумит на репликах квалификации,
  // где реплика посетителя — ответ, а не вопрос. В отчёт директору он не попадает.
  if (gaps.length === 0 && a.hits.length === 0 && !a.toolCalls.some((c) => c.ok)) {
    gaps.push({ question: a.question, reason: 'no_retrieval_hit', source: 'fallback' });
  }

  for (const gap of gaps) {
    await client.query(
      `INSERT INTO unanswered_log (tenant_id, conversation_id, question, reason, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [a.tenantId, a.conversationId, gap.question, gap.reason, gap.source],
    );
  }

  await client.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [
    a.conversationId,
  ]);

  await client.query(
    `INSERT INTO usage_daily (tenant_id, date, messages, tokens_in, tokens_out, model_tier)
     VALUES ($1, current_date, 1, $2, $3, $4)
     ON CONFLICT (tenant_id, date, model_tier) DO UPDATE
        SET messages   = usage_daily.messages   + 1,
            tokens_in  = usage_daily.tokens_in  + EXCLUDED.tokens_in,
            tokens_out = usage_daily.tokens_out + EXCLUDED.tokens_out`,
    [a.tenantId, a.usage.in, a.usage.out, a.tier],
  );

  // Лиды пишутся здесь, а не в самом инструменте: диалога в базе ещё не существовало
  // в момент вызова, и внешний ключ conversation_id было бы некуда направить.
  let corrected = false;
  for (const lead of a.leads) {
    // Повторная передача дополняет ту же заявку, а не создаёт вторую.
    // coalesce на каждом поле: во втором вызове модель шлёт только новое,
    // и прямая перезапись стёрла бы контакт, полученный в первом.
    const { rows: [saved] } = await client.query<{
      phone: string | null; email: string | null;
      notified_at: string | null; notified_contact: string | null;
    }>(
      `INSERT INTO leads (tenant_id, conversation_id, name, email, phone, note,
                          payload, quote_completeness)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (conversation_id) WHERE conversation_id IS NOT NULL DO UPDATE
          SET name  = coalesce(EXCLUDED.name,  leads.name),
              email = coalesce(EXCLUDED.email, leads.email),
              phone = coalesce(EXCLUDED.phone, leads.phone),
              note  = coalesce(EXCLUDED.note,  leads.note),
              payload = leads.payload || EXCLUDED.payload,
              quote_completeness = jsonb_array_length(
                to_jsonb(array(SELECT jsonb_object_keys(leads.payload || EXCLUDED.payload))))
       RETURNING phone, email, notified_at, notified_contact`,
      [a.tenantId, a.conversationId, lead.name ?? null, lead.email ?? null,
       lead.phone ?? null, lead.note ?? null,
       JSON.stringify(lead.payload ?? {}), Object.keys(lead.payload ?? {}).length],
    );
    // Исправленный контакт после того, как письмо уже ушло: продавец держит
    // в руках неверный номер и об этом никак не узнает. Единственный случай,
    // когда о заявке отправляется второе письмо.
    if (saved) {
      corrected ||= saved.notified_at !== null && saved.notified_contact !== contactKey(saved);
    }
  }

  // Письмо ставится в очередь, а не отправляется здесь: SMTP отвечает секундами,
  // а посетитель в это время ждёт конца ответа. Постановка идемпотентна по
  // разговору — сколько бы раз модель ни дополнила заявку деталями, письмо одно.
  //
  // Ошибка очереди не должна ронять сохранение разговора: заявка уже в базе,
  // и потерять из-за недоступного Redis всю переписку было бы хуже.
  if (a.leads.length > 0) {
    try {
      await enqueueLeadNotify(
        { tenantId: a.tenantId, conversationId: a.conversationId },
        { force: corrected },
      );
    } catch (err) {
      console.error('lead notify enqueue failed', err);
    }
  }
}
