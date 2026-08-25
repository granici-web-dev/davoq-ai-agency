import { assertShape, type Shape } from '../config/shape.js';

/**
 * Флоу конфигуратора: шаги, которые видит посетитель.
 *
 * Порядок и состав — целиком из конфига; движок шаблонов шагов не знает.
 * Типы шагов ЗАКРЫТЫ по той же причине, что и блоки бланка: свой тип шага
 * означал бы код на клиента, то есть разработчика на каждую продажу.
 *
 * Базовый флоу живёт в вертикали, потому что «размер → наполнитель → ткань →
 * цвет» одинаков у любого мебельщика. Клиент переопределяет по `id`: свои
 * опции, свои цены, свои картинки, `enabled: false` на ненужный шаг.
 */

export const STEP_TYPES = ['cards', 'color-grid', 'number-input', 'text'] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** Шаги, у которых есть варианты выбора. Остальные вариантов не принимают. */
const OPTION_STEPS: readonly StepType[] = ['cards', 'color-grid'];

export const PRICE_EFFECTS = ['base', 'multiplier', 'addon'] as const;

export type PriceEffect =
  | { kind: 'base'; bani: number }
  | { kind: 'multiplier'; factor: number }
  | { kind: 'addon'; bani: number };

export interface FlowOption {
  id: string;
  label: Record<string, string>;
  image?: string;
  priceEffect?: PriceEffect;
}

export interface FlowStep {
  id: string;
  type: StepType;
  title: Record<string, string>;
  /** Подсказка агенту, как помогать с выбором. Посетителю не показывается. */
  aiHint?: Record<string, string>;
  /** Шаг можно пропустить. По умолчанию отвечать обязательно. */
  optional?: boolean;
  /** Можно выбрать несколько вариантов (пуф, топпер, подлокотники). */
  multiple?: boolean;
  options?: FlowOption[];
  input?: { min: number; max: number; step?: number; unit?: string };
}

export interface FlowConfig { steps: FlowStep[] }

export const FLOW_SHAPE: Shape = {
  steps: {
    '[]': {
      id: true, type: true, title: true, aiHint: true,
      optional: true, multiple: true, enabled: true,
      options: { '[]': { id: true, label: true, image: true, priceEffect: true, enabled: true } },
      input: { min: true, max: true, step: true, unit: true },
    },
  },
};

/**
 * Проверка после слияния слоёв: форму шага дала ниша, числа — клиент,
 * и недостающее мог не дать ни тот ни другой.
 */
export function validateFlow(
  value: Record<string, unknown>, locales: string[], where: string,
): asserts value is FlowConfig & Record<string, unknown> {
  assertShape(value, FLOW_SHAPE, where, 'flow');

  const steps = value.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`${where}: flow.steps — непустой список`);
  }

  const seen = new Set<string>();
  steps.forEach((raw, i) => {
    const step = raw as Record<string, unknown>;
    const id = step.id;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`${where}: flow.steps[${i}] без «id» — по нему клиент переопределяет шаг`);
    }
    if (seen.has(id)) throw new Error(`${where}: шаг «${id}» указан дважды`);
    seen.add(id);

    const at = `flow.steps[${i}] («${id}»)`;
    const type = step.type;
    if (typeof type !== 'string' || !(STEP_TYPES as readonly string[]).includes(type)) {
      throw new Error(
        `${where}: ${at} — тип «${String(type)}» движку неизвестен. ` +
        `Есть: ${STEP_TYPES.join(', ')}. Нужен новый — он добавляется в движок, а не в конфиг клиента.`,
      );
    }
    localized(step.title, locales, `${at}.title`, where);
    if (step.aiHint !== undefined) localized(step.aiHint, locales, `${at}.aiHint`, where);

    const options = step.options;
    if (OPTION_STEPS.includes(type as StepType)) {
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error(`${where}: ${at} — шаг типа «${type}» без вариантов выбора`);
      }
      const ids = new Set<string>();
      options.forEach((o, j) => option(o, ids, locales, `${at}.options[${j}]`, where));
    } else if (options !== undefined) {
      throw new Error(`${where}: ${at} — у шага типа «${type}» вариантов выбора не бывает`);
    }

    if (type === 'number-input') input(step.input, at, where);
    else if (step.input !== undefined) {
      throw new Error(`${where}: ${at} — «input» только у шага типа «number-input»`);
    }
  });
}

