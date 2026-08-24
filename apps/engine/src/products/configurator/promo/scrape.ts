import * as cheerio from 'cheerio';
import { safeFetch } from '../../../engine/net/safe-fetch.js';
import { send } from '../../../engine/notify/email.js';
import { assertTerms, fingerprint, isStale, type PromoConfig, type PromoTerms } from './schema.js';
import { expireMissing, upsertPromotion } from './store.js';

/**
 * Скрейп акций с сайта клиента.
 *
 * Читает страницу, просит модель вытащить условия, проверяет их схемой
 * и кладёт ЧЕРНОВИКАМИ. Ни одна из них не влияет на цену, пока человек
 * не подтвердит: разговор и расчёт читают только сохранённое, и никакого
 * разбора на лету не происходит.
 *
 * FAIL-SAFE. Упавший fetch, невалидный JSON, скидка выше потолка — черновик
 * не создаётся ВОВСЕ, и уходит алерт. Мусорный черновик хуже отсутствующего:
 * он приучает клиента жать «Отклонить» не читая, и в тот день, когда придёт
 * настоящая ошибка, он нажмёт её не глядя.
 *
 * И отдельно: провалившийся проход НИЧЕГО НЕ ГАСИТ. Иначе моргнувший сайт
 * клиента снимал бы все его подтверждённые акции разом.
 */

const MAX_HTML = 400_000;
const MAX_TEXT = 20_000;

export interface ScrapeResult {
  created: number;
  unchanged: number;
  expired: number;
  /** Причина, по которой проход не состоялся. Пусто — прошёл. */
  failed?: string;
  /** Отброшенные акции: не прошли схему или потолок. */
  rejected: string[];
  /** Просроченные, всё ещё висящие на странице. Не ошибка — обычное дело. */
  stale: number;
}

export interface ScrapeContext {
  tenantId: string;
  tenantName: string;
  config: PromoConfig;
  /** Идентификаторы моделей из флоу: модель вне этого списка — выдумка парсера. */
  modelIds: string[];
  locale: string;
}

export async function scrapePromotions(ctx: ScrapeContext): Promise<ScrapeResult> {
  const scrape = ctx.config.scrape;
  const empty: ScrapeResult = { created: 0, unchanged: 0, expired: 0, rejected: [], stale: 0 };
  if (!scrape) return empty;

  let source: string;
  try {
    source = scrape.strategy === 'wp-api'
      ? await fetchWooSale(scrape.url)
      : await fetchPage(scrape.url);
  } catch (err) {
    const failed = `не удалось прочитать ${scrape.url}: ${(err as Error).message}`;
    await alert(ctx, failed);
    return { ...empty, failed };
  }

  let raw: unknown;
  try {
    raw = await extract(source, ctx);
  } catch (err) {
    const failed = `модель не вернула разбираемый ответ: ${(err as Error).message}`;
    await alert(ctx, failed);
    return { ...empty, failed };
  }

  if (!Array.isArray(raw)) {
    const failed = 'модель вернула не список акций';
    await alert(ctx, failed);
    return { ...empty, failed };
  }

  const good: PromoTerms[] = [];
  const rejected: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let stale = 0;

  for (const [i, item] of raw.entries()) {
    try {
      assertTerms(item, `акция ${i + 1}`, ctx.config.maxDiscountPercent);
      const terms = item as PromoTerms;

      /**
       * Просроченная акция отбрасывается ЗДЕСЬ, а не промптом.
       *
       * Промпт это запрещает, и модель всё равно возвращает: на первом же
       * настоящем сайте она принесла июльскую акцию в августе. Спрашивать
       * человека «подтвердить ли скидку, которая кончилась три недели
       * назад» — это ровно тот шум, от которого подтверждения перестают
       * читать. Проверка датой детерминирована, модель — нет.
       *
       * Не «отброшено» и не алерт: баннер, забытый на странице, — обычное
       * дело, а не наша неисправность. Если такая акция уже лежала
       * подтверждённой, её погасит проход по пропавшим — и это верно.
       */
      if (isStale(terms, today)) {
        stale += 1;
        continue;
      }
      // Модель, которой нет во флоу, — выдумка парсера. Пропустить её значит
      // завести скидку на товар, которого у клиента нет.
      const unknown = terms.modelIds.filter((id) => !ctx.modelIds.includes(id));
      if (unknown.length > 0) {
        throw new Error(`модели вне каталога: ${unknown.join(', ')}`);
      }
      good.push(terms);
    } catch (err) {
      rejected.push((err as Error).message);
    }
  }

  /**
   * Одна акция, увиденная дважды.
   *
   * На настоящем сайте клиента модель за два прохода вернула одну и ту же
   * пятнадцатипроцентную акцию — сначала со сроком до 30 августа, потом без
   * срока вовсе: баннер упомянут на странице в двух местах. Отпечатки разные,
   * и клиент получал бы новое подтверждение на ту же скидку.
   *
   * Внутри прохода такие склеиваются по условиям без срока, и остаётся
   * версия СО сроком: явная дата — это больше информации, чем её отсутствие,
   * а бессрочная скидка — обязательство без конца.
   */
  const merged = new Map<string, PromoTerms>();
  for (const terms of good) {
    const key = JSON.stringify([terms.scope, [...terms.modelIds].sort(), terms.discount]);
    const seen = merged.get(key);
    if (!seen || (seen.validUntil === null && terms.validUntil !== null)) merged.set(key, terms);
  }
  const unique = [...merged.values()];

  let created = 0;
  let unchanged = 0;
  for (const terms of unique) {
    const outcome = await upsertPromotion(ctx.tenantId, terms, 'scrape', scrape.url);
    if (outcome === 'created') created += 1; else unchanged += 1;
  }

  /**
   * Гасим пропавшие только если РАЗОБРАЛИ ВСЁ. Неполный список означает,
   * что часть акций мы просто не увидели, а «не увидели» и «сняли с сайта» —
   * это разные вещи с разной ценой ошибки.
   */
  let expired = 0;
  if (rejected.length === 0) {
    expired = await expireMissing(ctx.tenantId, unique.map(fingerprint));
  }

  if (rejected.length > 0) {
    await alert(ctx, `отброшено акций: ${rejected.length}\n\n${rejected.join('\n')}`);
  }

  return { created, unchanged, expired, rejected, stale };
}

