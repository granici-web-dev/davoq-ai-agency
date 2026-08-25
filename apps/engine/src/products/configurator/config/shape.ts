/**
 * Проверка формы конфига: неизвестный ключ — ошибка, а не пустое место.
 *
 * Причина та же, что у загрузчика вертикалей. Опечатка в ключе — это не «ключ
 * не сработал», это «умолчание тихо осталось прежним»: клиент правит `colours`
 * вместо `colors`, видит прежний бланк и приходит к нам с «ваш конфиг не
 * работает». Падать надо при apply, с указанием пути, а не через неделю.
 *
 * Схема описывается литералом, а не библиотекой валидации: правил десяток,
 * а зависимость ради них тянуть не за чем — тот же выбор, что в vertical.ts.
 *
 *   true            — лист: значение не разглядываем
 *   { a: …, b: … }  — объект ровно с этими ключами
 *   { '*': … }      — словарь с произвольными ключами (локали), значения одной формы
 *   { '[]': … }     — список элементов одной формы
 */

export type Shape = true | { [key: string]: Shape };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Подсказка по опечатке: без неё сообщение «неизвестный ключ» бесполезно. */
function nearest(key: string, known: string[]): string | undefined {
  const k = key.toLowerCase();
  return known.find((c) => {
    const s = c.toLowerCase();
    return s.startsWith(k.slice(0, 3)) || s === k.replace(/s$/, '') || `${s}s` === k;
  });
}

export function assertShape(value: unknown, shape: Shape, where: string, path = ''): void {
  if (shape === true) return;
  const at = path || 'корень';

  if ('[]' in shape) {
    if (!Array.isArray(value)) throw new Error(`${where}: «${at}» — список, а не ${typeof value}`);
    value.forEach((item, i) => assertShape(item, shape['[]']!, where, `${path}[${i}]`));
    return;
  }

  if (!isObject(value)) throw new Error(`${where}: «${at}» — объект, а не ${typeof value}`);

  if ('*' in shape) {
    for (const [k, v] of Object.entries(value)) {
      assertShape(v, shape['*']!, where, path ? `${path}.${k}` : k);
    }
    return;
  }

  const known = Object.keys(shape);
  for (const [k, v] of Object.entries(value)) {
    const child = shape[k];
    if (child === undefined) {
      const hint = nearest(k, known);
      throw new Error(
        `${where}: неизвестный ключ «${path ? `${path}.${k}` : k}»` +
        (hint ? `. Возможно, имелось в виду «${hint}»` : `. Известные здесь: ${known.join(', ')}`),
      );
    }
    assertShape(v, child, where, path ? `${path}.${k}` : k);
  }
}

/** Обязательные ключи. Проверяется после слияния слоёв: недостающее мог дать любой из них. */
export function assertRequired(
  value: Record<string, unknown>, keys: string[], where: string, path: string,
): void {
  const missing = keys.filter((k) => value[k] === undefined || value[k] === '');
  if (missing.length > 0) {
    throw new Error(`${where}: в «${path}» не хватает: ${missing.join(', ')}`);
  }
}
