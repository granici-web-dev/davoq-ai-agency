import { readFile } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { withPlatform, withTenant } from '../db/pool.js';
import { createDocument } from '../ingest/index.js';
import { DRIVE_SYNC_MINUTES, enqueueDriveSyncNow, enqueueIngest, enqueueRecheck } from '../ingest/queue.js';
import { parseQuoteFields } from '../llm/quote.js';
import { listApproved, saveApproved } from '../rag/approved.js';
import { callConnector, formatResult, loadTools } from '../llm/connector.js';
import { encryptSecret } from '../llm/secrets.js';
import { assertPublicUrl } from '../llm/ssrf.js';
import { auditTheme, normalizeTheme, PRESETS, type Theme } from '../shared/theme.js';
import {
  buildWhere, CSV_PREAMBLE, csvRow, listConversations, type ConversationFilters,
} from './conversations.js';
import {
  hashToken, newToken, readCookie, SESSION_COOKIE, SESSION_TTL_DAYS, sessionCookie, verifyPassword,
} from './session.js';

interface Session {
  userId: string;
  tenantId: string;
  email: string;
}

export function registerAdmin(app: FastifyInstance): void {
  app.get('/admin', async (_req, reply) =>
    reply.type('text/html').send(await readFile(new URL('../../../dist/admin.html', import.meta.url), 'utf8')),
  );
  // Шрифт отдаётся с нашего сервера, а не с fonts.gstatic.com: продукт продаётся
  // как DSGVO-native, и обращение браузера к Google за шрифтом этому противоречит.
  app.get<{ Params: { '*': string } }>('/admin/fonts/*', async (request, reply) => {
    const name = request.params['*'];
    if (!/^[\w.-]+\.woff2$/.test(name)) return reply.code(400).send();
    return reply
      .type('font/woff2')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(await readFile(new URL(`../../../dist/fonts/${name}`, import.meta.url)));
  });

  // Логотип тоже с нашего сервера: панель не должна дёргать сайт клиента,
  // иначе его падение или смена CMS ломает шапку админки.
  app.get<{ Params: { '*': string } }>('/admin/brand/*', async (request, reply) => {
    const name = request.params['*'];
    if (!/^[\w.-]+\.(svg|png|webp)$/.test(name)) return reply.code(400).send();
    const type = name.endsWith('.svg') ? 'image/svg+xml'
      : name.endsWith('.png') ? 'image/png' : 'image/webp';
    return reply
      .type(type)
      .header('cache-control', 'public, max-age=86400')
      .send(await readFile(new URL(`../../../dist/brand/${name}`, import.meta.url)));
  });

  app.get('/admin.js', async (_req, reply) =>
    reply
      .type('application/javascript; charset=utf-8')
      .send(await readFile(new URL('../../../dist/admin.js', import.meta.url), 'utf8')),
  );

  app.post<{ Body: { email?: string; password?: string } }>(
    '/admin/api/login',
    async (request, reply) => {
      const { email, password } = request.body ?? {};
      if (!email || !password) return reply.code(400).send({ error: 'email и password обязательны' });

      const user = await withPlatform(async (client) => {
        const { rows } = await client.query<{
          id: string; tenant_id: string | null; email: string; password_hash: string;
        }>('SELECT id, tenant_id, email, password_hash FROM admin_users WHERE lower(email) = lower($1)', [email]);
        return rows[0];
      });

      // Пароль проверяем даже когда пользователя нет: иначе разница во времени ответа
      // превращает форму входа в средство перебора существующих адресов.
      const ok = await verifyPassword(
        password,
        user?.password_hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      );
      if (!user || !ok || !user.tenant_id) return reply.code(401).send({ error: 'неверные данные' });

      const token = newToken();
      const ttl = SESSION_TTL_DAYS * 24 * 3600;
      await withPlatform((client) =>
        client.query(
          `INSERT INTO admin_sessions (token_hash, user_id, expires_at)
           VALUES ($1, $2, now() + make_interval(secs => $3))`,
          [hashToken(token), user.id, ttl],
        ),
      );

      return reply.header('set-cookie', sessionCookie(token, ttl)).send({ email: user.email });
    },
  );

  app.post('/admin/api/logout', async (request, reply) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) {
      await withPlatform((c) => c.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)]));
    }
    return reply.header('set-cookie', sessionCookie('', 0)).send({ ok: true });
  });

  /** Все маршруты ниже требуют сессии и работают строго в тенантном контексте. */
  const guarded = <B, Q>(
    handler: (args: {
      session: Session; client: pg.PoolClient; body: B; query: Q; request: FastifyRequest;
    }) => Promise<unknown>,
  ) =>
    async (request: FastifyRequest, reply: import('fastify').FastifyReply): Promise<unknown> => {
      const session = await loadSession(request);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });
      try {
        return await withTenant(session.tenantId, (client) =>
          handler({
            session, client,
            body: request.body as B,
            query: request.query as Q,
            request,
          }),
        );
      } catch (err) {
        // Отказ валидации — это ответ тенанту, а не сбой сервера. Без этого
        // осмысленное «адрес ведёт в частную сеть» превращается в HTTP 500,
        // и вся проверка при сохранении теряет смысл.
        request.log.warn({ err }, 'admin request rejected');
        return reply.code(422).send({ error: (err as Error).message });
      }
    };

  app.get('/admin/api/me', guarded(async ({ session, client }) => {
    const { rows } = await client.query<{
      name: string; plan: string; public_key: string; logo_url: string | null;
    }>('SELECT name, plan, public_key, logo_url FROM tenants WHERE id = $1', [session.tenantId]);
    return { email: session.email, tenant: rows[0] };
  }));

  // ── 1. База знаний ──────────────────────────────────────────────────────────
  app.get('/admin/api/documents', guarded(async ({ client }) => {
    const { rows } = await client.query(
      `SELECT d.id, d.filename, d.source_url, d.status, d.error_text, d.uploaded_at, d.indexed_at,
              count(c.id)::int AS chunk_count
         FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
        GROUP BY d.id ORDER BY d.uploaded_at DESC`,
    );
    return rows;
  }));

  /** Добавление страницы по адресу. Разбор уходит в очередь, ответ — сразу. */
  app.post('/admin/api/documents', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const b = request.body as { url?: string };
    if (!b?.url?.trim()) return reply.code(400).send({ error: 'Indicați adresa paginii' });

    try {
      const id = await createDocument(session.tenantId, {
        filename: b.url.trim(), sourceUrl: b.url.trim(), mime: 'text/html',
      });
      await enqueueIngest({ tenantId: session.tenantId, documentId: id });
      await withTenant(session.tenantId, (client) =>
        audit(client, session, 'document.create', id, { url: b.url }),
      );
      return reply.code(202).send({ id });
    } catch (err) {
      // Лимиты тарифа и прочие отказы читает человек в админке (§7 п.1).
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  /** Загрузка файла. Байты складываются в хранилище, разбор — в очередь. */
  app.post('/admin/api/documents/upload', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Fișierul nu a ajuns la server' });

    try {
      const bytes = await file.toBuffer();
      const id = await createDocument(session.tenantId, {
        filename: file.filename,
        mime: file.mimetype,
        bytes,
      });
      await enqueueIngest({ tenantId: session.tenantId, documentId: id });
      await withTenant(session.tenantId, (client) =>
        audit(client, session, 'document.upload', id, { filename: file.filename, size: bytes.length }),
      );
      return reply.code(202).send({ id });
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  /** Повторная попытка для документа со статусом failed. */
  app.post<{ Params: { id: string } }>('/admin/api/documents/:id/retry', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    // Статус сбрасывается сразу, а не когда воркер дойдёт до задания: пока строка
    // остаётся failed, панель считает, что обрабатывать нечего, и не обновляет её.
    await withTenant(session.tenantId, (client) =>
      client.query(
        `UPDATE documents SET status = 'uploaded', error_text = NULL WHERE id = $1`,
        [request.params.id],
      ),
    );
    await enqueueIngest({ tenantId: session.tenantId, documentId: request.params.id });
    return reply.code(202).send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/admin/api/documents/:id', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await withTenant(session.tenantId, async (client) => {
      await client.query('DELETE FROM documents WHERE id = $1', [request.params.id]);
      await audit(client, session, 'document.delete', request.params.id, {});
    });
    // Материала стало меньше — часть закрытых вопросов могла осиротеть.
    await enqueueRecheck(session.tenantId, { includeResolved: true });
    return reply.code(204).send();
  });

  // ── 2. Внешний вид ──────────────────────────────────────────────────────────
  app.get('/admin/api/appearance', guarded(async ({ client, session }) => {
    const { rows } = await client.query<{
      bot_name: string; avatar_url: string | null; position: string;
      theme: Partial<Theme>; welcome_message: Record<string, string>;
      ai_disclosure_text: Record<string, string>;
    }>('SELECT * FROM widget_configs WHERE tenant_id = $1', [session.tenantId]);

    const theme = normalizeTheme(rows[0]?.theme);
    return {
      botName: rows[0]?.bot_name ?? 'Assistant',
      avatarUrl: rows[0]?.avatar_url ?? null,
      position: rows[0]?.position ?? 'bottom-right',
      theme,
      welcomeMessage: rows[0]?.welcome_message ?? {},
      aiDisclosureText: rows[0]?.ai_disclosure_text ?? {},
      warnings: auditTheme(theme),
      presets: PRESETS,
    };
  }));

  app.put('/admin/api/appearance', guarded(async ({ client, session, body }) => {
    const b = body as {
      botName?: string; avatarUrl?: string | null; position?: string;
      theme?: Partial<Theme>; welcomeMessage?: Record<string, string>;
      aiDisclosureText?: Record<string, string>;
    };
    const theme = normalizeTheme(b.theme);

    await client.query(
      `UPDATE widget_configs
          SET bot_name = coalesce($2, bot_name),
              avatar_url = $3,
              position = coalesce($4, position),
              theme = $5,
              welcome_message = coalesce($6, welcome_message),
              ai_disclosure_text = coalesce($7, ai_disclosure_text),
              updated_at = now()
        WHERE tenant_id = $1`,
      [
        session.tenantId, b.botName ?? null, b.avatarUrl ?? null, b.position ?? null,
        JSON.stringify(theme),
        b.welcomeMessage ? JSON.stringify(b.welcomeMessage) : null,
        b.aiDisclosureText ? JSON.stringify(b.aiDisclosureText) : null,
      ],
    );
    await audit(client, session, 'appearance.update', null, { theme });

    // Предупреждения возвращаются, но не блокируют: contrast guard всё равно
    // подставит читаемый цвет текста. Тенант должен видеть проблему, а не упереться в неё.
    return { theme, warnings: auditTheme(theme) };
  }));

  // ── 6. Установка ────────────────────────────────────────────────────────────
  app.get('/admin/api/install', guarded(async ({ client, session, request }) => {
    const { rows } = await client.query<{ allowed_domains: string[]; public_key: string }>(
      'SELECT allowed_domains, public_key FROM tenants WHERE id = $1', [session.tenantId],
    );
    // headers.host, а не request.hostname: последний отбрасывает порт, и сниппет
    // с локального или нестандартного порта указывал бы в никуда.
    const origin = `${request.protocol}://${request.headers.host ?? request.hostname}`;
    return {
      domains: rows[0]?.allowed_domains ?? [],
      snippet: `<script async src="${origin}/widget.js" data-key="${rows[0]?.public_key ?? ''}"></script>`,
    };
  }));

  app.put('/admin/api/install', guarded(async ({ client, session, body }) => {
    const domains = ((body as { domains?: string[] }).domains ?? [])
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    await client.query('UPDATE tenants SET allowed_domains = $2 WHERE id = $1', [session.tenantId, domains]);
    await audit(client, session, 'install.domains', null, { domains });
    return { domains };
  }));


  // ── 3. Коннекторы и инструменты (§8) ────────────────────────────────────────

  app.get('/admin/api/connectors', guarded(async ({ client }) => {
    const [connectors, tools] = await Promise.all([
      // secret_encrypted не отдаётся никогда — ни целиком, ни частями.
      // Наружу торчит только факт «секрет задан».
      client.query(`SELECT id, type, name, base_url, headers_template, status, created_at,
                           secret_encrypted IS NOT NULL AS has_secret
                      FROM connectors ORDER BY created_at`),
      client.query(`SELECT id, connector_id, tool_name, description, input_schema, http_method,
                           path_template, body_template, response_instructions, enabled
                      FROM connector_tools ORDER BY tool_name`),
    ]);
    return { connectors: connectors.rows, tools: tools.rows };
  }));

  app.post('/admin/api/connectors', guarded(async ({ client, session, body }) => {
    const b = body as {
      name?: string; baseUrl?: string; headersTemplate?: Record<string, string>; secret?: string;
    };
    if (!b.name?.trim() || !b.baseUrl?.trim()) throw new Error('Sunt necesare numele și adresa de bază');

    // Адрес проверяется при сохранении, а не только при вызове: тенант должен
    // узнать об отказе в форме, а не через молчащего бота неделю спустя.
    await assertPublicUrl(b.baseUrl.trim());

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO connectors (tenant_id, name, base_url, headers_template, secret_encrypted)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        session.tenantId, b.name.trim(), b.baseUrl.trim(),
        JSON.stringify(b.headersTemplate ?? {}),
        b.secret?.trim() ? encryptSecret(b.secret.trim()) : null,
      ],
    );
    await audit(client, session, 'connector.create', rows[0]!.id, { baseUrl: b.baseUrl });
    return { id: rows[0]!.id };
  }));

  app.delete<{ Params: { id: string } }>('/admin/api/connectors/:id', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await withTenant(session.tenantId, async (client) => {
      await client.query('DELETE FROM connectors WHERE id = $1', [request.params.id]);
      await audit(client, session, 'connector.delete', request.params.id, {});
    });
    return reply.code(204).send();
  });

  app.post('/admin/api/tools', guarded(async ({ client, session, body }) => {
    const b = body as {
      connectorId?: string; toolName?: string; description?: string;
      inputSchema?: Record<string, unknown>; httpMethod?: string; pathTemplate?: string;
      bodyTemplate?: Record<string, unknown> | null; responseInstructions?: string;
    };
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO connector_tools (connector_id, tenant_id, tool_name, description, input_schema,
                                    http_method, path_template, body_template, response_instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        b.connectorId, session.tenantId, b.toolName, b.description ?? '',
        JSON.stringify(b.inputSchema ?? { type: 'object', properties: {} }),
        b.httpMethod ?? 'GET', b.pathTemplate ?? '/',
        b.bodyTemplate ? JSON.stringify(b.bodyTemplate) : null,
        b.responseInstructions ?? '',
      ],
    );
    await audit(client, session, 'tool.create', rows[0]!.id, { toolName: b.toolName });
    return { id: rows[0]!.id };
  }));

  app.delete<{ Params: { id: string } }>('/admin/api/tools/:id', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await withTenant(session.tenantId, async (client) => {
      await client.query('DELETE FROM connector_tools WHERE id = $1', [request.params.id]);
      await audit(client, session, 'tool.delete', request.params.id, {});
    });
    return reply.code(204).send();
  });

  /**
   * Тестовый вызов (§10 п.3). Показывает сырой ответ — тенант должен увидеть, что
   * реально вернул его сервис, а не нашу интерпретацию. Идёт через тот же путь,
   * что и вызов из чата, включая SSRF-проверку и лимиты.
   */
  app.post<{ Params: { id: string } }>('/admin/api/tools/:id/test', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    return withTenant(session.tenantId, async (client) => {
      const tools = await loadTools(client, session.tenantId);
      const tool = tools.find((t) => t.id === request.params.id);
      if (!tool) return reply.code(404).send({ error: 'Instrumentul nu există sau este dezactivat' });

      const input = (request.body as { input?: Record<string, unknown> })?.input ?? {};
      const result = await callConnector(tool, input);
      return reply.send({
        status: result.status,
        truncated: result.truncated,
        error: result.error ?? null,
        raw: result.body.slice(0, 8000),
        asModelSees: formatResult(tool, result),
      });
    });
  });

  /**
   * Проверка установки (§10 п.6): забираем страницу клиента и ищем свой скрипт.
   * Через ту же SSRF-защиту — адрес вводит пользователь, запрос делаем мы.
   */
  app.post('/admin/api/install/verify', guarded(async ({ client, session, body, request }) => {
    const url = (body as { url?: string })?.url?.trim();
    if (!url) throw new Error('Indicați adresa paginii');

    const { rows } = await client.query<{ public_key: string }>(
      'SELECT public_key FROM tenants WHERE id = $1', [session.tenantId],
    );
    const key = rows[0]?.public_key ?? '';

    try {
      await assertPublicUrl(url);
      const res = await fetch(url, {
        headers: { 'user-agent': 'AssistWidgetBot/0.1 (+verify)' },
        signal: AbortSignal.timeout(10_000),
      });
      const html = (await res.text()).slice(0, 512 * 1024);
      const host = request.headers.host ?? '';
      return {
        reachable: res.ok,
        status: res.status,
        scriptFound: html.includes('/widget.js') && html.includes(host),
        keyFound: key !== '' && html.includes(key),
      };
    } catch (err) {
      return { reachable: false, status: null, scriptFound: false, keyFound: false,
               error: (err as Error).message };
    }
  }));


  // ── База знаний из Google Drive ─────────────────────────────────────────────

  app.get('/admin/api/drive', guarded(async ({ client }) => {
    const { rows } = await client.query<{ config: Record<string, unknown> }>(
      `SELECT config FROM connectors WHERE type = 'google_drive' AND status = 'active' LIMIT 1`,
    );
    if (!rows[0]) return { connected: false };
    const cfg = rows[0].config;

    // Итог загрузки показывается там же, где её сделали. Ссылка «смотрите в
    // Analize» этого не заменяет: экран, на который надо перейти, чтобы узнать
    // результат своего действия, не смотрит никто.
    const { rows: closed } = await client.query<{ n: string }>(
      `SELECT count(DISTINCT lower(question)) AS n FROM unanswered_log
        WHERE source = 'model' AND status = 'resolved'
          AND resolved_at >= now() - interval '48 hours'`,
    );
    // Обратная сторона того же: убранный файл унёс с собой тему из ответов.
    const { rows: reopened } = await client.query<{ n: string }>(
      `SELECT count(DISTINCT lower(question)) AS n FROM unanswered_log
        WHERE source = 'model' AND status = 'open'
          AND reopened_at >= now() - interval '48 hours'`,
    );

    return {
      connected: true,
      folderId: cfg.folderId ?? null,
      lastSyncAt: cfg.lastSyncAt ?? null,
      lastResult: cfg.lastResult ?? null,
      everyMinutes: DRIVE_SYNC_MINUTES,
      closedRecently: Number(closed[0]?.n ?? 0),
      reopenedRecently: Number(reopened[0]?.n ?? 0),
    };
  }));

  /** Кнопка «синхронизировать сейчас»: ждать четверть часа после загрузки файла незачем. */
  app.post('/admin/api/drive/sync', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await enqueueDriveSyncNow(session.tenantId);
    return reply.code(202).send({ ok: true });
  });

  // ── 4. Диалоги ──────────────────────────────────────────────────────────────
  app.get('/admin/api/conversations', guarded(async ({ client, query }) => {
    const q = query as Record<string, string>;
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);
    return listConversations(client, filtersFrom(q), limit, offset);
  }));

  app.get<{ Params: { id: string } }>('/admin/api/conversations/:id', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    return withTenant(session.tenantId, async (client) => {
      const [msgs, lead, gaps, fields] = await Promise.all([
        client.query(
          `SELECT role, content, created_at, model, tokens_in, tokens_out, tool_calls
             FROM messages WHERE conversation_id = $1 ORDER BY created_at`,
          [request.params.id]),
        client.query(
          `SELECT name, email, phone, payload, quote_completeness
             FROM leads WHERE conversation_id = $1`, [request.params.id]),
        client.query(
          `SELECT question, reason FROM unanswered_log
            WHERE conversation_id = $1 AND source = 'model'`, [request.params.id]),
        client.query<{ quote_fields: unknown }>(
          'SELECT quote_fields FROM tenants WHERE id = $1', [session.tenantId]),
      ]);
      // Переписка, заявка и пробелы вместе: разбирая разговор, человек смотрит
      // не «что бот сказал», а «чем всё кончилось и чего не хватило».
      // Названия полей отдаём вместе с заявкой: без них панель показывает
      // ключи вида `product_type`, тогда как в письме о той же заявке стоит
      // «Tipul produsului». Директор приходит сюда по ссылке из письма, и
      // расхождение читается как «это другая заявка».
      return reply.send({
        messages: msgs.rows,
        lead: lead.rows[0] ?? null,
        gaps: gaps.rows,
        fieldLabels: Object.fromEntries(
          parseQuoteFields(fields.rows[0]?.quote_fields).map((f) => [f.key, f.label]),
        ),
      });
    });
  });

  /**
   * Выгрузка. Два уровня, потому что задачи разные: по разговорам — свести
   * воронку и посчитать заявки; по репликам — читать и размечать, что бот
   * ответил не так. Одна таблица для обеих задач неудобна в обеих.
   */
  app.get('/admin/api/conversations/export', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const q = request.query as Record<string, string>;
    const byMessage = q.level === 'message';
    const filters = filtersFrom(q);

    return withTenant(session.tenantId, async (client) => {
      const params: unknown[] = [];
      const where = buildWhere(filters, params);

      const sql = byMessage
        ? `SELECT c.id AS conversation_id, c.started_at, c.locale,
                  m.created_at, m.role, m.content, m.model, m.tokens_in, m.tokens_out,
                  m.tool_calls
             FROM conversations c JOIN messages m ON m.conversation_id = c.id
             ${where} ORDER BY c.started_at DESC, m.created_at`
        : `SELECT c.id, c.started_at, c.last_message_at, c.locale, c.status,
                  (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS messages,
                  (SELECT count(*) FROM unanswered_log u
                    WHERE u.conversation_id = c.id AND u.source = 'model') AS gaps,
                  l.name, l.email, l.phone, l.quote_completeness, l.payload,
                  (SELECT m.content FROM messages m WHERE m.conversation_id = c.id
                    AND m.role = 'user' ORDER BY m.created_at LIMIT 1) AS first_question
             FROM conversations c LEFT JOIN leads l ON l.conversation_id = c.id
             ${where} ORDER BY c.started_at DESC`;

      const { rows, fields } = await client.query(sql, params);
      const stamp = new Date().toISOString().slice(0, 10);

      let csv = CSV_PREAMBLE + csvRow(fields.map((f) => f.name));
      for (const row of rows) {
        csv += csvRow(fields.map((f) => {
          const v = (row as Record<string, unknown>)[f.name];
          return v && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
        }));
      }

      await audit(client, session, 'conversations.export', null,
        { level: byMessage ? 'message' : 'conversation', rows: rows.length, filters });

      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition',
          `attachment; filename="conversations-${byMessage ? 'messages' : 'summary'}-${stamp}.csv"`)
        .send(csv);
    });
  });

  // ── 4б. Утверждённые ответы ─────────────────────────────────────────────────
  app.get('/admin/api/approved', guarded(async ({ client }) => listApproved(client)));

  app.post('/admin/api/approved', guarded(async ({ client, session, body }) => {
    const b = body as { question?: string; answer?: string; conversationId?: string };
    const id = await saveApproved(client, session.tenantId, {
      question: b.question ?? '',
      answer: b.answer ?? '',
      conversationId: b.conversationId ?? null,
    });
    // В журнал попадает и текст: правка слов бота — то действие, про которое
    // через месяц спрашивают «кто это написал и когда».
    await audit(client, session, 'approved.save', id, {
      question: b.question ?? '', answer: b.answer ?? '',
    });
    return { id };
  }));

  app.delete<{ Params: { id: string } }>('/admin/api/approved/:id',
    guarded(async ({ client, session, request }) => {
      const { id } = request.params as { id: string };
      await client.query('DELETE FROM approved_answers WHERE id = $1', [id]);
      await audit(client, session, 'approved.delete', id, {});
      return { ok: true };
    }));

  // ── 5. Инсайты и расход ─────────────────────────────────────────────────────
  app.get('/admin/api/insights', guarded(async ({ client, session }) => {
    const [usage, unanswered, closed, leads, cap] = await Promise.all([
      client.query(
        `SELECT date, messages, widget_loads, tokens_in, tokens_out FROM usage_daily
          WHERE date >= current_date - 29 ORDER BY date`),
      // Ключевая для удержания вещь (§10): показывает клиенту, какой документ
      // написать следующим. Одинаковые вопросы схлопываем — важна частота.
      client.query(
        // Только то, о чём сообщила сама модель: запасной детектор шумит
        // на репликах квалификации и в отчёт директору не идёт.
        `SELECT lower(question) AS question, count(*)::int AS times, max(created_at) AS last_seen
           FROM unanswered_log
          WHERE created_at >= now() - interval '30 days' AND source = 'model'
            AND status = 'open'
          GROUP BY 1 ORDER BY times DESC, last_seen DESC LIMIT 50`),
      // Закрытые показываются отдельно и с ответом: это единственное место,
      // где директор видит, что его загрузка что-то починила, — и заодно может
      // заметить, что бот отвечает не то.
      client.query(
        `SELECT lower(question) AS question, count(*)::int AS times,
                max(resolved_at) AS resolved_at,
                (array_agg(resolved_answer ORDER BY resolved_at DESC))[1] AS answer
           FROM unanswered_log
          WHERE source = 'model' AND status = 'resolved'
            AND resolved_at >= now() - interval '30 days'
          GROUP BY 1 ORDER BY max(resolved_at) DESC LIMIT 20`),
      client.query(
        `SELECT id, name, email, phone, note, created_at, conversation_id,
                notified_at, notify_error
           FROM leads ORDER BY created_at DESC LIMIT 100`),
      client.query<{ monthly_message_cap: number | null; plan: string;
                     lead_notify_email: string | null }>(
        `SELECT monthly_message_cap, plan, lead_notify_email
           FROM tenants WHERE id = $1`, [session.tenantId]),
    ]);

    const { rows: used } = await client.query<{ used: string }>(
      `SELECT coalesce(sum(messages), 0) AS used FROM usage_daily
        WHERE date >= date_trunc('month', current_date)`);

    return {
      usage: usage.rows,
      unanswered: unanswered.rows,
      closed: closed.rows,
      leads: leads.rows,
      notifyEmail: cap.rows[0]?.lead_notify_email ?? '',
      quota: {
        plan: cap.rows[0]?.plan ?? 'starter',
        cap: cap.rows[0]?.monthly_message_cap ?? null,
        usedThisMonth: Number(used[0]?.used ?? 0),
      },
    };
  }));

  // Адрес, на который уходят заявки. Пустая строка — осознанное «не слать»:
  // клиент может решить, что ему хватает панели, и это не то же самое,
  // что незаполненное поле, о котором забыли.
  app.put('/admin/api/lead-notify',
    guarded<{ email?: string }, unknown>(async ({ client, session, body }) => {
      const email = (body?.email ?? '').trim();
      if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
        return { error: 'Adresa de email nu pare validă.' };
      }
      await client.query('UPDATE tenants SET lead_notify_email = $2 WHERE id = $1',
        [session.tenantId, email || null]);
      await audit(client, session, 'lead_notify.update', null, { email: email || null });
      return { ok: true, email };
    }));
}