/** Страница целиком не нужна: модели нужен текст, а не разметка и скрипты. */
async function fetchPage(url: string): Promise<string> {
  const res = await safeFetch(url, { maxBytes: MAX_HTML });
  const $ = cheerio.load(res.body);
  $('script, style, noscript, svg').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

/**
 * WooCommerce: цены со скидкой берутся из публичного Store API, а не с вёрстки.
 * Числа там уже числа, и модели догадываться не о чем.
 */
async function fetchWooSale(base: string): Promise<string> {
  const url = new URL('/wp-json/wc/store/v1/products', base);
  url.searchParams.set('on_sale', 'true');
  url.searchParams.set('per_page', '50');
  const res = await safeFetch(url.toString(), { maxBytes: MAX_HTML });
  const products = JSON.parse(res.body) as Array<{
    name?: string; slug?: string; prices?: { price?: string; regular_price?: string; sale_price?: string };
    date_on_sale_to?: string | null;
  }>;
  return JSON.stringify(products.map((p) => ({
    name: p.name, slug: p.slug,
    regular: p.prices?.regular_price, sale: p.prices?.sale_price,
    until: p.date_on_sale_to ?? null,
  }))).slice(0, MAX_TEXT);
}

/**
 * Извлечение условий моделью.
 *
 * Список моделей передаётся ей явно и с запретом выдумывать: без него она
 * охотно возвращает «canapele» и «all sofas» как идентификаторы, и скидка
 * уезжает на несуществующий товар.
 */
async function extract(source: string, ctx: ScrapeContext): Promise<unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const system = [
    'You extract promotional discounts from a furniture shop page.',
    'Return ONLY a JSON array. No prose, no code fences, no explanation.',
    '',
    'Each element:',
    '  label      — {"' + ctx.locale + '": "…"} the promotion as the shop names it',
    '  scope      — "sitewide" if it applies to everything, "models" otherwise',
    '  modelIds   — [] for sitewide; otherwise ids from the catalogue list below',
    '  discount   — {"percent": N} where N is HUNDREDTHS of a percent (18% is 1800),',
    '               or {"bani": N} for a fixed amount in the minor currency unit',
    '  validUntil — "YYYY-MM-DD" or null when the page states no end date',
    '',
    `Today is ${today}. A promotion whose end date has already passed must NOT`,
    'be returned at all, even if the page still shows it.',
    '',
    `Catalogue ids: ${ctx.modelIds.join(', ') || '(none)'}.`,
    'Never invent an id. If a promotion names products you cannot map to these ids,',
    'omit that promotion entirely rather than guessing.',
    '',
    'Return [] when the page announces no discounts. An empty array is a correct',
    'answer and is far better than a guess.',
  ].join('\n');

  const { claude, modelFor } = await import('../../../engine/llm/claude.js');
  const res = await claude.messages.create({
    model: modelFor('base'), max_tokens: 1500, system,
    // Ноль намеренно. Отпечаток акции строится из того, что вернула модель,
    // и разброс между проходами означает новый черновик каждые шесть часов
    // на ту же самую акцию.
    temperature: 0,
    messages: [{ role: 'user', content: source }],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  // Модель иногда оборачивает ответ в ```json вопреки запрету.
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(json);
}

/**
 * Алерт платформе, а не клиенту.
 *
 * Клиенту сообщать не о чем: с его стороны просто не появилось черновика.
 * Сломанный парсер — наша неисправность, и чинить её нам.
 */
async function alert(ctx: ScrapeContext, reason: string): Promise<void> {
  const to = process.env.WATCHDOG_EMAIL;
  if (!to) {
    console.error(`акции ${ctx.tenantName}: ${reason} (WATCHDOG_EMAIL не задан, письмо некому)`);
    return;
  }
  const text = `Скрейп акций «${ctx.tenantName}» (${ctx.tenantId}):\n\n${reason}`;
  await send({
    to, subject: `Акции: сбой у «${ctx.tenantName}»`, text,
    html: `<pre style="font:14px/1.5 system-ui">${text.replace(/[<>&]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))}</pre>`,
  }).catch((err: Error) => console.error(`алерт об акциях не ушёл: ${err.message}`));
}
