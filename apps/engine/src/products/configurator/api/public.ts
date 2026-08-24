import { basename } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveTenant } from '../../../engine/api/auth.js';
import { acquireSlot } from '../../../engine/api/concurrency.js';
import { withTenant } from '../../../engine/db/pool.js';
import { get as storageGet } from '../../../engine/ingest/storage.js';
import { buildAgentSystem } from '../agent/prompt.js';
import { publicFlow } from '../flow/public.js';
import { resolveSelections, type Selections } from '../flow/select.js';
import { issueOffer, summaryOf } from '../offer/issue.js';
import { notifyOffer } from '../offer/notify.js';
import { priceOf } from '../pricing/engine.js';
import { priceWithPromotion } from '../promo/apply.js';
import { tenantConfigurator, type TenantConfigurator } from '../tenant.js';

/**
 * Публичные маршруты конфигуратора.
 *
 * Всё, что приходит отсюда в расчёт и в документ, проверяется против конфига
 * тенанта. Браузер не присылает ни цен, ни номеров, ни скидок — только
 * идентификаторы шагов и вариантов, и каждый из них обязан найтись в конфиге.
 *
 * Прайса в ответах нет ни в одном (см. `flow/public.ts`): цена приходит
 * отдельным запросом и считается на сервере.
 */

const MAX_QUESTION = 500;

export function registerConfigurator(app: FastifyInstance): void {
  /** Конфиг тенанта. Нет конфигуратора — 404: это законное состояние. */
  app.get<{ Querystring: { key?: string; locale?: string } }>(
    '/v1/configurator/config', async (request, reply) => {
      const found = await load(request.query.key);
      if (!found) return reply.code(404).send({ error: 'no configurator' });
      const { tenant, cfg } = found;
      const locale = pickLocale(request.query.locale, tenant.localeDefault, tenant.supportedLocales);

      return {
        flow: publicFlow(cfg.configurator.flow, locale, (file) =>
          `/v1/configurator/asset?key=${encodeURIComponent(request.query.key!)}` +
          `&file=${encodeURIComponent(basename(file))}`),
        currency: cfg.offer.currency,
        vat: cfg.configurator.pricing.vat,
      };
    },
  );

  /**
   * Картинки вариантов. Имя файла, а не путь: тенант определяется по ключу,
   * каталог — по тенанту, и подобрать чужой файл нельзя даже зная его имя.
   */
  app.get<{ Querystring: { key?: string; file?: string } }>(
    '/v1/configurator/asset', async (request, reply) => {
      const tenant = request.query.key ? await resolveTenant(request.query.key) : null;
      const file = request.query.file;
      if (!tenant || !file || file !== basename(file)) return reply.code(404).send();
      const data = await storageGet(`${tenant.id}/configurator/${file}`).catch(() => null);
      if (!data) return reply.code(404).send();
      return reply
        .header('content-type', mimeOf(file))
        .header('cache-control', 'public, max-age=86400')
        .send(data);
    },
  );

  /**
   * Цена. 422 на неполном выборе — нормальный ход, а не поломка: виджет
   * показывает цену, только когда посчиталась.
   */
  app.post<{ Body: { publicKey?: string; selections?: Selections } }>(
    '/v1/configurator/price', async (request, reply) => {
      const found = await load(request.body?.publicKey);
      if (!found) return reply.code(404).send({ error: 'no configurator' });
      const { cfg } = found;
      try {
        const { price, promo } = await priceWithPromotion(
          found.tenant.id, cfg.configurator, request.body?.selections ?? {},
        );
        return {
          // Цена до скидки — чтобы виджет мог зачеркнуть старую, а не просто
          // показать новую: «дешевле» без «чем было» ничего не сообщает.
          listPriceBani: price.listPriceBani,
          finalPriceBani: price.finalPriceBani,
          vatBani: price.vatBani,
          totalBani: price.totalBani,
          discountBani: price.discountBani,
          ...(promo ? { promo: { label: promo.label, validUntil: promo.validUntil } } : {}),
        };
      } catch (err) {
        return reply.code(422).send({ error: (err as Error).message });
      }
    },
  );

  /** Вопрос агенту. Ответ целиком: реплика короткая, поток внутри шага мешал бы. */
  app.post<{ Body: {
    publicKey?: string; locale?: string; stepId?: string;
    selections?: Selections; question?: string;
  } }>('/v1/configurator/ask', async (request, reply) => {
    const found = await load(request.body?.publicKey);
    if (!found) return reply.code(404).send({ error: 'no configurator' });
    const { tenant, cfg, name } = found;

    const question = (request.body?.question ?? '').trim().slice(0, MAX_QUESTION);
    if (!question) return reply.code(400).send({ error: 'empty question' });

    // Тот же потолок одновременных обращений, что у чата: маршрут зовёт модель,
    // и без потолка это не свобода, а счёт за Bedrock.
    const slot = acquireSlot(tenant.id);
    if (!slot) return reply.code(503).send({ error: 'busy' });

    try {
      const locale = pickLocale(request.body?.locale, tenant.localeDefault, tenant.supportedLocales);
      let selections;
      try {
        selections = resolveSelections(cfg.configurator.flow, request.body?.selections ?? {}, 'вопрос');
      } catch {
        // Выбор ещё неполный — агент отвечает и без него.
        selections = { picks: [], numbers: {}, texts: {} };
      }
      let price: string | undefined;
      try {
        const r = priceOf(cfg.configurator.flow, cfg.configurator.pricing, request.body?.selections ?? {});
        price = money(r.totalBani, cfg.offer.currency, locale);
      } catch { /* цены ещё нет */ }

      const system = buildAgentSystem({
        botName: name, companyName: name, locale,
        flow: cfg.configurator.flow, stepId: request.body?.stepId,
        selections, price, prompt: cfg.configurator.agent.prompt,
      });

      const { claude, modelFor } = await import('../../../engine/llm/claude.js');
      const res = await claude.messages.create({
        model: modelFor('base'), max_tokens: 400, system,
        messages: [{ role: 'user', content: question }],
      });
      return {
        answer: res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim(),
      };
    } catch (err) {
      console.error(`агент конфигуратора не ответил: ${(err as Error).message}`);
      return reply.code(503).send({ error: 'unavailable' });
    } finally {
      slot.release();
    }
  });

  /**
   * Выпуск оферты.
   *
   * Согласие проверяется ЗДЕСЬ, а не только чекбоксом в виджете: чекбокс —
   * это разметка страницы, и запрос без него отправляется из консоли за
   * полминуты. Оферта без согласия — обработка персональных данных
   * без основания.
   */
  app.post<{ Body: {
    publicKey?: string; locale?: string; selections?: Selections;
    contact?: { name?: string; email?: string; phone?: string };
    consent?: boolean; consentMarketing?: boolean; conversationId?: string;
  } }>('/v1/configurator/offer', async (request, reply) => {
    const found = await load(request.body?.publicKey);
    if (!found) return reply.code(404).send({ error: 'no configurator' });
    const { tenant, cfg, name, notifyEmail, notifyFrom } = found;

    const body = request.body ?? {};
    const contact = {
      ...(body.contact?.name ? { name: body.contact.name.trim().slice(0, 200) } : {}),
      ...(body.contact?.email ? { email: body.contact.email.trim().slice(0, 200) } : {}),
      ...(body.contact?.phone ? { phone: body.contact.phone.trim().slice(0, 60) } : {}),
    };
    if (!contact.email && !contact.phone) {
      return reply.code(400).send({ error: 'contact required' });
    }
    if (body.consent !== true) {
      return reply.code(400).send({ error: 'consent required' });
    }

    const locale = pickLocale(body.locale, tenant.localeDefault, tenant.supportedLocales);

    // Акция выбирается ЗДЕСЬ, на сервере, из подтверждённых и не истёкших.
    // Виджет о ней не сообщает: он показывает то, что мы ему прислали.
    let promo;
    try {
      ({ promo } = await priceWithPromotion(
        tenant.id, cfg.configurator, body.selections ?? {}, 'оферта',
      ));
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }

    let issued;
    try {
      issued = await issueOffer(cfg.configurator, cfg.offer, {
        tenantId: tenant.id, locale,
        selections: body.selections ?? {},
        contact,
        consentMarketing: body.consentMarketing === true,
        conversationId: body.conversationId,
        ...(promo ? {
          discount: 'percent' in promo.discount
            ? { percent: promo.discount.percent / 100 }
            : { bani: promo.discount.bani },
          promoLabel: promo.label[locale] ?? Object.values(promo.label)[0],
          promoId: promo.id,
          promoValidUntil: promo.validUntil,
        } : {}),
      });
    } catch (err) {
      // Неверный выбор — вина запроса; всё остальное — наша.
      const message = (err as Error).message;
      console.error(`оферта не выпущена: ${message}`);
      return reply.code(message.startsWith('выпуск оферты:') ? 500 : 422).send({ error: message });
    }

    // Письмо после выпуска и вне транзакции: чужой SMTP не должен отменять
    // выданный номер.
    const resolved = resolveSelections(cfg.configurator.flow, body.selections ?? {}, 'оферта');
    await notifyOffer(issued, cfg.offer, {
      tenantName: name, from: notifyFrom, sellerEmail: notifyEmail, locale, contact,
      summary: summaryOf(cfg.configurator.flow, resolved, locale),
      totalFormatted: money(issued.price.totalBani, cfg.offer.currency, locale),
    });

    return { number: issued.number, totalBani: issued.price.totalBani };
  });
}

