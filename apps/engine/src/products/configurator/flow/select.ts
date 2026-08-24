import type { FlowConfig, FlowOption, FlowStep } from './schema.js';

/**
 * Проверка выбора посетителя против конфига.
 *
 * Выбор приходит из браузера, то есть от кого угодно. Всё, что дальше него
 * считает цену и печатает оферту, обязано опираться только на то, что прошло
 * отсюда: иначе подменённый `priceEffect` в теле запроса становится скидкой
 * на любую сумму, а подменённый id шага — оферту на несуществующий товар.
 *
 * Поэтому здесь нет ни одного «ну ладно, пропустим»: лишний ключ — ошибка,
 * чужой id — ошибка, число вне диапазона — ошибка.
 */

/** Ограничение свободного текста: поле из интернета без потолка — это не поле, а воронка. */
const TEXT_LIMIT = 2000;

export type Selection = string | string[] | number;
export type Selections = Record<string, Selection>;

export interface Pick { step: FlowStep; option: FlowOption }

export interface ResolvedSelections {
  picks: Pick[];
  numbers: Record<string, number>;
  texts: Record<string, string>;
}

export function resolveSelections(
  flow: FlowConfig, selections: Selections, where = 'выбор',
): ResolvedSelections {
  const byId = new Map(flow.steps.map((s) => [s.id, s]));
  for (const id of Object.keys(selections)) {
    if (!byId.has(id)) {
      throw new Error(`${where}: шага «${id}» во флоу нет`);
    }
  }

  const picks: Pick[] = [];
  const numbers: Record<string, number> = {};
  const texts: Record<string, string> = {};

  for (const step of flow.steps) {
    const value = selections[step.id];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      if (step.optional) continue;
      throw new Error(`${where}: шаг «${step.id}» обязателен`);
    }

    if (step.type === 'number-input') {
      numbers[step.id] = number(step, value, where);
      continue;
    }
    if (step.type === 'text') {
      if (typeof value !== 'string') throw new Error(`${where}: шаг «${step.id}» — строка`);
      if (value.length > TEXT_LIMIT) {
        throw new Error(`${where}: шаг «${step.id}» — не длиннее ${TEXT_LIMIT} символов`);
      }
      texts[step.id] = value;
      continue;
    }

    const ids = Array.isArray(value) ? value : [value];
    if (!step.multiple && ids.length > 1) {
      throw new Error(`${where}: шаг «${step.id}» принимает один вариант, а не ${ids.length}`);
    }
    const seen = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string') throw new Error(`${where}: шаг «${step.id}» — id варианта строкой`);
      if (seen.has(id)) throw new Error(`${where}: шаг «${step.id}» — вариант «${id}» выбран дважды`);
      seen.add(id);
      const option = step.options?.find((o) => o.id === id);
      if (!option) throw new Error(`${where}: у шага «${step.id}» нет варианта «${id}»`);
      picks.push({ step, option });
    }
  }

  return { picks, numbers, texts };
}

function number(step: FlowStep, value: Selection, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${where}: шаг «${step.id}» — целое число`);
  }
  const input = step.input;
  if (!input) throw new Error(`${where}: у шага «${step.id}» нет диапазона`);
  if (value < input.min || value > input.max) {
    throw new Error(`${where}: шаг «${step.id}» — от ${input.min} до ${input.max} (получено ${value})`);
  }
  if (input.step !== undefined && (value - input.min) % input.step !== 0) {
    throw new Error(
      `${where}: шаг «${step.id}» — кратно ${input.step} от ${input.min} (получено ${value})`,
    );
  }
  return value;
}
