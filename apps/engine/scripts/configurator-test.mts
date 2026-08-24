/**
 * Конфигуратор: флоу, проверка выбора, движок цены.
 *
 *   npm run test:configurator
 *
 * Базы данных не требует. Главное здесь не «считается ли цена», а два
 * свойства, которые молча ломаются и обнаруживаются на сотой оферте:
 * результат не зависит от порядка множителей, и скидка считается от всего
 * listPrice, включая надбавки.
 */
import { resolve } from 'node:path';
import type { Json } from '../src/products/configurator/config/layers.js';
import { buildConfigurator } from '../src/products/configurator/load.js';
import { resolveSelections } from '../src/products/configurator/flow/select.js';
import { priceOf } from '../src/products/configurator/pricing/engine.js';
import { publicFlow } from '../src/products/configurator/flow/public.js';

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

/** Минимальный рабочий конфиг: одна карточка с базой. Остальное дописывается. */
const card = (id: string, effect?: Json): Json => ({
  id, label: { ro: id }, ...(effect ? { priceEffect: effect } : {}),
});
const build = (flow: Json, pricing?: Json) => buildConfigurator({
  verticalId: null, clientLayer: { flow, pricing } as Json, locales: ['ro'],
});
const base = (bani: number): Json => ({ kind: 'base', bani });

const simple = (extra: Json[] = [], pricing?: Json) => build(
  {
    steps: [
      { id: 'model', type: 'cards', title: { ro: 'M' }, options: [card('a', base(100000))] },
      ...extra,
    ],
  } as Json,
  pricing,
);

console.log('\nФлоу: проверки при сборке');

throws(() => build({ steps: [{ id: 'a', type: 'slider', title: { ro: 'A' } }] } as Json),
  'движку неизвестен', 'тип шага, которого нет в движке, — ошибка');

throws(() => build({ steps: [
  { id: 'a', type: 'text', title: { ro: 'A' } }, { id: 'a', type: 'text', title: { ro: 'A' } },
] } as Json), 'указан дважды', 'повторяющийся id шага — ошибка');

throws(() => build({ steps: [{ id: 'a', type: 'cards', title: { ro: 'A' }, options: [] }] } as Json),
  'без вариантов выбора', 'карточки без вариантов — ошибка');

throws(() => build({ steps: [
  { id: 'a', type: 'text', title: { ro: 'A' }, options: [card('x')] },
] } as Json), 'вариантов выбора не бывает', 'варианты у свободного текста — ошибка');

throws(() => build({ steps: [{ id: 'a', type: 'number-input', title: { ro: 'A' } }] } as Json),
  'обязателен «input»', 'числовой шаг без диапазона — ошибка');

throws(() => build({ steps: [
  { id: 'a', type: 'cards', title: { en: 'A' }, options: [card('x', base(1))] },
] } as Json), 'title.ro не задан', 'заголовок без локали тенанта — ошибка на сборке');

throws(() => build({ steps: [
  { id: 'a', type: 'cards', title: { ro: 'A' }, options: [card('x', base(1)), card('x')] },
] } as Json), 'указан дважды', 'повторяющийся id варианта — ошибка');

throws(() => simple([{
  id: 'b', type: 'cards', title: { ro: 'B' },
  options: [card('x', { kind: 'addon', bani: 12.5 } as Json)],
} as Json]), 'целое неотрицательное число в банях', 'дробные бани — ошибка, а не тихая копейка');

throws(() => simple([{
  id: 'b', type: 'cards', title: { ro: 'B' },
  options: [card('x', { kind: 'multiplier', factor: 1.00005 } as Json)],
} as Json]), 'четырёх знаков', 'множитель точнее четырёх знаков — ошибка');

throws(() => build({ steps: [
  { id: 'a', type: 'cards', title: { ro: 'A' }, options: [card('x', { kind: 'multiplier', factor: 1.1 } as Json)] },
] } as Json), 'ни один вариант флоу не задаёт базовую цену',
  'флоу без базовой цены — ошибка: иначе оферта на 0,00');

console.log('\nВыбор посетителя');

const shop = simple([
  { id: 'w', type: 'number-input', title: { ro: 'W' }, input: { min: 100, max: 300, step: 10 } },
  { id: 'extras', type: 'cards', title: { ro: 'E' }, multiple: true, optional: true,
    options: [card('p', { kind: 'addon', bani: 5000 } as Json), card('q', { kind: 'addon', bani: 1000 } as Json)] },
  { id: 'note', type: 'text', title: { ro: 'N' }, optional: true },
] as Json[]);

throws(() => resolveSelections(shop.flow, { model: 'a', w: 100, ghost: 'x' }),
  'шага «ghost» во флоу нет', 'лишний шаг в выборе — ошибка, а не игнор');
throws(() => resolveSelections(shop.flow, { w: 100 }),
  'шаг «model» обязателен', 'пропущенный обязательный шаг — ошибка');
