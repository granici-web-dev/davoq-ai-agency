import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { withPlatform, withTenant } from '../db/pool.js';
import { STRINGS, type Locale } from '../shared/i18n.js';
import { normalizeTheme } from '../shared/theme.js';
import { originAllowed, resolveTenant } from './auth.js';

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
      await client.query(
        `INSERT INTO usage_daily (tenant_id, date, widget_loads, model_tier)
         VALUES ($1, current_date, 1, 'base')
         ON CONFLICT (tenant_id, date, model_tier)
         DO UPDATE SET widget_loads = usage_daily.widget_loads + 1`,
        [tenant.id],
      );

      const cfg = rows[0];
      return reply.send({
        botName: cfg?.bot_name ?? 'Assistant',
        avatarUrl: cfg?.avatar_url ?? null,
        position: cfg?.position ?? 'bottom-right',
        localeDefault: tenant.localeDefault,
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

    await withTenant(tenant.id, (client) =>
      client.query(
        `INSERT INTO leads (tenant_id, conversation_id, name, email, phone, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenant.id,
          b.conversationId ?? null,
          b.name?.trim() || null,
          b.email?.trim() || null,
          b.phone?.trim() || null,
          b.note?.trim() || null,
        ],
      ),
    );

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

export { withPlatform };
