/**
 * Контракт: факты, в которых движок и сайт обязаны сходиться.
 *
 * Здесь ТОЛЬКО то, о чём обе стороны должны договориться: какие продукты
 * существуют, готовы ли они, с какого тарифа продаются, в каких нишах
 * обкатаны. Внутренние ручки движка (какая модель отвечает, сколько чанков
 * в базе) сюда не идут — сайту они не нужны. Тексты сайта тоже не идут —
 * движку не нужны они.
 *
 * Правило простое: если значение нужно ровно одной стороне, ему здесь
 * не место. Общий пакет, куда складывают всё подряд, через полгода
 * перестают трогать.
 */

export type ProductStatus = 'planned' | 'beta' | 'shipped';

/**
 * Вилки. Две платные у каждого агента и одна общая.
 *
 * `individual` не хранится в манифестах и не имеет цены: это не подписка,
 * а разговор. Содержание у неё одно на всех агентов — заказная разработка,
 * интеграции, сайт, SEO, маркетинг, — и повторять его в шести манифестах
 * значило бы завести шесть копий одного текста. Ровно та беда, из-за
 * которой этот пакет и появился.
 *
 * По той же причине её нет и в `PlanFeatures` движка: сайт и SEO не
 * выставляются подпиской и не имеют лимитов, которые кто-то считает.
 */
export type TierName = 'basic' | 'pro';
export const PAID_TIERS: readonly TierName[] = ['basic', 'pro'];

export interface Tier {
  /** Евро в месяц. Годовая считается из неё, а не хранится рядом. */
  price: number;
  /** Потолки: ключ → число. Проверяются сборкой, текст к ним лежит на сайте. */
  limits: Readonly<Record<string, number>>;
  /** Ключи возможностей. Текст к каждому обязан быть на сайте на обоих языках. */
  features: readonly string[];
}

export interface Product {
  /** Одно имя на весь проект: и в движке, и в каталоге сайта. */
  id: string;
  /** Версия обещания. Растёт, когда меняется то, что продукт делает для клиента. */
  version: number;
  status: ProductStatus;
  /** Ключ в PlanFeatures движка. */
  feature: string;
  /**
   * Минимальный тариф старой, платформенной лестницы.
   *
   * Нет — значит продукт заведён уже под поагентную продажу и в той
   * лестнице не стоял. Поле переходное: когда биллинг переведут на
   * подписку по агентам, оно уйдёт у всех.
   */
  plan?: string;
  /** Ниши, где продукт обкатан на живых клиентах. */
  verticals: readonly string[];
  /**
   * Вилки. Нет — значит цену ещё не посчитали.
   *
   * Законно только пока продукт не продаётся: у `shipped` блок обязателен,
   * иначе витрина обещала бы то, чего нельзя купить. Проверяет генератор.
   */
  tiers?: Readonly<Record<TierName, Tier>>;
}

export interface Vertical {
  id: string;
  version: number;
}

/** Заведение: зависит от того, какой агент по счёту у клиента. */
export interface Setup {
  first: number;
  next: number;
  /** Пилотные клиенты в своей нише. */
  pilot: number;
}

export interface VolumeDiscount {
  /** От скольких агентов действует. */
  agents: number;
  /** Доля: 0.1 — минус десять процентов. */
  discount: number;
}

export interface Commerce {
  annualDiscount: number;
  setup: Setup;
  volume: readonly VolumeDiscount[];
}

export { PRODUCTS, VERTICALS, COMMERCE } from './generated.js';

import { COMMERCE, PRODUCTS } from './generated.js';

/** Продукт по имени. Нет такого — undefined, и вызывающий решает, ошибка это или нет. */
export const productById = (id: string): Product | undefined =>
  PRODUCTS.find((p) => p.id === id);

/**
 * Можно ли продавать продукт прямо сейчас.
 *
 * Отдельным именем, а не сравнением со строкой по месту: сайт задаёт этот
 * вопрос на каждой карточке агента, и ответ должен быть один. Пока его
 * не было, сайт держал работающий конфигуратор в «в curând».
 */
export const isSellable = (p: Product): boolean => p.status === 'shipped';

/** Цена, с которой начинается агент. Нет вилок — нечего показывать. */
export const priceFrom = (p: Product): number | undefined => p.tiers?.basic.price;

/**
 * Годовая цена: двенадцать месячных минус скидка, до целого евро.
 *
 * Считается, а не хранится. Двенадцать годовых чисел рядом с двенадцатью
 * месячными обязаны согласовываться, и ничто их к этому не принуждает —
 * достаточно поправить месячную и забыть про годовую. Так на витрине
 * появляется скидка, которой нет.
 *
 * Округление вниз до целого: клиенту называют цену без копеек, и ошибаться
 * в его пользу безопаснее, чем в свою.
 */
export const annualPrice = (monthly: number, c: Commerce = COMMERCE): number =>
  Math.floor(monthly * 12 * (1 - c.annualDiscount));

/** Сколько выходит в месяц при годовой оплате — то число, что стоит на карточке крупно. */
export const annualMonthly = (monthly: number, c: Commerce = COMMERCE): number =>
  Math.floor(annualPrice(monthly, c) / 12);

/**
 * Скидка за несколько агентов. Ноль — если агент один.
 *
 * Складывается с годовой умножением, а не сложением долей: два агента
 * на год — это 0.9 × 0.8, то есть минус 28 %, а не минус 30.
 */
export const volumeDiscount = (agentCount: number, c: Commerce = COMMERCE): number => {
  let out = 0;
  for (const step of c.volume) if (agentCount >= step.agents) out = step.discount;
  return out;
};

/** Заведение для набора из N агентов: первый по одной цене, остальные по другой. */
export const setupFor = (agentCount: number, pilot = false, c: Commerce = COMMERCE): number => {
  if (pilot) return c.setup.pilot;
  if (agentCount <= 0) return 0;
  return c.setup.first + c.setup.next * (agentCount - 1);
};
