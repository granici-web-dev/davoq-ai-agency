import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { withPlatform, withTenant } from '../db/pool.js';
import { portalAgents } from '../billing/agents.js';
import { createDocument } from '../ingest/index.js';
import { get as storageGet } from '../ingest/storage.js';
import { DRIVE_SYNC_MINUTES, enqueueDriveSyncNow, enqueueIngest, enqueueRecheck } from '../ingest/queue.js';
import { parseQuoteFields } from '../llm/quote.js';
import { listApproved, saveApproved } from '../rag/approved.js';
import { callConnector, formatResult, loadTools } from '../llm/connector.js';
import { encryptSecret } from '../llm/secrets.js';
import { assertPublicUrl } from '../llm/ssrf.js';
import { entitlementOf } from '../billing/entitlement.js';
import { CANCELED_DAYS, CONVERSATION_DAYS } from '../billing/retention.js';
import { isPlanId, messageCapFor, planFor, screensNotInPlan, PLANS, PLAN_IDS, type PlanId } from '../plans.js';
import { safeFetch } from '../net/safe-fetch.js';
import { auditTheme, normalizeTheme, PRESETS, type Theme } from '../shared/theme.js';
import { STRINGS } from '../shared/i18n.js';
import {
  buildWhere, CSV_PREAMBLE, csvRow, listConversations, type ConversationFilters,
} from './conversations.js';
import { clientError, type ClientError } from './errors.js';
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
  //
  // Имени файла в адресе нет намеренно. Логотип — файл клиента, лежит под
  // префиксом его тенанта, и какой именно — знает только запись в базе.
  // Адрес без имени невозможно подобрать, а сессия и так решает, чей он.
  /** Короткий отпечаток ключа файла: адрес меняется вместе с логотипом. */
  const logoTag = (key: string): string =>
    createHash('sha256').update(key).digest('hex').slice(0, 12);

  app.get('/admin/brand/logo', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const brand = await withTenant(session.tenantId, async (client) => {
      const { rows } = await client.query<{ logo_key: string | null; logo_mime: string | null }>(
        'SELECT logo_key, logo_mime FROM tenants WHERE id = $1', [session.tenantId]);
      return rows[0];
    });
    if (!brand?.logo_key) return reply.code(404).send();
    return reply
      .type(brand.logo_mime ?? 'image/svg+xml')
      // Приватный кеш: логотип отдаётся под сессией, и общему кешу его отдавать
      // нельзя — иначе прокси покажет марку одного клиента другому.
      .header('cache-control', 'private, max-age=86400')
      .send(await storageGet(brand.logo_key));
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
  /**
   * Какому экрану принадлежит адрес.
   *
   * Скрытые экраны были только рисованием: сервер о них не знал, и всё,
   * что клиенту не показывали, оставалось доступно обычным запросом.
   * Для пилота это значит, что материалы можно добавить в обход единственного
   * согласованного источника — папки на Google Drive.
   *
   * Список явный, а не по догадке из пути: молчаливое совпадение по префиксу
   * однажды закроет эндпоинт, которого никто не собирался закрывать.
   */
  const SCREEN_OF: Array<{ path: RegExp; screen: string; methods?: string[] }> = [
    // Список документов читает и экран «Google Drive» — там показываются файлы
    // из папки. Поэтому скрытая «База знаний» закрывает не чтение, а добавление
    // и удаление: именно они и есть тот обход единственного согласованного
    // источника материалов, ради которого экран прячут.
    //
    // Поймано браузером: первая версия правила закрывала /documents целиком
    // и ломала рабочий экран Drive у пилотного клиента.
    { path: /^\/admin\/api\/documents(\/|$)/, screen: 'kb', methods: ['POST', 'DELETE', 'PUT'] },
    { path: /^\/admin\/api\/drive(\/|$)/, screen: 'drive' },
    { path: /^\/admin\/api\/appearance(\/|$)/, screen: 'aspect' },
    { path: /^\/admin\/api\/connectors(\/|$)/, screen: 'connectors' },
    { path: /^\/admin\/api\/conversations(\/|$)/, screen: 'chats' },
    { path: /^\/admin\/api\/insights(\/|$)/, screen: 'analytics' },
    { path: /^\/admin\/api\/approved(\/|$)/, screen: 'analytics' },
    { path: /^\/admin\/api\/install(\/|$)/, screen: 'install' },
    { path: /^\/admin\/api\/subscription(\/|$)/, screen: 'subscription' },
  ];

  const screenOf = (url: string, method: string): string | null => {
    const path = url.split('?')[0] ?? '';
    const hit = SCREEN_OF.find(
      (r) => r.path.test(path) && (!r.methods || r.methods.includes(method.toUpperCase())),
    );
    return hit?.screen ?? null;
  };

  /**
   * Скрытый экран закрывается на входе, а не в каждом обработчике.
   *
   * Обработчики зарегистрированы по-разному: часть через `guarded`, часть
   * напрямую — и проверка внутри `guarded` пропускала как раз POST /documents,
   * то есть ровно то добавление материалов, ради запрета которого экран и прячут.
   * Поймано браузером, а не чтением: в коде это выглядело закрытым.
   */
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/admin/api/')) return;
    const screen = screenOf(request.url, request.method);
    if (!screen) return;

    const session = await loadSession(request);
    if (!session) return; // отказ по сессии выдаст сам обработчик

    const hidden = await withTenant(session.tenantId, async (client) => {
      const { rows } = await client.query<{
        hidden_screens: string[]; plan: string; has_configurator: boolean;
      }>(`SELECT hidden_screens, plan, configurator <> '{}'::jsonb AS has_configurator
            FROM tenants WHERE id = $1`, [session.tenantId]);
      const row = rows[0];
      if (!row) return [];
      // Тариф проверяется здесь же, а не только в панели: экран, закрытый
      // рисованием, остаётся доступен обычным запросом — это уже находили.
      return [
        ...row.hidden_screens,
        ...screensNotInPlan(row.plan),
        // Акции без конфигуратора подтверждать не для чего: применять их негде.
        ...(row.has_configurator ? [] : ['promotions']),
      ];
    });
    if (hidden.includes(screen)) {
      return reply.code(403)
        .send({ error: 'Această secțiune nu este disponibilă', code: 'screen_hidden' });
    }
  });

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
        // Код нужен панели, чтобы показать сообщение на языке клиента.
        // Текст остаётся рядом: неизвестный панели код лучше показать
        // словами, чем строкой вида `error.file_empty`.
        const e = err as ClientError;
        return reply.code(422).send({
          error: e.message,
          ...(e.code ? { code: e.code } : {}),
          ...(e.detail ? { detail: e.detail } : {}),
        });
      }
    };

  /**
   * Тариф, расход и состояние подписки.
   *
   * Клиент видит здесь ровно то, что его касается: что он купил, сколько
   * израсходовал и когда следующий платёж. Истории наших расчётов с платёжной
   * системой — событий вебхука — здесь нет и быть не должно.
   *
   * Расход показывается вместе с потолком, а не отдельно. «1 240 сообщений» —
   * это не информация; «1 240 из 5 000» — это информация.
   */
  /**
   * Что показывать на каждом разделе портала.
   *
   * Портал один на всех агентов, поэтому отвечаем по ВСЕМ семи, а не по
   * купленным: иначе человек не узнает, что остальные можно купить.
   * Порядок берётся из контракта — тот же, что на витрине, чтобы навигация
   * в кабинете и список в прайсе не расходились.
   *
   * Цен здесь не считается: `priceFrom` приходит из манифеста продукта.
   * Скидки за объём и годовую оплату — предмет оформления покупки, а не
   * этого ответа; показывать их на замке значило бы обещать цену до того,
   * как известно, сколько агентов человек берёт.
   */
  app.get('/admin/api/agents', guarded(async ({ session, client }) =>
    ({ agents: await portalAgents(client, session.tenantId) })));

  app.get('/admin/api/subscription', guarded(async ({ session, client }) => {
    const { rows } = await client.query<{
      plan: string; subscription_status: string;
      trial_ends_at: Date | null; current_period_end: Date | null;
      monthly_message_cap: number | null; billing_customer_id: string | null;
      canceled_at: Date | null;
    }>(`SELECT plan, subscription_status, trial_ends_at, current_period_end,
               monthly_message_cap, billing_customer_id, canceled_at
          FROM tenants WHERE id = $1`, [session.tenantId]);
    const t = rows[0];
    if (!t) throw clientError('tenant_missing', 'Contul nu a fost găsit');

    const plan = planFor(t.plan);
    const cap = messageCapFor(t.plan, t.monthly_message_cap);

    const { rows: used } = await client.query<{
      messages: string; documents: string; chunks: string; bytes: string;
    }>(`SELECT
          (SELECT coalesce(sum(messages), 0) FROM usage_daily
            WHERE tenant_id = $1 AND date >= date_trunc('month', current_date)) AS messages,
          (SELECT count(*) FROM documents) AS documents,
          (SELECT count(*) FROM chunks) AS chunks,
          (SELECT coalesce(sum(size_bytes), 0) FROM documents) AS bytes`,
      [session.tenantId]);
    const u = used[0]!;

    const entitlement = entitlementOf({
      subscriptionStatus: t.subscription_status,
      trialEndsAt: t.trial_ends_at,
      currentPeriodEnd: t.current_period_end,
    });

    return {
      plan: {
        id: plan.id, name: plan.name, priceEur: plan.priceEur,
        highlights: plan.highlights,
      },
      /**
       * Вся лестница, включая непокупаемое.
       *
       * Клиент решает, брать ли Pro, глядя на то, куда он растёт. Скрыть
       * Business и Enterprise значило бы показать лестницу из двух ступеней
       * и выглядеть меньше, чем мы есть; поставить им кнопку «оплатить» —
       * продать то, чего нет.
       */
      allPlans: PLAN_IDS.map((id) => ({
        id, name: PLANS[id].name,
        priceEur: PLANS[id].priceEur,
        priceEurYearly: PLANS[id].priceEurYearly,
        setupFeeEur: PLANS[id].setupFeeEur,
        purchasable: PLANS[id].purchasable,
        monthlyMessages: PLANS[id].monthlyMessages,
        highlights: PLANS[id].highlights,
        current: id === plan.id,
      })),
      status: t.subscription_status,
      active: entitlement.active,
      reason: entitlement.reason,
      daysLeft: entitlement.daysLeft,
      currentPeriodEnd: t.current_period_end,
      usage: {
        messages: Number(u.messages), messagesCap: cap,
        documents: Number(u.documents), documentsCap: plan.maxDocuments,
        chunks: Number(u.chunks), chunksCap: plan.maxChunks,
        bytes: Number(u.bytes), bytesCap: plan.maxTotalBytes,
      },
      // Управлять картой и счетами клиент вправе сам. Кнопки не будет, пока
      // подписки нет вовсе или пока оплата не настроена.
      canManageBilling: Boolean(t.billing_customer_id) && Boolean(process.env.STRIPE_SECRET_KEY),
      // Сроки хранения показываются ДО отмены, а не после. Человек, который
      // думает уходить, должен знать, что будет с его данными, — иначе он
      // узнаёт это письмом «мы всё удалили», и это худший из возможных дней
      // для такого разговора.
      retention: { conversationDays: CONVERSATION_DAYS, canceledDays: CANCELED_DAYS },
      canceledAt: t.canceled_at,
    };
  }));

  /**
   * Заявка письмом, когда оплата ещё не подключена. Не «показать отправлено
   * и промолчать»: адресата нет — говорим об этом прямо.
   */
  async function requestPlanByEmail(
    who: string, tenant: string, now: string, wanted: PlanId,
  ): Promise<void> {
    const to = process.env.SALES_EMAIL ?? process.env.WATCHDOG_EMAIL;
    if (!to) {
      throw clientError('sales_email_missing',
        'Momentan nu putem prelua cererea. Scrieți-ne direct, vă rugăm.');
    }
    const { send, defaultMailFrom } = await import('../notify/email.js');
    await send({
      from: defaultMailFrom(), to,
      subject: `Заявка на тариф: ${tenant} → ${PLANS[wanted].name}`,
      text: [
        `Клиент: ${tenant}`,
        `Сейчас: ${planFor(now).name}`,
        `Просит: ${PLANS[wanted].name} (${PLANS[wanted].priceEur} €/мес)`,
        `Кто просит: ${who}`,
        ``,
        `Переключить и прислать ссылку на оплату:`,
        `  npm run client -- plan <клиент> ${wanted}`,
        `  npm run client -- checkout <клиент> ${wanted}`,
      ].join('\n'),
      html: '',
    });
  }

  /**
   * Выбор пакета: оплата или смена.
   *
   * Один адрес на оба случая, и решает сервер, а не панель. Разница в деньгах,
   * и ошибиться в ней нельзя:
   *
   *   действующей подписки нет  → сессия оплаты в Stripe;
   *   подписка есть             → меняется ПОЗИЦИЯ в ней.
   *
   * Вторая сессия оплаты для того, у кого подписка уже есть, завела бы вторую
   * подписку и списала бы дважды. Клиент увидел бы это на выписке, а не
   * в панели, и разбирался бы с банком, а не с нами.
   *
   * Если оплата вообще не настроена — заявка письмом нам. Это не запасной путь
   * на всякий случай: пока не решён вопрос с юрлицом, он единственный рабочий,
   * и клиент не должен упираться в мёртвую кнопку.
   */
  app.post<{ Body: { plan?: string; period?: string; from?: string } }>('/admin/api/subscription/checkout',
    guarded(async ({ session, client, body, request }) => {
      const { rows } = await client.query<{
        name: string; plan: string; subscription_id: string | null; subscription_status: string;
      }>(`SELECT name, plan, subscription_id, subscription_status
            FROM tenants WHERE id = $1`, [session.tenantId]);
      const t = rows[0];
      if (!t) throw clientError('tenant_missing', 'Contul nu a fost găsit');

      // Пакет не назвали — значит платят за текущий.
      const wanted = String((body as { plan?: string })?.plan ?? t.plan);
      if (!isPlanId(wanted)) throw clientError('unknown_plan', 'Pachet necunoscut');
      // Непокупаемое отсекается ЗДЕСЬ, а не в панели: кнопки у него нет,
      // но запрос отправляется и без кнопки.
      if (!PLANS[wanted].purchasable) {
        throw clientError('plan_not_purchasable',
          'Acest pachet nu este încă disponibil pentru cumpărare');
      }
      const period = (body as { period?: string })?.period === 'yearly' ? 'yearly' : 'monthly';

      if (!process.env.STRIPE_SECRET_KEY) {
        await requestPlanByEmail(session.email, t.name, t.plan, wanted);
        return { requested: true };
      }

      // Подробности неполадки с оплатой — нам в журнал, клиенту одна фраза.
      // «STRIPE_PRICE_BUSINESS не задан» директору по продажам не говорит
      // ничего, кроме того, что у нас что-то не настроено, — а имена наших
      // переменных ему знать незачем.
      try {
        const live = t.subscription_id && ['active', 'past_due'].includes(t.subscription_status);
        if (live) {
          const { changePlan } = await import('../../platform/billing/stripe.js');
          await changePlan(t.subscription_id!, wanted, period);
          // Тариф в базе не трогаем: его поставит вебхук. Записать здесь значило бы
          // иметь две правды — нашу и Stripe, — и расходиться они начнут в тот день,
          // когда смена не пройдёт.
          return { changed: true };
        }

        const host = request.headers.host ?? '';
        const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
        // Куда вернуть человека после Stripe. Оплата, начатая в портале,
        // обязана и заканчиваться в портале: иначе человек платит в одном
        // приложении и приходит в себя в другом.
        //
        // Адрес не принимается запросом, а берётся из настройки: параметр
        // с адресом возврата — это открытое перенаправление, и подписаться
        // на него можно было бы чужой ссылкой.
        const portal = process.env.PORTAL_BASE_URL?.replace(/\/+$/, '');
        const fromPortal = (body as { from?: string })?.from === 'portal' && portal;
        const back = fromPortal ? `${portal}/subscription` : `${proto}://${host}/admin#subscription`;
        const { createCheckout } = await import('../../platform/billing/stripe.js');
        return await createCheckout({
          tenantId: session.tenantId, plan: wanted, period,
          email: session.email, successUrl: back, cancelUrl: back,
        });
      } catch (err) {
        request.log.error({ err, tenantId: session.tenantId, plan: wanted },
          'оплата не сработала');
        throw clientError('billing_unavailable',
          'Plata nu este disponibilă momentan. Scrieți-ne și rezolvăm noi.');
      }
    }));


  /** Ссылка на управление картой и счетами. Живёт минуты — потому и создаётся по нажатию. */
  app.post('/admin/api/subscription/portal', guarded(async ({ session, client, request }) => {
    const { rows } = await client.query<{ billing_customer_id: string | null }>(
      'SELECT billing_customer_id FROM tenants WHERE id = $1', [session.tenantId]);
    const customer = rows[0]?.billing_customer_id;
    if (!customer) throw clientError('no_billing', 'Nu există încă un abonament de administrat');

    const host = request.headers.host ?? '';
    const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const { createPortalLink } = await import('../../platform/billing/stripe.js');
    return createPortalLink(customer, `${proto}://${host}/admin`);
  }));

  app.get('/admin/api/me', guarded(async ({ session, client }) => {
    const { rows } = await client.query<{
      name: string; plan: string; public_key: string; logo_key: string | null;
      hidden_screens: string[]; locale_default: string; supported_locales: string[];
    }>(`SELECT name, plan, public_key, logo_key, hidden_screens, locale_default,
               supported_locales
          FROM tenants WHERE id = $1`, [session.tenantId]);
    const t = rows[0];
    return {
      email: session.email,
      // Идентификаторы нужны не панели — она про них ничего не спрашивает, —
      // а порталу: он сводит учётную запись движка со своей записью клиента
      // и своим пользователем. Без них сводить не по чему, а сводить по почте
      // значило бы считать почту неизменной, чем она не является.
      userId: session.userId,
      tenantId: session.tenantId,
      tenant: t && {
        name: t.name, plan: t.plan, public_key: t.public_key,
        // Адрес с отпечатком файла. Один общий адрес с приватным кешем показывал
        // марку прошлого клиента после смены учётной записи в том же браузере —
        // сутки, пока не истечёт кеш. Отпечаток меняет адрес вместе с логотипом.
        logo_url: t.logo_key ? `/admin/brand/logo?v=${logoTag(t.logo_key)}` : null,
        // Какие экраны показывать — решает запись тенанта, а не сборка панели.
        // К скрытым руками добавляются те, которых нет в тарифе. Клиент
        // не должен видеть экран, за который не платил, — и не должен думать,
        // что мы его прячем по своей прихоти: в разделе «Abonament» видно,
        // какой пакет его включает.
        hiddenScreens: [...new Set([...t.hidden_screens, ...screensNotInPlan(t.plan)])],
        // Язык панели — язык клиента. Панель писалась по-румынски, но читать
        // её будет тот, кто работает с заявками, а он не обязан знать румынский.
        locale: t.locale_default,
        locales: t.supported_locales?.length ? t.supported_locales : [t.locale_default],
      },
    };
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

    // Языки клиента, а не все встроенные: предлагать заполнить немецкое
    // приветствие тому, у кого материалы только румынские, — значит просить
    // работу, результат которой посетитель никогда не увидит.
    const { rows: t } = await client.query<{ supported_locales: string[]; locale_default: string }>(
      'SELECT supported_locales, locale_default FROM tenants WHERE id = $1', [session.tenantId]);
    const locales = t[0]?.supported_locales?.length
      ? t[0].supported_locales
      : [t[0]?.locale_default ?? 'en'];

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
      locales,
    };
  }));

  /**
   * Предпросмотр виджета для портала.
   *
   * Собирается ЗДЕСЬ, а не в портале, и это главное в этом обработчике.
   * Стили превью берутся из того же модуля, что и у живого виджета, — значит
   * цвета в предпросмотре не могут разойтись с тем, что увидит посетитель.
   * Портал живёт в другом репозитории; повторить там разметку виджета
   * означало бы завести копию, которая разойдётся с оригиналом молча и
   * покажет клиенту не его бота.
   *
   * Панель движка рисует то же самое у себя в памяти — ей запрос не нужен.
   */
  app.post('/admin/api/appearance/preview', guarded(async ({ body }) => {
    const b = body as {
      theme?: Partial<Theme>; botName?: string; locale?: string;
      welcome?: string; disclosure?: string;
    };
    const locale = (b.locale && b.locale in STRINGS ? b.locale : 'en') as keyof typeof STRINGS;
    const strings = STRINGS[locale];
    const { previewSrcDoc } = await import('../admin/preview.js');

    return {
      html: previewSrcDoc({
        theme: normalizeTheme(b.theme),
        botName: b.botName?.trim() || 'Assistant',
        welcome: b.welcome?.trim() || strings.title,
        disclosure: b.disclosure?.trim() || strings.disclosure,
        placeholder: strings.placeholder,
        send: strings.send,
      }),
      // Предупреждения о контрасте считает тот же аудит, что и на сохранении:
      // портал их только показывает.
      warnings: auditTheme(normalizeTheme(b.theme)),
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
    if (!b.name?.trim() || !b.baseUrl?.trim()) throw clientError('connector_name_url_required', 'Sunt necesare numele și adresa de bază');

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
    if (!url) throw clientError('page_url_required', 'Indicați adresa paginii');

    const { rows } = await client.query<{ public_key: string }>(
      'SELECT public_key FROM tenants WHERE id = $1', [session.tenantId],
    );
    const key = rows[0]?.public_key ?? '';

    try {
      // Через safeFetch, а не через голый fetch: переход на 169.254.169.254
      // иначе превращает эту проверку в оракул по внутренней сети — коды
      // ответов и признак «нашли скрипт» видны в панели.
      const res = await safeFetch(url, {
        headers: { 'user-agent': 'AssistWidgetBot/0.1 (+verify)' },
        maxBytes: 512 * 1024,
        timeoutMs: 10_000,
      });
      const html = res.body;
      const host = request.headers.host ?? '';
      return {
        reachable: res.status >= 200 && res.status < 300,
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
             FROM messages WHERE conversation_id = $1 ORDER BY seq`,
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
                    AND m.role = 'user' ORDER BY m.seq LIMIT 1) AS first_question
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

  /**
   * PDF оферты.
   *
   * Отдаётся под сессией панели и только своего тенанта: RLS отсекает чужую
   * строку, а без строки нет ключа. Ключ наружу не показывается вовсе —
   * панель знает идентификатор оферты, а не путь к файлу.
   *
   * Отдельным маршрутом, а не через `guarded`: тот отдаёт JSON и заголовков
   * не ставит, а браузеру нужен content-type и имя файла.
   */
  app.get<{ Params: { id: string } }>('/admin/api/offers/:id/pdf', async (request, reply) => {
    const session = await loadSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const offer = await withTenant(session.tenantId, async (client) => {
      const { rows } = await client.query<{ number: string; storage_key: string }>(
        'SELECT number, storage_key FROM offers WHERE id = $1', [request.params.id]);
      const found = rows[0];
      if (found?.storage_key) {
        await audit(client, session, 'offer.download', request.params.id, { number: found.number });
      }
      return found;
    });
    if (!offer?.storage_key) return reply.code(404).send();

    const pdf = await storageGet(offer.storage_key).catch(() => null);
    if (!pdf) return reply.code(404).send();
    return reply
      .type('application/pdf')
      // Приватный кеш: документ отдаётся под сессией, общему кешу его нельзя.
      .header('cache-control', 'private, max-age=300')
      .header('content-disposition', `inline; filename="oferta-${offer.number}.pdf"`)
      .send(pdf);
  });

  /**
   * Воронка конфигуратора.
   *
   * Пустой ответ, если конфигуратора нет: экран его и не покажет, но
   * запрос из консоли не должен получать пятисотку вместо ответа.
   */
  app.get<{ Querystring: { days?: string } }>('/admin/api/funnel',
    guarded(async ({ session, query }) => {
      const { tenantConfigurator } = await import('../../products/configurator/tenant.js');
      const { funnel } = await import('../../products/configurator/stats.js');
      const me = await withTenant(session.tenantId, async (client) => {
        const { rows } = await client.query<{ locale_default: string; supported_locales: string[] }>(
          'SELECT locale_default, supported_locales FROM tenants WHERE id = $1', [session.tenantId]);
        return rows[0];
      });
      const locales = me?.supported_locales?.length
        ? me.supported_locales : [me?.locale_default ?? 'en'];
      const cfg = await tenantConfigurator(session.tenantId, locales);
      if (!cfg) return null;
      const days = Math.min(365, Math.max(1, Number((query as { days?: string }).days ?? 30) || 30));
      return funnel(session.tenantId, cfg.configurator.flow, locales[0]!, days);
    }),
  );

  /**
   * Акции.
   *
   * Подтверждение — коммерческое решение клиента, а не техническая проверка
   * «парсер прав». Поэтому кнопки в его панели, а не у нас в конфиге.
   */
  app.get('/admin/api/promotions', guarded(async ({ session }) =>
    (await import('../../products/configurator/promo/store.js'))
      .listPromotions(session.tenantId)));

  app.post<{ Params: { id: string }; Body: { state?: string } }>(
    '/admin/api/promotions/:id', guarded(async ({ session, client, request, body }) => {
      const state = (body as { state?: string }).state;
      if (state !== 'active' && state !== 'rejected' && state !== 'expired') {
        throw clientError('promo_bad_state', 'состояние — active, rejected или expired');
      }
      const id = (request.params as { id: string }).id;
      const { decidePromotion } = await import('../../products/configurator/promo/store.js');
      const done = await decidePromotion(session.tenantId, id, state, session.userId);
      if (!done) throw clientError('promo_not_found', 'акция не найдена или уже истекла');
      // Решение по скидке попадает в оферты — оно обязано быть в журнале.
      await audit(client, session, 'promotion.decide', id, { state });
      return { ok: true };
    }),
  );

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
      // Оферта подтягивается к заявке: у продавца один список заявок,
      // а не два. Файл отдаётся отдельным маршрутом — в списке только признак
      // того, что он есть, иначе сотня PDF уехала бы в один ответ.
      client.query(
        `SELECT l.id, l.name, l.email, l.phone, l.note, l.created_at, l.conversation_id,
                l.notified_at, l.notify_error, l.product, l.payload,
                o.id AS offer_id, o.number AS offer_number,
                o.total_bani, o.storage_key <> '' AS has_pdf
           FROM leads l
           LEFT JOIN offers o ON o.lead_id = l.id
          ORDER BY l.created_at DESC LIMIT 100`),
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
