import { readFileSync, statSync } from 'node:fs';
import * as cheerio from 'cheerio';

/**
 * Векторная марка в бланке.
 *
 * Клиент приносит логотип в SVG — так его отдаёт любой дизайнер и так он
 * лежит в брендбуке. Растр пришлось бы делать руками на каждом онбординге,
 * в двух цветах (на обложке марка белая, в реквизитах — тёмная) и в двух
 * размерах, а через год никто не вспомнит, из какого исходника он собран.
 *
 * Поэтому движок кладёт вектор в PDF как есть: react-pdf умеет рисовать
 * фигуры сам. Один файл клиента работает и на тёмной обложке, и на светлом
 * листе — цвет подставляется на месте вместо `currentColor`.
 *
 * Поддерживается НАМЕРЕННО УЗКОЕ подмножество SVG: фигуры и заливка.
 * Всё остальное — трансформации, CSS-классы, градиенты, текст, растр внутри
 * вектора — отклоняется с внятной ошибкой. Молча отрисовать логотип не так,
 * как его нарисовал дизайнер, хуже, чем не принять файл на онбординге:
 * первое обнаружит покупатель, второе — мы.
 */

/** Фигуры, которые react-pdf рисует один в один. */
const SHAPE_ATTRS: Record<string, readonly string[]> = {
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  polygon: ['points'],
  polyline: ['points'],
  line: ['x1', 'y1', 'x2', 'y2'],
};

/** Оформление: наследуется от `<svg>` и `<g>` вниз по дереву, как в SVG. */
const PAINT_ATTRS: Record<string, string> = {
  'fill': 'fill',
  'fill-rule': 'fillRule',
  'fill-opacity': 'fillOpacity',
  'stroke': 'stroke',
  'stroke-width': 'strokeWidth',
  'stroke-opacity': 'strokeOpacity',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'opacity': 'opacity',
};

/**
 * Атрибуты, из-за которых картинка на листе разойдётся с исходником.
 * `transform` и `clip-path` двигают и режут фигуры, `class`/`style` тянут CSS,
 * которого в PDF нет вовсе. Отдельный список нужен, чтобы сказать клиенту,
 * ЧТО именно поправить, а не «файл не подошёл».
 */
const REFUSED_ATTRS: Record<string, string> = {
  transform: 'сведите трансформации в контуры (Flatten / Outline) в векторном редакторе',
  'clip-path': 'обрезку нужно свести в контуры',
  mask: 'маску нужно свести в контуры',
  filter: 'эффекты в PDF не переносятся — сведите их в контуры',
  class: 'оформление классами не переносится: перенесите заливку в атрибуты фигур',
  style: 'оформление через style не переносится: перенесите заливку в атрибуты фигур',
};

/** Цвет, подставляемый на месте: марка одна, а фон под ней у блоков разный. */
export const INHERIT = 'currentColor';

export interface VectorShape {
  tag: keyof typeof SHAPE_ATTRS;
  props: Record<string, string | number>;
}

export interface VectorLogo {
  /** Координатная сетка исходника: по ней считается вписывание в бокс. */
  viewBox: string;
  width: number;
  height: number;
  shapes: VectorShape[];
}

export const isVector = (file: string): boolean => /\.svg$/i.test(file);

const num = (v: string): string | number => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : v;
};

/**
 * Разбор SVG в набор фигур.
 *
 * Бросает на всём, что движок не нарисует. Вызывается на сборке бланка,
 * а не на рендере: неподходящий логотип должен ронять онбординг, а не
 * всплывать пустым местом в оферте, ушедшей покупателю.
 */
