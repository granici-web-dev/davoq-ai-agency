import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { mergeLayers, type Json } from '../config/layers.js';
import { assertGlyphCoverage } from './fonts.js';
import { defaultFonts } from './fonts.js';
import { OFFER_DEFAULTS, validateOffer, type OfferTemplate } from './schema.js';
import { isVector, vectorLogo } from './svg.js';

/**
 * Сборка бланка из слоёв: умолчания движка → вертикаль → клиент.
 *
 * Пути к файлам (логотип, шрифты, юртекст) разворачиваются В КАЖДОМ СЛОЕ
 * ДО слияния. После слияния уже не видно, чей это был путь, и «assets/logo.png»
 * от вертикали искался бы у клиента — то есть шаблон ниши ломался бы у всех,
 * кто не завёл файл с тем же именем.
 *
 * Источник слоя клиента здесь намеренно не зашит: сейчас это YAML на диске
 * (предпросмотр и apply), дальше — jsonb из базы. Загрузчик принимает готовый
 * объект и о происхождении не спрашивает.
 */

const VERTICALS_ROOT = resolve(
  process.env.VERTICALS_DIR ?? new URL('../../../verticals', import.meta.url).pathname,
);

/** Ссылка на файл — только с явным префиксом: иначе обычный текст с точкой стал бы путём. */
const FILE_PREFIX = 'file:';

function inside(dir: string, rel: string, where: string): string {
  const full = resolve(join(dir, rel));
  if (!full.startsWith(resolve(dir) + '/')) {
    throw new Error(`${where}: путь «${rel}» выходит за каталог слоя`);
  }
  if (!existsSync(full)) throw new Error(`${where}: файл «${rel}» не найден`);
  return full;
}

/** Разворачивает `file:` в содержимое, а пути к ассетам — в абсолютные. */
function resolvePaths(layer: Json | undefined, dir: string, where: string): Json | undefined {
  if (layer === undefined || layer === null || typeof layer !== 'object' || Array.isArray(layer)) {
    return layer;
  }
  const out = { ...layer } as Record<string, Json>;

  if (typeof out.logo === 'string') out.logo = inside(dir, out.logo, where);

  const hero = out.hero;
  if (hero && typeof hero === 'object' && !Array.isArray(hero)) {
    const h = { ...(hero as Record<string, Json>) };
    for (const key of ['image', 'logo'] as const) {
      if (typeof h[key] === 'string') h[key] = inside(dir, h[key] as string, `${where}: hero.${key}`);
    }
    out.hero = h;
  }

  if (Array.isArray(out.gallery)) {
    out.gallery = out.gallery.map((file, i) =>
      typeof file === 'string' ? inside(dir, file, `${where}: gallery[${i}]`) : file);
  }

  const theme = out.theme;
  if (theme && typeof theme === 'object' && !Array.isArray(theme)) {
    const fonts = (theme as Record<string, Json>).fonts;
    if (Array.isArray(fonts)) {
      (out.theme as Record<string, Json>) = {
        ...(theme as Record<string, Json>),
        fonts: fonts.map((f, i) => {
          if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
          const font = { ...(f as Record<string, Json>) };
          if (typeof font.src === 'string') {
            font.src = inside(dir, font.src, `${where}: theme.fonts[${i}]`);
          }
          return font;
        }),
      };
    }
  }

  const text = out.text;
  if (text && typeof text === 'object' && !Array.isArray(text)) {
    const locales: Record<string, Json> = {};
    for (const [locale, block] of Object.entries(text as Record<string, Json>)) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) { locales[locale] = block; continue; }
      const resolved: Record<string, Json> = {};
      for (const [key, value] of Object.entries(block as Record<string, Json>)) {
        resolved[key] = typeof value === 'string' && value.startsWith(FILE_PREFIX)
          ? readFileSync(inside(dir, value.slice(FILE_PREFIX.length), `${where}: text.${locale}.${key}`), 'utf8').trimEnd()
          : value;
      }
      locales[locale] = resolved;
    }
    out.text = locales;
  }

  return out;
}