interface Found {
  tenant: Awaited<ReturnType<typeof resolveTenant>> & object;
  cfg: TenantConfigurator;
  name: string;
  notifyEmail?: string | undefined;
  notifyFrom?: string | undefined;
}

async function load(publicKey: string | undefined): Promise<Found | null> {
  if (!publicKey) return null;
  const tenant = await resolveTenant(publicKey);
  if (!tenant) return null;
  const cfg = await tenantConfigurator(tenant.id, tenant.supportedLocales);
  if (!cfg) return null;

  const row = await withTenant(tenant.id, async (client) => {
    const { rows } = await client.query<{
      name: string; lead_notify_email: string | null; lead_notify_from: string | null;
    }>('SELECT name, lead_notify_email, lead_notify_from FROM tenants WHERE id = $1', [tenant.id]);
    return rows[0];
  });

  return {
    tenant, cfg,
    name: row?.name ?? '',
    ...(row?.lead_notify_email ? { notifyEmail: row.lead_notify_email } : {}),
    ...(row?.lead_notify_from ? { notifyFrom: row.lead_notify_from } : {}),
  };
}

const money = (bani: number, currency: { code: string; decimals: number }, locale: string): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency', currency: currency.code,
    minimumFractionDigits: currency.decimals, maximumFractionDigits: currency.decimals,
  }).format(bani / 10 ** currency.decimals);

/** Локаль решает тенант, а не запрос: чужой язык в бланке — это брак документа. */
const pickLocale = (raw: unknown, fallback: string, supported: string[]): string =>
  typeof raw === 'string' && supported.includes(raw) ? raw : fallback;

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};
const mimeOf = (file: string): string =>
  MIME[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