/** Разбор фильтров из строки запроса — один на список и на выгрузку. */
function filtersFrom(q: Record<string, string>): ConversationFilters {
  return {
    ...(q.from ? { from: q.from } : {}),
    ...(q.to ? { to: q.to } : {}),
    ...(q.q?.trim() ? { q: q.q.trim() } : {}),
    ...(q.locale ? { locale: q.locale } : {}),
    hasLead: q.hasLead === 'true',
    hasGap: q.hasGap === 'true',
  };
}

async function loadSession(request: FastifyRequest): Promise<Session | null> {
  const token = readCookie(request.headers.cookie, SESSION_COOKIE);
  if (!token) return null;

  return withPlatform(async (client) => {
    const { rows } = await client.query<{ user_id: string; tenant_id: string | null; email: string }>(
      `SELECT s.user_id, u.tenant_id, u.email
         FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows[0];
    return row?.tenant_id ? { userId: row.user_id, tenantId: row.tenant_id, email: row.email } : null;
  });
}

/** §11: действия администратора протоколируются, изменения коннекторов — в первую очередь. */
async function audit(
  client: pg.PoolClient, session: Session, action: string,
  target: string | null, detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, target, detail) VALUES ($1, $2, $3, $4, $5)`,
    [session.tenantId, session.userId, action, target, JSON.stringify(detail)],
  );
}