/** Слой ниши. Ниша не задана — законное состояние: бланк соберётся из умолчаний и слоя клиента. */
export function verticalOfferLayer(verticalId: string | null | undefined): Json | undefined {
  if (!verticalId) return undefined;
  const dir = join(VERTICALS_ROOT, verticalId);
  const file = join(dir, 'configurator.yaml');
  if (!existsSync(file)) return undefined;
  const raw = parse(readFileSync(file, 'utf8')) as Record<string, Json> | null;
  const where = `${verticalId}/configurator.yaml`;
  if (raw && raw.schema !== 1) throw new Error(`${where}: поддерживается только schema: 1`);
  return resolvePaths(raw?.offer, dir, where);
}

/** Слой клиента с диска. Из базы придёт тот же объект — тогда этот шаг просто пропускается. */
export function clientOfferLayer(clientDir: string): Json | undefined {
  const file = join(clientDir, 'configurator.yaml');
  if (!existsSync(file)) return undefined;
  const raw = parse(readFileSync(file, 'utf8')) as Record<string, Json> | null;
  const where = `${clientDir}/configurator.yaml`;
  if (raw && raw.schema !== 1) throw new Error(`${where}: поддерживается только schema: 1`);
  return resolvePaths(raw?.offer, clientDir, where);
}

export interface OfferSource {
  verticalId?: string | null;
  /** Слой клиента: с диска через `clientOfferLayer`, позже — jsonb из базы. */
  clientLayer?: Json | undefined;
  /** Локали тенанта: тексты проверяются для каждой. */
  locales: string[];
  where?: string;
}

export function buildOfferTemplate(src: OfferSource): OfferTemplate {
  const where = src.where ?? 'бланк оферты';
  // Файлы шрифта движка резолвятся здесь, а не в литерале умолчаний: путь
  // зависит от того, где лежит node_modules, и константой быть не может.
  const defaults = {
    ...OFFER_DEFAULTS,
    theme: { ...OFFER_DEFAULTS.theme, fonts: defaultFonts() },
  } as unknown as Json;

  const merged = mergeLayers(
    mergeLayers(defaults, verticalOfferLayer(src.verticalId)),
    src.clientLayer,
  ) as Record<string, unknown>;

  validateOffer(merged, src.locales, where);
  const template = merged as unknown as OfferTemplate;
  assertGlyphCoverage(template, where);
  assertAssets(template, where);
  return template;
}

/**
 * Ассеты собранного бланка: файл на месте, вектор разбирается.
 *
 * Проверяется ПОСЛЕ слияния, хотя `resolvePaths` уже проверял каждый слой:
 * слой клиента скоро будет приходить jsonb из базы, минуя резолвер путей,
 * и тогда эта проверка останется единственной.
 *
 * Причина строгости — в поведении рендера: react-pdf на недоступной картинке
 * не падает, а печатает ENOENT в stderr и отдаёт ГОТОВЫЙ PDF с дырой на месте
 * марки. Такой бланк уходит покупателю, и первым его увидит покупатель.
 */
function assertAssets(template: OfferTemplate, where: string): void {
  const files: Array<[string, string | undefined]> = [
    ['offer.logo', template.logo],
    ['offer.hero.logo', template.hero?.logo],
    ['offer.hero.image', template.hero?.image],
    ...(template.gallery ?? []).map((f, i): [string, string] => [`offer.gallery[${i}]`, f]),
  ];
  for (const [path, file] of files) {
    if (typeof file !== 'string') continue;
    if (!existsSync(file)) throw new Error(`${where}: ${path} — файла «${file}» нет`);
    // Вектор разбирается на сборке, а не на рендере: SVG с непереносимой
    // в PDF разметкой должен ронять онбординг, а не выдачу оферты.
    if (isVector(file)) vectorLogo(file, `${where}: ${path}`);
  }
}
