import type { FlowConfig } from '../flow/schema.js';
import { resolveSelections, type ResolvedSelections, type Selections } from '../flow/select.js';
import type { LengthUnit, PricingConfig, RoundingMode } from './schema.js';

/**
 * Расчёт цены. Детерминированный, ТОЛЬКО на сервере.
 *
 *   units      = quantity × dimension(selections)
 *   listPrice  = ( base(selections) × Π(multipliers) + Σ(addons) ) × units
 *   finalPrice = roundTo( listPrice − discount(listPrice), rounding )
 *
 * **Деньги — целые числа.** Промежуточные величины считаются точной дробью
 * на BigInt и округляются один раз. Иначе `base × 1.15 × 1.08` даёт разный
 * результат в зависимости от порядка множителей, и оферта расходится
 * с бухгалтерией клиента на копейку — в его пользу или в нашу.
 *
 * **Скидка применяется ко всему listPrice, включая addons.** Это решение,
 * а не побочный эффект порядка операций, и оно закреплено тестом: иначе
 * через полгода никто не вспомнит, было ли так задумано.
 *
 * LLM цену не называет — только результат этого вызова.
 */

/** Доли множителя: четыре знака после запятой, дальше конфиг не пускает. */
const SCALE = 10000n;

/** Метр в единицах шага: площадь и длина приводятся к м² и м. */
const PER_METRE: Record<LengthUnit, bigint> = { mm: 1000n, cm: 100n, m: 1n };

export type Discount = { percent: number } | { bani: number };

export interface PriceBreakdown {
  /** Что из выбора на что повлияло — для разбора спорной цены и для позиции оферты. */
  baseBani: number;
  multipliers: Array<{ optionId: string; factor: number }>;
  addonsBani: number;
  units: { quantity: number; dimension: number; total: number };
}

export interface PriceResult {
  listPriceBani: number;
  discountBani: number;
  /** listPrice − discount, до правила округления. */
  netBani: number;
  /** Сколько добавило или сняло правило округления. Ноль при округлении до баня. */
  roundingBani: number;
  finalPriceBani: number;
  vatBani: number;
  /** Ставка в сотых долях процента: 2100 — это 21%. */
  vatRate: number;
  /** finalPrice + НДС при `mode: add`; при `included` равен finalPrice. */
  totalBani: number;
  breakdown: PriceBreakdown;
}

export function priceOf(
  flow: FlowConfig,
  pricing: PricingConfig,
  selections: Selections,
  discount?: Discount,
  where = 'расчёт',
): PriceResult {
  return priceResolved(pricing, resolveSelections(flow, selections, where), discount, where);
}

/** Та же формула на уже проверенном выборе: агент валидирует один раз, считает несколько. */
export function priceResolved(
  pricing: PricingConfig,
  resolved: ResolvedSelections,
  discount?: Discount,
  where = 'расчёт',
): PriceResult {
  let baseBani = 0;
  let addonsBani = 0;
  const multipliers: Array<{ optionId: string; factor: number }> = [];

  for (const { option } of resolved.picks) {
    const effect = option.priceEffect;
    if (!effect) continue;
    if (effect.kind === 'base') baseBani += effect.bani;
    else if (effect.kind === 'addon') addonsBani += effect.bani;
    else multipliers.push({ optionId: option.id, factor: effect.factor });
  }

  const units = unitsOf(pricing, resolved, where);

  // listPrice = (base × Πbp + addons × SCALE^k) × unitsN / (SCALE^k × unitsD)
  let product = 1n;
  for (const m of multipliers) product *= BigInt(Math.round(m.factor * 10000));
  const scaleK = SCALE ** BigInt(multipliers.length);

  const numerator = (BigInt(baseBani) * product + BigInt(addonsBani) * scaleK) * units.n;
  const denominator = scaleK * units.d;
  const listPriceBani = divRound(numerator, denominator);

  const discountBani = discountOf(listPriceBani, discount);
  const netBani = listPriceBani - discountBani;
  const finalPriceBani = roundTo(netBani, pricing.rounding.to, pricing.rounding.mode);

  const { rate, mode } = pricing.vat;
  // «included» — НДС уже внутри цены: его выделяют, а не добавляют.
  const vatBani = rate === 0 ? 0
    : mode === 'add' ? divRound(BigInt(finalPriceBani) * BigInt(rate), 10000n)
      : divRound(BigInt(finalPriceBani) * BigInt(rate), BigInt(10000 + rate));

  return {
    listPriceBani,
    discountBani,
    netBani,
    roundingBani: finalPriceBani - netBani,
    finalPriceBani,
    vatBani,
    vatRate: rate,
    totalBani: mode === 'add' ? finalPriceBani + vatBani : finalPriceBani,
    breakdown: {
      baseBani, multipliers, addonsBani,
      units: { quantity: units.quantity, dimension: units.dimension, total: Number(units.n) / Number(units.d) },
    },
  };
}

interface Units { n: bigint; d: bigint; quantity: number; dimension: number }

function unitsOf(pricing: PricingConfig, resolved: ResolvedSelections, where: string): Units {
  const { quantity: qtyCfg, dimension } = pricing.units;

  const quantity = qtyCfg ? need(resolved, qtyCfg.step, where) : 1;
  if (quantity < 1) throw new Error(`${where}: количество не может быть меньше единицы`);

  if (dimension.kind === 'none') {
    return { n: BigInt(quantity), d: 1n, quantity, dimension: 1 };
  }

  const perMetre = PER_METRE[dimension.unit];
  const width = BigInt(need(resolved, dimension.width.step, where));
  const dimN = dimension.kind === 'area'
    ? width * BigInt(need(resolved, dimension.height.step, where))
    : width;
  const dimD = dimension.kind === 'area' ? perMetre * perMetre : perMetre;

  return {
    n: BigInt(quantity) * dimN,
    d: dimD,
    quantity,
    dimension: Number(dimN) / Number(dimD),
  };
}

function need(resolved: ResolvedSelections, step: string, where: string): number {
  const value = resolved.numbers[step];
  if (value === undefined) {
    throw new Error(`${where}: шаг «${step}» участвует в формуле, но не выбран`);
  }
  return value;
}

function discountOf(listPriceBani: number, discount: Discount | undefined): number {
  if (!discount) return 0;
  const raw = 'percent' in discount
    ? divRound(BigInt(listPriceBani) * BigInt(Math.round(discount.percent * 100)), 10000n)
    : discount.bani;
  // Скидка больше цены — это ошибка конфига акции, а не отрицательная оферта.
  return Math.max(0, Math.min(raw, listPriceBani));
}

/** Деление с округлением к ближайшему, половина вверх. Цены неотрицательны. */
function divRound(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n) throw new Error('расчёт: отрицательная цена');
  return Number((2n * numerator + denominator) / (2n * denominator));
}

function roundTo(bani: number, to: number, mode: RoundingMode): number {
  if (to <= 1) return bani;
  const q = bani / to;
  const steps = mode === 'up' ? Math.ceil(q) : mode === 'down' ? Math.floor(q) : Math.round(q);
  return steps * to;
}
