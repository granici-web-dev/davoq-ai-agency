import type { FlowConfig, StepType } from './schema.js';

/**
 * Что из конфига разрешено увидеть браузеру.
 *
 * Явный белый список, а не «отдадим флоу, только вырежем цены». Разница
 * не стилистическая: при вырезании новое поле в конфиге попадает наружу
 * по умолчанию, и заметить это можно только чтением диффа. Здесь новое поле
 * по умолчанию НЕ попадает никуда.
 *
 * Что остаётся на сервере и почему:
 *   `priceEffect` — прайс клиента. Отдать его в браузер значит опубликовать
 *   структуру наценок мебельщика для его же конкурентов, а заодно создать
 *   соблазн посчитать цену на клиенте. Цена в оферте — всегда серверный
 *   пересчёт, и единственный способ это гарантировать — не давать браузеру
 *   чем считать.
 *
 *   `aiHint` — подсказка агенту. Уходит в промпт на сервере; в разметке
 *   страницы она была бы инструкцией модели, лежащей в открытом виде рядом
 *   с полем ввода того, кто эту модель хочет переубедить.
 */

export interface PublicOption {
  id: string;
  label: string;
  image?: string;
}

export interface PublicStep {
  id: string;
  type: StepType;
  title: string;
  optional?: boolean;
  multiple?: boolean;
  options?: PublicOption[];
  input?: { min: number; max: number; step?: number; unit?: string };
}

export interface PublicFlow {
  locale: string;
  steps: PublicStep[];
}

/**
 * `assetUrl` превращает путь файла на диске в адрес, по которому его отдаёт
 * сервер. Инъекцией, а не константой: загрузчик работает с абсолютными
 * путями, а виджет — с URL, и знать друг о друге им незачем.
 */
export function publicFlow(
  flow: FlowConfig, locale: string, assetUrl: (file: string) => string,
): PublicFlow {
  return {
    locale,
    steps: flow.steps.map((step) => {
      const out: PublicStep = { id: step.id, type: step.type, title: text(step.title, locale) };
      if (step.optional) out.optional = true;
      if (step.multiple) out.multiple = true;
      if (step.input) out.input = step.input;
      if (step.options) {
        out.options = step.options.map((o) => {
          const option: PublicOption = { id: o.id, label: text(o.label, locale) };
          if (o.image) option.image = assetUrl(o.image);
          return option;
        });
      }
      return out;
    }),
  };
}

function text(map: Record<string, string>, locale: string): string {
  const value = map[locale];
  // Локаль проверена на сборке для каждого объявленного языка, так что сюда
  // попадёт разве что язык, которого у тенанта нет. Пустая строка лучше
  // слова undefined в карточке товара.
  return value ?? '';
}