function option(
  raw: unknown, ids: Set<string>, locales: string[], at: string, where: string,
): void {
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== 'string' || id === '') {
    throw new Error(`${where}: ${at} без «id» — по нему клиент переопределяет вариант`);
  }
  if (ids.has(id)) throw new Error(`${where}: ${at} — вариант «${id}» указан дважды`);
  ids.add(id);
  localized(o.label, locales, `${at}.label`, where);
  if (o.priceEffect !== undefined) priceEffect(o.priceEffect, `${at}.priceEffect`, where);
}

/**
 * Влияние варианта на цену.
 *
 * Деньги — целые бани. Дробь в конфиге цены — это не «почти то же самое»,
 * а расхождение с бухгалтерией клиента, которое всплывёт на сотой оферте.
 * Множитель ограничен четырьмя знаками после запятой: с ним движок считает
 * в целых долях, и порядок умножений перестаёт влиять на результат.
 */
function priceEffect(raw: unknown, at: string, where: string): void {
  const e = raw as Record<string, unknown>;
  const kind = e.kind;
  if (typeof kind !== 'string' || !(PRICE_EFFECTS as readonly string[]).includes(kind)) {
    throw new Error(
      `${where}: ${at}.kind — «${String(kind)}» неизвестен. Есть: ${PRICE_EFFECTS.join(', ')}`,
    );
  }
  if (kind === 'multiplier') {
    const factor = e.factor;
    if (typeof factor !== 'number' || !(factor > 0)) {
      throw new Error(`${where}: ${at}.factor — положительное число`);
    }
    if (!Number.isInteger(Math.round(factor * 10000)) || Math.abs(factor * 10000 - Math.round(factor * 10000)) > 1e-6) {
      throw new Error(`${where}: ${at}.factor — не больше четырёх знаков после запятой («${factor}»)`);
    }
    if (e.bani !== undefined) throw new Error(`${where}: ${at} — у множителя не бывает «bani»`);
    return;
  }
  const bani = e.bani;
  if (typeof bani !== 'number' || !Number.isInteger(bani) || bani < 0) {
    throw new Error(
      `${where}: ${at}.bani — целое неотрицательное число в банях («${String(bani)}» не подходит). ` +
      '450 леев — это 45000.',
    );
  }
  if (e.factor !== undefined) throw new Error(`${where}: ${at} — у «${kind}» не бывает «factor»`);
}

function input(raw: unknown, at: string, where: string): void {
  const v = raw as Record<string, unknown> | undefined;
  if (!v || typeof v !== 'object') {
    throw new Error(`${where}: ${at} — у шага «number-input» обязателен «input» с min и max`);
  }
  for (const key of ['min', 'max'] as const) {
    if (typeof v[key] !== 'number' || !Number.isInteger(v[key])) {
      throw new Error(`${where}: ${at}.input.${key} — целое число`);
    }
  }
  if ((v.min as number) >= (v.max as number)) {
    throw new Error(`${where}: ${at}.input — min должен быть меньше max`);
  }
  if (v.step !== undefined && (typeof v.step !== 'number' || !Number.isInteger(v.step) || v.step <= 0)) {
    throw new Error(`${where}: ${at}.input.step — целое положительное число`);
  }
}

/** Перевод обязателен для каждой локали тенанта: пропуск доедет до посетителя словом undefined. */
function localized(raw: unknown, locales: string[], at: string, where: string): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${where}: ${at} — объект вида { ro: '…' }`);
  }
  const map = raw as Record<string, unknown>;
  for (const locale of locales) {
    if (typeof map[locale] !== 'string' || map[locale] === '') {
      throw new Error(`${where}: ${at}.${locale} не задан — локаль объявлена у клиента`);
    }
  }
}
