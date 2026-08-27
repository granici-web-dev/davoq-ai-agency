import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { withPlatform, withTenant } from '../db/pool.js';
import { STRINGS, type Locale } from '../shared/i18n.js';
import { normalizeTheme } from '../shared/theme.js';
import { findConversationForVisitor, originAllowed, resolveTenant } from './auth.js';
import { sanitizeOptional, sanitizeText } from '../shared/text.js';

export function registerWidget(app: FastifyInstance): void {
  /**
   * Виджет исполняется на домене клиента, то есть все его запросы — кросс-доменные.
   * Разрешаем любой источник: pk_ и так публичен, он лежит в HTML клиента. Настоящая
   * проверка — заголовок Origin на /v1/chat, который страница подделать не может.
   */
  app.addHook('onSend', async (request, reply) => {
    if (!request.url.startsWith('/v1/')) return;
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-headers', 'content-type');
    reply.header('access-control-max-age', '86400');
  });

  app.options('/v1/*', async (_request, reply) => reply.code(204).send());

  app.get('/widget.js', async (_request, reply) => {
    const bundle = await readFile(new URL('../../../dist/widget.js', import.meta.url), 'utf8');
    return reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .send(bundle);
  });

  app.get<{ Querystring: { key?: string } }>('/v1/widget/config', async (request, reply) => {
    const key = request.query.key;
    if (!key) return reply.code(400).send({ error: 'key required' });

    const tenant = await resolveTenant(key);
    if (!tenant) return reply.code(404).send({ error: 'unknown key' });

    // Языки берутся из резолва тенанта, а не отдельным запросом: прежде здесь
    // было два захода в пул на один просмотр страницы, а соединений в пуле
    // столько, что их стоит считать.
    const supported = tenant.supportedLocales;

    // Показ засчитывается только с разрешённого домена. Сама конфигурация
    // отдаётся кому угодно — в ней нет ничего, чего нет в HTML клиента, — но
    // счётчик показов это знаменатель конверсии, и накрутить его анонимным
    // curl'ом означало бы показывать клиенту, что виджет работает хуже, чем есть.
    const countable = originAllowed(request.headers.origin, tenant.allowedDomains);

    return withTenant(tenant.id, async (client) => {
      const { rows } = await client.query<{
        bot_name: string;
        avatar_url: string | null;
        position: string;
        theme: Record<string, string>;
        welcome_message: Record<string, string>;
        ai_disclosure_text: Record<string, string>;
      }>('SELECT * FROM widget_configs WHERE tenant_id = $1', [tenant.id]);

      // Показ засчитывается здесь: виджет запрашивает конфигурацию один раз
      // на просмотр страницы. Счёт грубый — сюда попадают и поисковые роботы, —
      // но порядок величины он даёт, а без порядка величины заявки не с чем сравнить.
      if (countable) {
        await client.query(
          `INSERT INTO usage_daily (tenant_id, date, widget_loads, model_tier)
           VALUES ($1, current_date, 1, 'base')
           ON CONFLICT (tenant_id, date, model_tier)
           DO UPDATE SET widget_loads = usage_daily.widget_loads + 1`,
          [tenant.id],
        );
      }

      const cfg = rows[0];
      return reply.send({
        botName: cfg?.bot_name ?? 'Assistant',
        avatarUrl: cfg?.avatar_url ?? null,
        position: cfg?.position ?? 'bottom-right',
        localeDefault: tenant.localeDefault,
        // Языки, на которых клиент готов разговаривать. Виджет не должен
        // здороваться на языке, на котором бот не сможет ответить.
        supportedLocales: supported.length > 0 ? supported : [tenant.localeDefault],
        theme: normalizeTheme(cfg?.theme as never),
        welcomeMessage: cfg?.welcome_message ?? {},
        // AI Act Art. 50(1): текст можно поменять, убрать — нельзя. Пустой объект
        // в базе означает «тенант не настраивал», а не «тенант отключил».
        aiDisclosureText: withDefaults(cfg?.ai_disclosure_text),
      });
    });
  });

  app.post<{
    Body: {
      publicKey?: string;
      conversationId?: string;
      visitorId?: string;
      name?: string;
      email?: string;
      phone?: string;
      note?: string;
    };
  }>('/v1/lead', async (request, reply) => {
    const b = request.body ?? {};
    if (!b.publicKey) return reply.code(400).send({ error: 'publicKey required' });
    if (!b.email?.trim() && !b.phone?.trim()) {
      return reply.code(400).send({ error: 'email or phone required' });
    }

    const tenant = await resolveTenant(b.publicKey);
    if (!tenant) return reply.code(404).send({ error: 'unknown key' });
    if (!originAllowed(request.headers.origin, tenant.allowedDomains)) {
      return reply.code(403).send({ error: 'origin not allowed' });
    }

    await withTenant(tenant.id, async (client) => {
      // Разговор привязывается, только если он существует, принадлежит этому
      // клиенту И этому посетителю. Идентификатор приходит из тела запроса,
      // а `Origin` подделывается обычным curl — то есть сюда можно прислать
      // чужой UUID. Записанный как есть, он ломал настоящую заявку того
      // клиента: уникальность была общей на всю платформу, ON CONFLICT бился
      // о невидимую под RLS строку и валил транзакцию ответа целиком.
      //
      // Проверки клиента оказалось мало. `ON CONFLICT ... DO UPDATE` ниже
      // дополняет ЧУЖУЮ заявку: прислав идентификатор чужого разговора,
      // посторонний переписывал имя и телефон в заявке, которую отдел продаж
      // уже держит в работе, — и продавец звонил по подставленному номеру.
      // Модель для этого не нужна вовсе, достаточно одного POST.
      //
      // Не найден — заявка сохраняется без привязки, а не отклоняется. Случай
      // законный: виджет получает идентификатор в meta раньше, чем разговор
      // попадает в базу, и при сбое модели разговора так и не появится.
      // Терять из-за этого контакт — хуже, чем потерять привязку.
      let linked: string | null = null;
      if (b.conversationId && UUID.test(b.conversationId)) {
        linked = b.visitorId
          ? await findConversationForVisitor(client, b.conversationId, sanitizeText(b.visitorId, 200))
          : null;
        if (!linked) request.log.info(
          { tenantId: tenant.id, conversationId: b.conversationId },
          'заявка с чужим или неизвестным разговором — сохранена без привязки',
        );
      }

      await client.query(
        `INSERT INTO leads (tenant_id, conversation_id, name, email, phone, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, conversation_id) WHERE conversation_id IS NOT NULL
         DO UPDATE SET
           name  = coalesce(excluded.name,  leads.name),
           email = coalesce(excluded.email, leads.email),
           phone = coalesce(excluded.phone, leads.phone),
           note  = coalesce(excluded.note,  leads.note)`,
        [
          tenant.id,
          linked,
          sanitizeOptional(b.name, 200),
          sanitizeOptional(b.email, 320),
          sanitizeOptional(b.phone, 60),
          sanitizeOptional(b.note, 4000),
        ],
      );
    });

    return reply.code(201).send({ ok: true });
  });
}

/** Тенант мог перевести надпись не на все языки — недостающие берём из бандла виджета. */
function withDefaults(custom: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [locale, strings] of Object.entries(STRINGS)) {
    out[locale] = custom?.[locale as Locale]?.trim() || strings.disclosure;
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { withPlatform };
