import { createHash } from 'node:crypto';
import { assertShape, type Shape } from '../config/shape.js';

/**
 * Акция: условия скидки и состояние их подтверждения.
 *
 * Разделение, вокруг которого всё построено: УСЛОВИЯ вычитываются откуда
 * угодно, а РЕШЕНИЕ ставить их в оферту принимает человек. Оферта — документ
 * на бланке клиента, и ошибку в ней объясняет покупателю он, а не парсер.
 *
 * `maxDiscountPercent` ловит «30% вместо 3%», но не ловит две ошибки, которые
 * парсер делает чаще: акцию на диваны, применённую к креслу, и акцию, которая
 * кончилась вчера, но всё ещё висит на странице. Обе видны человеку за секунду
 * и невидимы схеме.
 */

export const PROMO_STATES = ['pending', 'active', 'rejected', 'expired'] as const;
export type PromoState = (typeof PROMO_STATES)[number];

export const PROMO_SOURCES = ['config', 'scrape'] as const;
export type PromoSource = (typeof PROMO_SOURCES)[number];

export const PROMO_SCOPES = ['sitewide', 'models'] as const;
export type PromoScope = (typeof PROMO_SCOPES)[number];

/** Скидка целыми числами: `percent` — сотые доли процента (1800 — это 18%). */
export type PromoDiscount = { percent: number } | { bani: number };

export interface PromoTerms {
  label: Record<string, string>;
  scope: PromoScope;
  modelIds: string[];
  discount: PromoDiscount;
  /** `null` — бессрочная. Такие бывают («постоянная скидка на витрину»). */
  validUntil: string | null;
}

export interface Promotion extends PromoTerms {
  id: string;
  source: PromoSource;
  state: PromoState;
  fingerprint: string;
  sourceUrl?: string | undefined;
  createdAt: string;
  decidedAt?: string | undefined;
}

/** Настройки акций в конфиге тенанта. */
export interface PromoConfig {
  /**
   * Потолок скидки. Черновик выше него не создаётся ВОВСЕ — мусорный черновик
   * хуже отсутствующего: он приучает клиента жать «Отклонить» не читая.
   */
  maxDiscountPercent: number;
  scrape?: {
    url: string;
    everyHours: number;
    strategy: 'html' | 'wp-api';
  };
  /** Акции, заведённые руками. Попадают в базу подтверждёнными. */
  items?: PromoTerms[];
}

export const PROMO_SHAPE: Shape = {
  maxDiscountPercent: true,
  scrape: { url: true, everyHours: true, strategy: true },
  items: {
    '[]': { id: true, label: true, scope: true, modelIds: true, discount: true, validUntil: true },
  },
};

export const PROMO_DEFAULTS = { maxDiscountPercent: 30 } as const;

export function validatePromoConfig(
  value: Record<string, unknown>, where: string,
): asserts value is PromoConfig & Record<string, unknown> {
  assertShape(value, PROMO_SHAPE, where, 'promotions');

  const max = value.maxDiscountPercent;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0 || max > 100) {
    throw new Error(`${where}: promotions.maxDiscountPercent — число от 1 до 100`);
  }

  const scrape = value.scrape as Record<string, unknown> | undefined;
  if (scrape !== undefined) {
    if (typeof scrape.url !== 'string' || !/^https?:\/\//i.test(scrape.url)) {
      throw new Error(`${where}: promotions.scrape.url — адрес страницы с акциями`);
    }
    if (typeof scrape.everyHours !== 'number' || scrape.everyHours < 1) {
      throw new Error(`${where}: promotions.scrape.everyHours — число часов ≥ 1`);
    }
    if (scrape.strategy !== 'html' && scrape.strategy !== 'wp-api') {
      throw new Error(
        `${where}: promotions.scrape.strategy — «html» или «wp-api» ` +
        `(«${String(scrape.strategy)}» неизвестна)`,
      );
    }
  }

  const items = value.items;
  if (items !== undefined) {
    if (!Array.isArray(items)) throw new Error(`${where}: promotions.items — список`);
    items.forEach((item, i) => assertTerms(item, `${where}: promotions.items[${i}]`, max));
  }
}

/**
 * Проверка условий акции. Одна и та же для конфига и для того, что вернула
 * модель, — иначе у скрейпа была бы своя, более снисходительная.
 */
export function assertTerms(
  raw: unknown, where: string, maxPercent: number,
): asserts raw is PromoTerms {
  const t = raw as Record<string, unknown>;
  if (!t || typeof t !== 'object') throw new Error(`${where}: акция — объект`);

  if (!t.label || typeof t.label !== 'object' || Object.keys(t.label).length === 0) {
    throw new Error(`${where}.label — название по локалям, вида { ro: '…' }`);
  }
  if (!(PROMO_SCOPES as readonly unknown[]).includes(t.scope)) {
    throw new Error(`${where}.scope — «sitewide» или «models»`);
  }
  const models = t.modelIds;
  if (models !== undefined && !Array.isArray(models)) {
    throw new Error(`${where}.modelIds — список идентификаторов моделей`);
  }
  if (t.scope === 'models' && (!Array.isArray(models) || models.length === 0)) {
    // Выборочная акция без списка применилась бы ко всему каталогу.
    throw new Error(`${where}: акция на выбранные модели без единой модели`);
  }

  const d = t.discount as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') throw new Error(`${where}.discount — объект`);
  if ('percent' in d) {
    const percent = d.percent;
    if (typeof percent !== 'number' || !Number.isInteger(percent) || percent <= 0) {
      throw new Error(`${where}.discount.percent — целое в сотых долях процента (18% — это 1800)`);
    }
    if (percent > maxPercent * 100) {
      throw new Error(
        `${where}: скидка ${percent / 100}% выше потолка ${maxPercent}% — черновик не создаётся`,
      );
    }
  } else if ('bani' in d) {
    if (typeof d.bani !== 'number' || !Number.isInteger(d.bani) || d.bani <= 0) {
      throw new Error(`${where}.discount.bani — целое число в банях`);
    }
  } else {
    throw new Error(`${where}.discount — либо {percent}, либо {bani}`);
  }

  const until = t.validUntil;
  if (until !== null && until !== undefined) {
    if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      throw new Error(`${where}.validUntil — дата вида 2026-08-31 либо null`);
    }
  }
}

/**
 * Отпечаток условий.
 *
 * Название НЕ входит: подтверждение относится к условиям, а не к тому, как
 * маркетолог назвал распродажу. Переименовали «Летняя» в «Августовская» —
 * это та же акция, и переспрашивать клиента не за что.
 */
/**
 * Акция, срок которой уже прошёл.
 *
 * Отдельной функцией, потому что это проверка ДАТОЙ, а не доверием к модели.
 * Промпт запрещает возвращать просроченные, и модель всё равно возвращает:
 * на первом настоящем сайте она принесла июльскую акцию в августе.
 */
export const isStale = (t: PromoTerms, today: string): boolean =>
  t.validUntil !== null && t.validUntil < today;

export function fingerprint(t: PromoTerms): string {
  const canonical = JSON.stringify([
    t.scope,
    [...t.modelIds].sort(),
    'percent' in t.discount ? ['percent', t.discount.percent] : ['bani', t.discount.bani],
    t.validUntil ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}
