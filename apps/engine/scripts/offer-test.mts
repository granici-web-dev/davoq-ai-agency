/**
 * Бланк оферты: слои, схема, шрифты, рендер.
 *
 *   npm run test:offer
 *
 * Базы данных не требует — всё, что здесь проверяется, живёт в файлах.
 * Главная проверка не «собирается ли PDF», а «дошёл ли текст до PDF целым»:
 * первый собранный бланк вышел с «Ofert de pre» вместо «Ofertă de preț»,
 * и ни рендер, ни типы об этом не сообщили.
 */
import { resolve } from 'node:path';
import { mergeLayers, type Json } from '../src/products/configurator/config/layers.js';
import { assertShape } from '../src/products/configurator/config/shape.js';
import { buildOfferTemplate, clientOfferLayer } from '../src/products/configurator/offer/load.js';
import { glyphsOf, defaultFonts } from '../src/products/configurator/offer/fonts.js';
import { renderOffer } from '../src/products/configurator/offer/render.js';
import { sampleOffer } from '../src/products/configurator/offer/sample.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };
const eq = (got: unknown, want: unknown, m: string): void =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m)
    : bad(`${m}\n      получено: ${JSON.stringify(got)}\n      ожидалось: ${JSON.stringify(want)}`);

function throws(fn: () => unknown, contains: string, m: string): void {
  try { fn(); bad(`${m} — ошибки не было`); }
  catch (e) {
    const text = (e as Error).message;
    text.includes(contains) ? ok(m) : bad(`${m}\n      текст ошибки: ${text}`);
  }
}

console.log('\nСлияние слоёв');

eq(
  mergeLayers({ theme: { colors: { text: '#000', accent: '#000' } } }, { theme: { colors: { accent: '#f00' } } }),
  { theme: { colors: { text: '#000', accent: '#f00' } } },
  'клиент переопределяет по ключу, а не заменяет ветку целиком',
);

eq(
  mergeLayers(
    [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] as Json,
    [{ id: 'b', label: 'Б' }] as Json,
  ),
  [{ id: 'a', label: 'A' }, { id: 'b', label: 'Б' }],
  'элемент списка правится по id, порядок ниши сохраняется',
);

eq(
  mergeLayers([{ id: 'a' }, { id: 'b' }] as Json, [{ id: 'b', enabled: false }] as Json),
  [{ id: 'a' }],
  'enabled: false выключает унаследованный элемент',
);

eq(
  mergeLayers([{ id: 'a' }] as Json, [{ id: 'z', label: 'новый' }] as Json),
  [{ id: 'a' }, { id: 'z', label: 'новый' }],
  'незнакомый id добавляется в конец',
);

eq(
  mergeLayers({ blocks: ['header', 'meta', 'footer'] } as Json, { blocks: ['meta'] } as Json),
  { blocks: ['meta'] },
  'список строк клиент заменяет целиком',
);

eq(
  mergeLayers({ a: 1, b: 2 } as Json, { b: 3 } as Json),
  { a: 1, b: 3 },
  'отсутствие ключа у клиента не стирает умолчание ниши',
);

throws(
  () => mergeLayers([{ id: 'a' }] as Json, [{ id: 'a' }, { id: 'a' }] as Json),
  'повторяющийся id',
  'повторяющийся id в одном слое — ошибка',
);

throws(
  () => mergeLayers([{ id: 'a' }] as Json, [{ label: 'без id' }] as Json),
  'без «id»',
  'элемент без id там, где остальные с id, — ошибка',
);

console.log('\nФорма конфига');

throws(
  () => assertShape({ theme: { colours: {} } }, { theme: { colors: true } }, 'тест'),
  'colors',
  'опечатка в ключе называет ключ и подсказывает верный',
);

throws(
  () => assertShape({ page: 'A4' }, { page: { size: true } }, 'тест'),
  'объект',
  'скаляр там, где ожидается объект, — ошибка',
);

console.log('\nБланк: проверки при сборке');

const clients = resolve(process.env.CLIENTS_DIR ?? 'clients');
const pilot = (): Json | undefined => clientOfferLayer(resolve(clients, 'sofabelle'));

