import { assertShape, type Shape } from '../config/shape.js';
import type { FlowConfig } from '../flow/schema.js';

/**
 * Правила расчёта цены.
 *
 * **Форма формулы — в вертикали, числа — у клиента.** Какие драйверы
 * участвуют, как округлять и как считать НДС, одинаково у всей ниши;
 * база, множители и надбавки живут на вариантах шагов у каждого свои.
 *
 * Дисклеймера здесь нет намеренно: он уже есть в бланке
 * (`offer.text.<locale>.pricing.disclaimer`) и второй копией разъехался бы.
 */

export const ROUNDING_MODES = ['nearest', 'up', 'down'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const DIMENSION_KINDS = ['none', 'area', 'length'] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export const LENGTH_UNITS = ['mm', 'cm', 'm'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const VAT_MODES = ['add', 'included'] as const;
export type VatMode = (typeof VAT_MODES)[number];

export interface PricingConfig {
  /** `to` — шаг округления в банях: 1 — до баня, 100 — до лея. */
  rounding: { to: number; mode: RoundingMode };
  units: {
    /** Шаг «number-input», дающий количество штук. Нет — количество 1. */
    quantity?: { step: string };
    dimension:
      | { kind: 'none' }
      | { kind: 'area'; unit: LengthUnit; width: { step: string }; height: { step: string } }
      | { kind: 'length'; unit: LengthUnit; width: { step: string } };
  };
  /** `rate` — в сотых долях процента: 2100 — это 21%. Дроби в ставке не бывает. */
  vat: { rate: number; mode: VatMode };
}

export const PRICING_SHAPE: Shape = {
  rounding: { to: true, mode: true },
  units: {
    quantity: { step: true },
    dimension: { kind: true, unit: true, width: { step: true }, height: { step: true } },
  },
  vat: { rate: true, mode: true },
};

/**
 * Умолчания движка: округление до баня, единицы не участвуют, НДС нет.
 *
 * Ставка НДС не в умолчаниях и не в нише: она страновая, а не отраслевая.
 * Румынский мебельщик и польский пользуются одной вертикалью и разными
 * ставками, и подставить одну из них молча — это ошибка в фактуре.
 */
export const PRICING_DEFAULTS = {
  rounding: { to: 1, mode: 'nearest' },
  units: { dimension: { kind: 'none' } },
  vat: { rate: 0, mode: 'add' },
} as const;

export function validatePricing(
  value: Record<string, unknown>, flow: FlowConfig, where: string,
): asserts value is PricingConfig & Record<string, unknown> {
  assertShape(value, PRICING_SHAPE, where, 'pricing');

  const rounding = value.rounding as Record<string, unknown>;
  if (typeof rounding?.to !== 'number' || !Number.isInteger(rounding.to) || rounding.to < 1) {
    throw new Error(`${where}: pricing.rounding.to — целое ≥ 1, в банях (100 — до лея)`);
  }
  if (!(ROUNDING_MODES as readonly unknown[]).includes(rounding.mode)) {
    throw new Error(
      `${where}: pricing.rounding.mode — «${String(rounding.mode)}» неизвестен. ` +
      `Есть: ${ROUNDING_MODES.join(', ')}`,
    );
  }

  const vat = value.vat as Record<string, unknown>;
  if (typeof vat?.rate !== 'number' || !Number.isInteger(vat.rate) || vat.rate < 0) {
    throw new Error(`${where}: pricing.vat.rate — целое ≥ 0, в сотых долях процента (21% — это 2100)`);
  }
  if (!(VAT_MODES as readonly unknown[]).includes(vat.mode)) {
    throw new Error(
      `${where}: pricing.vat.mode — «${String(vat.mode)}» неизвестен. ` +
      '«add» — НДС сверху, «included» — уже в цене',
    );
  }

  const units = value.units as Record<string, unknown>;
  const numeric = new Map(flow.steps.filter((s) => s.type === 'number-input').map((s) => [s.id, s]));

  const quantity = units?.quantity as { step?: unknown } | undefined;
  if (quantity !== undefined) numberStep(quantity.step, numeric, 'pricing.units.quantity.step', where);

  const dim = units?.dimension as Record<string, unknown> | undefined;
  const kind = dim?.kind;
  if (!(DIMENSION_KINDS as readonly unknown[]).includes(kind)) {
    throw new Error(
      `${where}: pricing.units.dimension.kind — «${String(kind)}» неизвестен. ` +
      `Есть: ${DIMENSION_KINDS.join(', ')}`,
    );
  }
  if (kind !== 'none') {
    if (!(LENGTH_UNITS as readonly unknown[]).includes(dim?.unit)) {
      throw new Error(
        `${where}: pricing.units.dimension.unit — «${String(dim?.unit)}» неизвестен. ` +
        `Есть: ${LENGTH_UNITS.join(', ')}`,
      );
    }
    numberStep((dim?.width as { step?: unknown })?.step, numeric, 'pricing.units.dimension.width.step', where);
    if (kind === 'area') {
      numberStep((dim?.height as { step?: unknown })?.step, numeric, 'pricing.units.dimension.height.step', where);
    } else if (dim?.height !== undefined) {
      throw new Error(`${where}: pricing.units.dimension — «height» бывает только у «area»`);
    }
  } else if (dim?.unit !== undefined || dim?.width !== undefined) {
    throw new Error(`${where}: pricing.units.dimension.kind = none — единиц и шагов у него не бывает`);
  }
}

/**
 * Хотя бы один вариант обязан задавать базовую цену.
 *
 * Иначе формула честно посчитает ноль, конфигуратор выставит оферту на
 * 0,00 RON, и первым это заметит покупатель. Форму флоу даёт ниша, а цены —
 * клиент, так что проверять это можно только после слияния слоёв.
 */
export function assertPriceable(flow: FlowConfig, where: string): void {
  const hasBase = flow.steps.some(
    (s) => s.options?.some((o) => o.priceEffect?.kind === 'base'),
  );
  if (!hasBase) {
    throw new Error(
      `${where}: ни один вариант флоу не задаёт базовую цену (priceEffect.kind: base). ` +
      'Форму шагов даёт ниша, а цены — слой клиента: похоже, они ещё не заведены.',
    );
  }
}

function numberStep(
  id: unknown, numeric: Map<string, unknown>, at: string, where: string,
): void {
  if (typeof id !== 'string' || id === '') throw new Error(`${where}: ${at} — id шага`);
  if (!numeric.has(id)) {
    throw new Error(
      `${where}: ${at} = «${id}» — такого шага «number-input» во флоу нет. ` +
      'Количество и размеры берутся только из числовых шагов.',
    );
  }
}
