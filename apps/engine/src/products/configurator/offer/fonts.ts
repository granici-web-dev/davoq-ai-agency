import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FontFace, OfferTemplate } from './schema.js';

/**
 * Шрифты бланка и проверка того, что они покрывают его текст.
 *
 * Это не педантизм. Первый же собранный бланк вышел с «Ofert de pre» вместо
 * «Ofertă de preț»: встроенная в PDF Helvetica не содержит румынской
 * диакритики, и недостающие буквы не заменяются, не подсвечиваются
 * и не роняют рендер — они ПРОСТО ИСЧЕЗАЮТ. Коммерческий документ уходит
 * покупателю с выеденными словами, и замечает это он, а не мы.
 *
 * Каждый новый клиент приносит свой шрифт — значит, и свой шанс наступить
 * на это. Поэтому покрытие проверяется, а не подразумевается.
 */

const require = createRequire(import.meta.url);

/**
 * Шрифт движка по умолчанию: тот же Geist, что и в панели.
 * Латиница с диакритикой, кириллица и типографский минус — всё на месте.
 */
export function defaultFonts(): FontFace[] {
  // `geist/package.json` пакет наружу не отдаёт, поэтому опираемся на точку
  // входа, которая экспортирована. Проверка существования файла — чтобы
  // перестановка каталогов в пакете упала здесь с внятным текстом,
  // а не глубже, в разборе шрифта.
  const root = dirname(require.resolve('geist/font/sans'));
  const sans = (file: string): string => {
    const full = join(root, 'fonts/geist-sans', file);
    if (!existsSync(full)) {
      throw new Error(`шрифт бланка не найден: ${full}. Пакет geist изменил раскладку файлов?`);
    }
    return full;
  };
  return [
    { family: 'Geist', src: sans('Geist-Regular.ttf'), weight: 400 },
    { family: 'Geist', src: sans('Geist-Medium.ttf'), weight: 500 },
    { family: 'Geist', src: sans('Geist-SemiBold.ttf'), weight: 600 },
  ];
}

/** Символы, которые точно есть во встроенных шрифтах PDF (Helvetica и родня). */
const BUILT_IN = new Set<number>([
  ...range(0x20, 0x7e), ...range(0xa0, 0xff),
  0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x20ac,
]);

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/**
 * Кодовые точки, которые умеет рисовать шрифт.
 *
 * Читается таблица `cmap` — форматы 4 и 12 покрывают всё, что встречается
 * в современных TTF и OTF. Тащить ради этого разбор шрифтов целиком незачем:
 * нам нужен один вопрос — «есть ли такой символ».
 */
export function glyphsOf(path: string): Set<number> {
  const d = readFileSync(path);
  const codes = new Set<number>();

  const numTables = d.readUInt16BE(4);
  let cmapOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const o = 12 + 16 * i;
    if (d.toString('ascii', o, o + 4) === 'cmap') cmapOffset = d.readUInt32BE(o + 8);
  }
  if (!cmapOffset) return codes;

  let best = 0;
  const n = d.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < n; i++) {
    const p = cmapOffset + 4 + 8 * i;
    const platform = d.readUInt16BE(p);
    const encoding = d.readUInt16BE(p + 2);
    const unicode = (platform === 3 && (encoding === 1 || encoding === 10))
      || (platform === 0 && encoding >= 3);
    if (unicode) best = cmapOffset + d.readUInt32BE(p + 4);
  }
  if (!best) return codes;

  const format = d.readUInt16BE(best);
  if (format === 4) {
    const segX2 = d.readUInt16BE(best + 6);
    const endsAt = best + 14;
    const startsAt = endsAt + segX2 + 2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = d.readUInt16BE(endsAt + 2 * i);
      const start = d.readUInt16BE(startsAt + 2 * i);
      if (end === 0xffff) continue;
      for (let c = start; c <= end; c++) codes.add(c);
    }
  } else if (format === 12) {
    const groups = d.readUInt32BE(best + 12);
    for (let i = 0; i < groups; i++) {
      const g = best + 16 + 12 * i;
      const start = d.readUInt32BE(g);
      const end = d.readUInt32BE(g + 4);
      // Верхний предел на всякий случай: испорченный шрифт не должен съесть память.
      for (let c = start; c <= Math.min(end, start + 0xffff); c++) codes.add(c);
    }
  }
  return codes;
}

const cache = new Map<string, Set<number>>();

function coverage(template: OfferTemplate): Set<number> {
  const files = template.theme.fonts.filter((f) => f.family === template.theme.fontFamily);
  // Семейство без единого файла — встроенный шрифт PDF.
  if (files.length === 0) return BUILT_IN;

  const all = new Set<number>();
  for (const f of files) {
    let set = cache.get(f.src);
    if (!set) { set = glyphsOf(f.src); cache.set(f.src, set); }
    for (const c of set) all.add(c);
  }
  return all;
}

/** Весь текст бланка, который печатается из шаблона (не из данных оферты). */
function templateText(template: OfferTemplate): Map<string, string[]> {
  const byLocale = new Map<string, string[]>();
  for (const [locale, text] of Object.entries(template.text)) {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(text);
    byLocale.set(locale, strings);
  }
  return byLocale;
}

/**
 * Падать на сборке шаблона, а не показывать выеденный бланк.
 *
 * Проверяется текст ШАБЛОНА: он наш и клиента, его можно починить. Текст
 * ДАННЫХ (имя покупателя, название ткани) приходит от посетителя, и требовать
 * от шрифта покрытия любого имени на свете нельзя — про него рендер
 * предупреждает в журнал.
 */
export function assertGlyphCoverage(template: OfferTemplate, where: string): void {
  const has = coverage(template);
  for (const [locale, strings] of templateText(template)) {
    const missing = new Set<string>();
    for (const s of strings) {
      for (const ch of s) {
        const cp = ch.codePointAt(0)!;
        if (cp >= 0x20 && !has.has(cp)) missing.add(ch);
      }
    }
    if (missing.size > 0) {
      throw new Error(
        `${where}: шрифт «${template.theme.fontFamily}» не содержит символов ` +
        `${[...missing].map((c) => `«${c}»`).join(' ')} — они пропадут из бланка ` +
        `в локали «${locale}» молча, без ошибки и без замены. ` +
        'Нужен шрифт с этими глифами либо другой текст.',
      );
    }
  }
}

/** Про данные — предупреждение в журнал: имя покупателя мы не выбираем. */
export function warnUncoveredData(template: OfferTemplate, strings: string[]): void {
  const has = coverage(template);
  const missing = new Set<string>();
  for (const s of strings) {
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x20 && !has.has(cp)) missing.add(ch);
    }
  }
  if (missing.size > 0) {
    console.warn(
      `оферта: шрифт «${template.theme.fontFamily}» не содержит ` +
      `${[...missing].map((c) => `«${c}»`).join(' ')} — эти символы не попадут в PDF`,
    );
  }
}