throws(() => resolveSelections(shop.flow, { model: 'zzz', w: 100 }),
  'нет варианта «zzz»', 'чужой id варианта — ошибка, а не оферта на несуществующий товар');
throws(() => resolveSelections(shop.flow, { model: ['a', 'a'], w: 100 }),
  'принимает один вариант', 'два варианта в шаге на один — ошибка');
throws(() => resolveSelections(shop.flow, { model: 'a', w: 999 }),
  'от 100 до 300', 'число вне диапазона — ошибка');
throws(() => resolveSelections(shop.flow, { model: 'a', w: 105 }),
  'кратно 10', 'число не по сетке шага — ошибка');
throws(() => resolveSelections(shop.flow, { model: 'a', w: 100, note: 'x'.repeat(2001) }),
  'не длиннее 2000', 'свободный текст без потолка — ошибка');

eq(resolveSelections(shop.flow, { model: 'a', w: 100 }).picks.length, 1,
  'необязательные шаги можно не отвечать');

console.log('\nЦена');

const priced = simple([
  { id: 'mult', type: 'cards', title: { ro: 'M2' }, multiple: true,
    options: [card('m1', { kind: 'multiplier', factor: 1.15 } as Json),
              card('m2', { kind: 'multiplier', factor: 1.08 } as Json)] },
  { id: 'add', type: 'cards', title: { ro: 'A' }, optional: true,
    options: [card('a1', { kind: 'addon', bani: 30000 } as Json)] },
] as Json[]);
const pick = (mult: string[], add?: string) => priceOf(priced.flow, priced.pricing, {
  model: 'a', mult: mult.length === 1 ? mult[0]! : mult, ...(add ? { add } : {}),
});

// 100000 × 1.15 = 115000
eq(pick(['m1']).listPriceBani, 115000, 'база × множитель — точно');
// (100000 × 1.15 × 1.08) + 30000 = 124200 + 30000
eq(priceOf(priced.flow, priced.pricing,
  { model: 'a', mult: ['m1', 'm2'], add: 'a1' }).listPriceBani, 154200,
  'база × Π(множители) + Σ(надбавки)');

// Порядок множителей не должен влиять: ради этого расчёт идёт точной дробью.
const ab = priceOf(priced.flow, priced.pricing, { model: 'a', mult: ['m1', 'm2'] }).listPriceBani;
const ba = priceOf(priced.flow, priced.pricing, { model: 'a', mult: ['m2', 'm1'] }).listPriceBani;
eq(ab, ba, 'порядок множителей не меняет цену');

// Решение спеки, а не побочный эффект порядка операций.
const withAddon = priceOf(priced.flow, priced.pricing,
  { model: 'a', mult: 'm1', add: 'a1' }, { percent: 10 });
eq(withAddon.discountBani, 14500, 'скидка считается от всего listPrice, включая надбавки');

eq(priceOf(priced.flow, priced.pricing, { model: 'a', mult: 'm1' },
  { bani: 999999 }).finalPriceBani, 0, 'скидка больше цены не даёт отрицательной оферты');

console.log('\nОкругление и НДС');

const rounded = (to: number, mode: string) => priceOf(
  simple([], { rounding: { to, mode } } as Json).flow,
  simple([], { rounding: { to, mode } } as Json).pricing,
  { model: 'a' }, { bani: 180 },
);
eq(rounded(100, 'nearest').finalPriceBani, 99800, 'округление до лея — к ближайшему');
eq(rounded(100, 'up').finalPriceBani, 99900, 'округление вверх');
eq(rounded(100, 'down').finalPriceBani, 99800, 'округление вниз');
eq(rounded(100, 'down').roundingBani, -20, 'сдвиг от округления виден отдельным числом');

const vat = (mode: string) => priceOf(
  simple([], { vat: { rate: 2100, mode } } as Json).flow,
  simple([], { vat: { rate: 2100, mode } } as Json).pricing,
  { model: 'a' },
);
eq([vat('add').vatBani, vat('add').totalBani], [21000, 121000], 'НДС сверху');
eq([vat('included').vatBani, vat('included').totalBani], [17355, 100000], 'НДС уже в цене');

console.log('\nДрайверы количества');

const window = build({
  steps: [
    { id: 'model', type: 'cards', title: { ro: 'M' },
      options: [card('a', { kind: 'base', bani: 20000 } as Json)] },
    { id: 'pieces', type: 'number-input', title: { ro: 'N' }, input: { min: 1, max: 50 } },
    { id: 'w', type: 'number-input', title: { ro: 'W' }, input: { min: 10, max: 500 } },
    { id: 'h', type: 'number-input', title: { ro: 'H' }, input: { min: 10, max: 500 } },
  ],
} as Json, {
  units: {
    quantity: { step: 'pieces' },
    dimension: { kind: 'area', unit: 'cm', width: { step: 'w' }, height: { step: 'h' } },
  },
} as Json);