export function parseVectorLogo(file: string, where: string): VectorLogo {
  const source = readFileSync(file, 'utf8');
  const $ = cheerio.load(source, { xml: true });
  const root = $('svg').first();
  if (root.length === 0) throw new Error(`${where}: в «${file}» нет элемента <svg>`);

  const viewBox = root.attr('viewBox')?.trim();
  const box = viewBox ? viewBox.split(/[\s,]+/).map(Number) : null;
  const [, , boxW, boxH] = box ?? [];
  const width = boxW ?? Number(root.attr('width'));
  const height = boxH ?? Number(root.attr('height'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(
      `${where}: у «${file}» нет пригодного viewBox. ` +
      'Без него неизвестны пропорции марки, и в бланке она встанет искажённой.',
    );
  }

  const shapes: VectorShape[] = [];
  walk($, root, {}, shapes, where, file);

  if (shapes.length === 0) {
    throw new Error(`${where}: в «${file}» нет ни одной фигуры`);
  }
  // Корневой `fill="none"` наследуется вниз — если ни одна фигура не задала
  // свою заливку, файл разберётся успешно и нарисует пустоту.
  const visible = shapes.some((s) => {
    const fill = s.props.fill;
    return (fill !== undefined && fill !== 'none') || s.props.stroke !== undefined;
  });
  if (!visible) {
    throw new Error(
      `${where}: в «${file}» ни у одной фигуры нет заливки или обводки — ` +
      'марка вышла бы пустым местом. Проверьте, что заливка задана атрибутом fill, а не CSS.',
    );
  }

  return { viewBox: viewBox ?? `0 0 ${width} ${height}`, width, height, shapes };
}

type Cheerio = ReturnType<ReturnType<typeof cheerio.load>>;

function walk(
  $: ReturnType<typeof cheerio.load>,
  node: Cheerio,
  inherited: Record<string, string | number>,
  out: VectorShape[],
  where: string,
  file: string,
): void {
  const paint = { ...inherited, ...readPaint(node, where, file) };

  node.children().each((_, child) => {
    const el = $(child);
    const tag = (child as { tagName?: string; name?: string }).tagName
      ?? (child as { name?: string }).name ?? '';

    if (tag === 'g') { walk($, el, paint, out, where, file); return; }
    if (tag === 'title' || tag === 'desc' || tag === 'metadata') return;

    const attrs = SHAPE_ATTRS[tag];
    if (!attrs) {
      throw new Error(
        `${where}: в «${file}» встретился <${tag}>, который движок не рисует. ` +
        `Поддерживаются: ${Object.keys(SHAPE_ATTRS).join(', ')}. ` +
        'Сведите остальное в контуры в векторном редакторе.',
      );
    }

    const props: Record<string, string | number> = { ...paint, ...readPaint(el, where, file) };
    for (const name of attrs) {
      const value = el.attr(name);
      if (value !== undefined) props[name === 'stroke-width' ? 'strokeWidth' : name] = num(value);
    }
    if (props.d === undefined && tag === 'path') {
      throw new Error(`${where}: в «${file}» у <path> нет атрибута d`);
    }
    out.push({ tag, props });
  });
}

function readPaint(node: Cheerio, where: string, file: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const attribs = (node.get(0) as { attribs?: Record<string, string> } | undefined)?.attribs ?? {};

  for (const [name, value] of Object.entries(attribs)) {
    const refusal = REFUSED_ATTRS[name];
    if (refusal) {
      throw new Error(`${where}: в «${file}» встретился атрибут ${name}= — ${refusal}.`);
    }
    const prop = PAINT_ATTRS[name];
    if (!prop) continue;
    if (/^url\(/i.test(value)) {
      throw new Error(
        `${where}: в «${file}» заливка ссылкой (${name}="${value}") — ` +
        'градиенты и паттерны движок не переносит. Сведите марку в плоские цвета.',
      );
    }
    out[prop] = name === 'stroke-width' ? num(value) : value;
  }
  return out;
}

/**
 * Разбор кешируется по пути и времени правки: бланк рендерится на каждую
 * оферту, а файл марки за это время не меняется. Правка файла кеш сбрасывает.
 */
const cache = new Map<string, { mtime: number; logo: VectorLogo }>();

export function vectorLogo(file: string, where: string): VectorLogo {
  const mtime = statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.logo;
  const logo = parseVectorLogo(file, where);
  cache.set(file, { mtime, logo });
  return logo;
}

/**
 * Подстановка цвета блока на месте `currentColor`.
 *
 * Фигура без заливки и обводки тоже получает цвет: у монохромной марки
 * «нет заливки» на практике значит «цвет берётся снаружи», а не «чёрный»,
 * как велит спецификация SVG. Чёрная марка на тёмной обложке — не тот
 * умолчательный исход, который стоит защищать буквой стандарта.
 */
export function paintShape(shape: VectorShape, color: string): Record<string, unknown> {
  const props: Record<string, unknown> = { ...shape.props };
  for (const key of ['fill', 'stroke']) {
    if (props[key] === INHERIT) props[key] = color;
  }
  if (props.fill === undefined && props.stroke === undefined) props.fill = color;
  return props;
}

/** Вписывание в бокс с сохранением пропорций: марку нельзя тянуть. */
export function fitVector(
  logo: VectorLogo, maxWidth: number, maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  return { width: logo.width * scale, height: logo.height * scale };
}
