/**
 * Слияние слоёв конфигурации.
 *
 * Конфигуратор описывается двумя слоями: вертикаль знает нишу и не знает
 * клиентов, клиент переопределяет то, что у него правда своё. Слой, который
 * приходится копировать целиком ради двух правок, — это не слой, а шаблон
 * для копипасты, поэтому переопределение идёт ПО КЛЮЧУ.
 *
 * Правила ровно четыре, и они выбраны так, чтобы поведение было предсказуемо
 * без чтения этого файла:
 *
 *   объект       — глубокое слияние по ключам
 *   список строк — клиент заменяет целиком (порядок блоков — это одно решение,
 *                  а не набор независимых)
 *   список объектов с `id` — слияние по `id`; `enabled: false` выключает
 *                  унаследованный элемент; незнакомый `id` добавляется в конец
 *   всё остальное — значение клиента побеждает
 *
 * `undefined` у клиента означает «не трогал», а не «убрать»: в YAML ключ либо
 * написан, либо нет, и отсутствие ключа не должно стирать умолчание ниши.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const idOf = (v: unknown): string | undefined =>
  isObject(v) && typeof v.id === 'string' ? v.id : undefined;

/** Список объектов, у каждого из которых есть `id`. Пустой список — не он. */
const isIdList = (v: unknown): v is Array<Record<string, Json>> =>
  Array.isArray(v) && v.length > 0 && v.every((item) => idOf(item) !== undefined);

export function mergeLayers(base: Json | undefined, over: Json | undefined): Json | undefined {
  if (over === undefined) return base;
  if (base === undefined) return over;

  if (isObject(base) && isObject(over)) {
    const out: Record<string, Json> = { ...base };
    for (const [k, v] of Object.entries(over)) {
      const merged = mergeLayers(base[k], v);
      if (merged !== undefined) out[k] = merged;
    }
    return out;
  }

  if (isIdList(base) && Array.isArray(over)) {
    const patch = new Map<string, Json>();
    const appended: Json[] = [];
    for (const item of over) {
      const id = idOf(item);
      // Элемент без `id` в списке с `id` — почти всегда забытый ключ, а не
      // осознанное добавление. Молча приписать его в конец значит спрятать
      // опечатку до момента, когда клиент не найдёт свою правку.
      if (id === undefined) throw new Error('элемент списка без «id» там, где остальные с «id»');
      if (patch.has(id) || appended.some((a) => idOf(a) === id)) {
        throw new Error(`повторяющийся id «${id}» в одном слое`);
      }
      if (base.some((b) => idOf(b) === id)) patch.set(id, item);
      else appended.push(item);
    }
    const out: Json[] = [];
    for (const item of base) {
      const id = idOf(item)!;
      const merged = patch.has(id) ? mergeLayers(item, patch.get(id)) : item;
      if (isObject(merged) && merged.enabled === false) continue;
      if (merged !== undefined) out.push(merged);
    }
    for (const item of appended) {
      if (isObject(item) && item.enabled === false) continue;
      out.push(item);
    }
    return out;
  }

  return over;
}