// 200 лей/м² × (120×150 см = 1.8 м²) × 3 шт = 1080 лей
eq(priceOf(window.flow, window.pricing,
  { model: 'a', pieces: 3, w: 120, h: 150 }).listPriceBani, 108000,
  'площадь и количество: цена за м² × м² × штуки');

const strip = build({
  steps: [
    { id: 'model', type: 'cards', title: { ro: 'M' },
      options: [card('a', { kind: 'base', bani: 5000 } as Json)] },
    { id: 'w', type: 'number-input', title: { ro: 'W' }, input: { min: 10, max: 5000 } },
  ],
} as Json, {
  units: { dimension: { kind: 'length', unit: 'mm', width: { step: 'w' } } },
} as Json);
eq(priceOf(strip.flow, strip.pricing, { model: 'a', w: 2350 }).listPriceBani, 11750,
  'погонный метр: цена за метр × миллиметры');

throws(() => build({
  steps: [{ id: 'model', type: 'cards', title: { ro: 'M' }, options: [card('a', base(1))] }],
} as Json, { units: { quantity: { step: 'nope' } } } as Json),
  'такого шага «number-input» во флоу нет',
  'ссылка формулы на несуществующий шаг — ошибка, а не количество по умолчанию');

console.log('\nСлои: ниша + пилот');

const pilot = buildConfigurator({
  verticalId: 'furniture', clientDir: resolve(process.env.CLIENTS_DIR ?? 'clients', 'sofabelle'),
  locales: ['ro'],
});
eq(pilot.flow.steps.map((s) => s.id), ['model', 'seat', 'fabric', 'colour', 'extras', 'notes'],
  'enabled: false выключает шаг ниши, порядок остальных сохраняется');
eq(pilot.flow.steps.find((s) => s.id === 'seat')?.options?.map((o) => o.label.ro),
  ['Spumă poliuretanică HR', 'Spumă HR + memory foam', 'Puf natural'],
  'названия вариантов пришли из ниши, а цены — от клиента');

const real = priceOf(pilot.flow, pilot.pricing, {
  model: 'free-comfort', seat: 'hr-memory', fabric: 'veluxe', colour: 'veluxe-31-taupe',
  extras: ['puf', 'topper'],
}, { percent: 5 });
eq(real.listPriceBani, 2164080, 'реальный конфиг пилота считается по формуле');
real.listPriceBani - real.discountBani + real.roundingBani === real.finalPriceBani
  ? ok('listPrice − скидка + округление = итог, в целых банях')
  : bad('разбивка цены не сходится с итогом');
real.finalPriceBani + real.vatBani === real.totalBani
  ? ok('итог + НДС = к оплате')
  : bad('НДС не сходится с итогом');

// Ниша задаёт форму шагов, но не модели и не цены: без слоя клиента
// конфигуратор нерабочий, и падает он на первом же пустом шаге.
throws(() => buildConfigurator({ verticalId: 'furniture', clientLayer: undefined, locales: ['ro'] }),
  'без вариантов выбора',
  'ниша без слоя клиента не собирается: форму дала она, содержимое — нет');

console.log('\nЧто видит браузер');

const seen = publicFlow(pilot.flow, 'ro', (file) => `/asset/${file.length}`);
const wire = JSON.stringify(seen);

// Прайс клиента наружу не уходит ни в каком виде. Проверка грубая нарочно:
// белый список в `public.ts` защищает от нового поля, а этот тест — от того,
// что белый список однажды перепишут в чёрный.
for (const leak of ['priceEffect', 'bani', 'factor', 'multiplier', 'aiHint']) {
  wire.includes(leak)
    ? bad(`в публичный флоу утекло «${leak}»`)
    : ok(`«${leak}» в браузер не уходит`);
}
// Ниша пишет подсказки агенту — если бы они не удалялись, проверка выше
// прошла бы на конфиге, где их просто нет.
pilot.flow.steps.some((s) => s.aiHint)
  ? ok('подсказки агенту в конфиге есть — значит проверка выше не пустая')
  : bad('в конфиге пилота нет ни одной aiHint: проверка на утечку ничего не проверяет');

eq(seen.steps.find((s) => s.id === 'seat')?.options?.map((o) => o.label),
  ['Spumă poliuretanică HR', 'Spumă HR + memory foam', 'Puf natural'],
  'подписи развёрнуты в локаль тенанта');
eq(seen.steps.find((s) => s.id === 'extras')?.multiple, true,
  'множественный выбор доезжает до браузера');
eq(seen.steps.find((s) => s.id === 'notes')?.optional, true,
  'необязательность шага доезжает до браузера');

const withImage = publicFlow(
  { steps: [{ id: 'a', type: 'cards', title: { ro: 'A' },
    options: [{ id: 'x', label: { ro: 'X' }, image: '/var/uploads/t/opt.jpg' }] }] },
  'ro', () => '/asset/0',
);
eq(withImage.steps[0]?.options?.[0]?.image, '/asset/0',
  'путь файла на диске наружу не уходит — только адрес');

console.log(failed === 0 ? '\nВсё сошлось.\n' : `\nНе сошлось: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