throws(
  () => buildOfferTemplate({
    verticalId: 'furniture',
    clientLayer: { blocks: ['header', 'invoice_lines'] } as Json,
    locales: ['ro'],
  }),
  'движку неизвестен',
  'блок, которого нет в движке, — ошибка, а не пустое место',
);

throws(
  () => buildOfferTemplate({
    verticalId: 'furniture',
    clientLayer: { blocks: ['header', 'header'] } as Json,
    locales: ['ro'],
  }),
  'указан дважды',
  'блок, указанный дважды, — ошибка',
);

throws(
  () => buildOfferTemplate({ verticalId: 'furniture', clientLayer: pilot(), locales: ['ro', 'hu'] }),
  'локали «hu»',
  'локаль без текстов — ошибка на сборке, а не «undefined» в шапке PDF',
);

throws(
  () => buildOfferTemplate({
    verticalId: null,
    clientLayer: { blocks: ['header'], text: { ro: { header: { lines: ['—'] } } } } as Json,
    locales: ['ro'],
  }),
  'не хватает: company',
  'включённый блок без обязательного текста — ошибка, с именем недостающего ключа',
);

throws(
  () => buildOfferTemplate({
    verticalId: 'furniture',
    clientLayer: mergeLayers(pilot(), { logo: 'assets/logo.svg' } as Json)!,
    locales: ['ro'],
  }),
  'PNG или JPG',
  'SVG-логотип отвергается: в PDF он стал бы пустым местом',
);

console.log('\nШрифты');

const geist = glyphsOf(defaultFonts()[0]!.src);
const covered = [...'ăâîșțАб−€'].every((c) => geist.has(c.codePointAt(0)!));
covered ? ok('шрифт движка покрывает румынский, кириллицу, минус и евро')
        : bad('шрифт движка не покрывает нужные символы');

throws(
  () => buildOfferTemplate({
    verticalId: 'furniture',
    clientLayer: mergeLayers(pilot(), { theme: { fontFamily: 'Helvetica', fonts: [] } } as Json)!,
    locales: ['ro'],
  }),
  'не содержит символов',
  'шрифт без румынской диакритики — ошибка на сборке, а не выеденные слова в PDF',
);

console.log('\nРендер');

const template = buildOfferTemplate({ verticalId: 'furniture', clientLayer: pilot(), locales: ['ro'] });
const pdf = await renderOffer(template, sampleOffer('ro'));

pdf.subarray(0, 5).toString() === '%PDF-' ? ok('получается настоящий PDF') : bad('это не PDF');

const { extractText, getDocumentProxy } = await import('unpdf');
const proxy = await getDocumentProxy(new Uint8Array(pdf));
const { text } = await extractText(proxy, { mergePages: true });
const flat = (Array.isArray(text) ? text.join(' ') : text).replace(/\s+/g, ' ');

for (const phrase of ['Ofertă de preț', 'Configurație', 'Țesătură antipată', 'SofaBelle SRL']) {
  flat.includes(phrase) ? ok(`в PDF есть «${phrase}» — диакритика дошла целой`)
                        : bad(`в PDF нет «${phrase}». Извлечено: ${flat.slice(0, 200)}`);
}

// Цена в бланке — ровно та, что передана: форматирование не должно её менять.
flat.includes('16.605,00') ? ok('итог напечатан без потери копеек')
                           : bad(`итога 16.605,00 нет в PDF. Извлечено: ${flat.slice(0, 300)}`);

const onlyMeta = buildOfferTemplate({
  verticalId: 'furniture',
  clientLayer: mergeLayers(pilot(), { blocks: ['meta'] } as Json)!,
  locales: ['ro'],
});
const short = await renderOffer(onlyMeta, sampleOffer('ro'));
short.length < pdf.length ? ok('порядок блоков из конфига правда управляет бланком')
                          : bad('бланк с одним блоком не меньше полного');

console.log(failed === 0 ? '\nВсё сошлось.\n' : `\nНе сошлось: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
