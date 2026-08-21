/**
 * Подстановка значений клиента в шаблоны промпта.
 *
 * Синтаксис нарочно примитивный — только `{имя}`. Ни условий, ни циклов,
 * ни вложенности: шаблон промпта читают и правят люди, которые пишут тексты,
 * а не код, и любая логика в нём рано или поздно превращается в программу,
 * отлаживать которую придётся по ответам бота.
 *
 * Неизвестный плейсхолдер — ошибка загрузки, а не пустая строка. Пустая строка
 * означала бы промпт с дырой посередине, и узнали бы мы об этом по странному
 * поведению бота на живом клиенте.
 */

export type Values = Record<string, string>;

const PLACEHOLDER = /\{([a-z_][a-z0-9_]*)\}/g;

export function render(template: string, values: Values, where = 'шаблон'): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const v = values[name];
    if (v === undefined) {
      throw new Error(
        `${where}: неизвестный плейсхолдер {${name}}. Доступны: ${Object.keys(values).sort().join(', ')}`,
      );
    }
    return v;
  });
}

/** Плейсхолдеры, встречающиеся в тексте. Нужен, чтобы проверять шаблон при загрузке. */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))].sort();
}

/**
 * Список объектов в строку для промпта: «Brașov (+40 720 111 224); București (…)».
 *
 * Формат один на все такие списки намеренно. Промпт — не отчёт: модели нужны
 * факты в предсказуемом виде, а разнообразие оформления только добавляет ей
 * поводов пересказать их по-своему.
 */
export function joinFacts(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      const entries = Object.entries(item as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined && v !== '');
      if (entries.length === 0) return '';
      const [, head] = entries[0]!;
      const rest = entries.slice(1).map(([k, v]) => `${k}: ${String(v)}`);
      return rest.length > 0 ? `${String(head)} (${rest.join(', ')})` : String(head);
    })
    .filter(Boolean)
    .join('; ');
}
