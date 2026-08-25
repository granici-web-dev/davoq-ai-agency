/**
 * Предпросмотр бланка оферты.
 *
 *   npm run offer:preview -- sofabelle
 *   npm run offer:preview -- _template --locale en
 *
 * Собирает PDF на выдуманных данных, чтобы положить его рядом с существующей
 * офертой клиента и сверить глазами. Базы данных не требует: слой клиента
 * читается с диска, слой ниши — из репозитория. Это и есть смысл фазы —
 * проверить бланк ДО того, как появятся флоу, агент и расчёт.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { buildOfferTemplate, clientOfferLayer } from '../src/products/configurator/offer/load.js';
import { renderOffer } from '../src/products/configurator/offer/render.js';
import { sampleOffer } from '../src/products/configurator/offer/sample.js';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!id) {
  console.error('нужен идентификатор клиента: npm run offer:preview -- <id> [--locale ro]');
  process.exit(1);
}

const clientsRoot = resolve(process.env.CLIENTS_DIR ?? 'clients');
const dir = join(clientsRoot, id);
if (!existsSync(dir)) {
  console.error(`клиент «${id}» не найден в ${clientsRoot}`);
  process.exit(1);
}

/** Ниша и локали берутся из существующего config.yaml — второго источника правды не заводим. */
const configFile = join(dir, 'config.yaml');
const config = existsSync(configFile)
  ? (parse(readFileSync(configFile, 'utf8')) as Record<string, any> | null)
  : null;

const verticalId = (config?.vertical as string | undefined) ?? null;
const layer = clientOfferLayer(dir);

/**
 * Локали берутся из config.yaml клиента. У `_template` его нет — это каталог
 * с образцом бланка, а не клиент; тогда локали читаются из самого бланка.
 */
const declared = layer && typeof layer === 'object' && !Array.isArray(layer)
  ? Object.keys(((layer as Record<string, unknown>).text ?? {}) as Record<string, unknown>)
  : [];
const locales: string[] = config?.locale?.supported ?? (declared.length > 0 ? declared : ['ro']);
const locale = flag('locale') ?? locales[0]!;

if (!locales.includes(locale)) {
  console.error(`локаль «${locale}» не объявлена у клиента (есть: ${locales.join(', ')})`);
  process.exit(1);
}

const template = buildOfferTemplate({
  verticalId,
  clientLayer: layer,
  locales,
  where: `бланк оферты «${id}»`,
});

const pdf = await renderOffer(template, sampleOffer(locale));

const outDir = resolve(process.env.PREVIEW_DIR ?? 'var/preview');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `oferta-${id}-${locale}.pdf`);
writeFileSync(out, pdf);

console.log(`ниша: ${verticalId ?? '— (только слой клиента)'}`);
console.log(`блоки: ${template.blocks.join(' → ')}`);
console.log(`шрифт: ${template.theme.fontFamily}${template.theme.fonts.length ? ` (+${template.theme.fonts.length} файлов)` : ''}`);
console.log(`\n${out}  (${(pdf.length / 1024).toFixed(0)} КБ)`);
