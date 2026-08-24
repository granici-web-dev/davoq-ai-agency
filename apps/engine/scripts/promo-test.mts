/**
 * Акции: отпечаток, состояния, применение и fail-safe.
 *
 *   npm run db:up && npm run test:promo
 *
 * Проверяется не «парсер работает», а два свойства, ради которых всё это
 * и построено: без решения человека скидка в оферту не попадает, и повторный
 * проход не воскрешает отклонённое.
 */
import '../src/engine/env.js';
import { join, resolve } from 'node:path';
import { closeOwnerPool, pool, withOwner, withTenant } from '../src/engine/db/pool.js';
import { buildConfigurator } from '../src/products/configurator/load.js';
import { clientOfferLayer } from '../src/products/configurator/offer/load.js';
import { fingerprint, assertTerms, isStale, type PromoTerms } from '../src/products/configurator/promo/schema.js';
import {
  applicablePromotions, bestPromotion, decidePromotion, expireMissing,
  listPromotions, syncConfigPromotions, upsertPromotion,
} from '../src/products/configurator/promo/store.js';
import { priceWithPromotion } from '../src/products/configurator/promo/apply.js';
import { scrapePromotions } from '../src/products/configurator/promo/scrape.js';

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

const terms = (over: Partial<PromoTerms> = {}): PromoTerms => ({
  label: { ro: 'Reducere de vară' }, scope: 'sitewide', modelIds: [],
  discount: { percent: 1000 }, validUntil: null, ...over,
});

let tenantId = '';
try {
  console.log('\nОтпечаток условий');

  eq(fingerprint(terms()), fingerprint(terms()), 'одинаковые условия — один отпечаток');
  eq(fingerprint(terms()) === fingerprint(terms({ label: { ro: 'Reducere de august' } })), true,
    'переименование не меняет отпечаток — подтверждали условия, а не название');
  eq(fingerprint(terms()) === fingerprint(terms({ discount: { percent: 1500 } })), false,
    'изменённый процент — другая акция');
  eq(fingerprint(terms()) === fingerprint(terms({ validUntil: '2026-09-30' })), false,
    'изменённый срок — другая акция');
  eq(fingerprint(terms({ modelIds: ['a', 'b'], scope: 'models' })),
     fingerprint(terms({ modelIds: ['b', 'a'], scope: 'models' })),
    'порядок моделей на отпечаток не влияет');

  console.log('\nПроверка условий');

  throws(() => assertTerms(terms({ discount: { percent: 5000 } }), 'тест', 25),
    'выше потолка', 'скидка выше потолка — черновик не создаётся');
  throws(() => assertTerms(terms({ scope: 'models', modelIds: [] }), 'тест', 25),
    'без единой модели', 'выборочная акция без моделей — ошибка, а не скидка на всё');
  throws(() => assertTerms(terms({ discount: { percent: 18.5 } as never }), 'тест', 25),
    'сотых долях процента', 'дробный процент — ошибка: деньги считаются целыми');
  throws(() => assertTerms(terms({ validUntil: '31.08.2026' }), 'тест', 25),
    'вида 2026-08-31', 'срок в чужом формате — ошибка');

  console.log('\nСостояния');

  tenantId = await withOwner(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, allowed_domains, locale_default, supported_locales,
                            public_key, status, vertical)
       VALUES ('__promo_probe__', ARRAY['probe.invalid'], 'ro', ARRAY['ro'],
               'pk_promo_' || substr(md5(random()::text), 1, 22), 'active', 'furniture')
       RETURNING id`);
    return rows[0]!.id;
  });

  eq(await upsertPromotion(tenantId, terms(), 'scrape', 'https://probe.invalid/'), 'created',
    'вычитанная с сайта акция заводится');
  eq((await listPromotions(tenantId))[0]?.state, 'pending',
    'скрейп кладёт ЧЕРНОВИК — решения человека ещё не было');

  eq(await upsertPromotion(tenantId, terms({ label: { ro: 'Другое имя' } }), 'scrape'), 'unchanged',
    'повторный проход не заводит вторую акцию с теми же условиями');

  const draft = (await listPromotions(tenantId))[0]!;
  await decidePromotion(tenantId, draft.id, 'rejected', null);
  await upsertPromotion(tenantId, terms(), 'scrape');
  eq((await listPromotions(tenantId)).find((p) => p.id === draft.id)?.state, 'rejected',
    'отклонённая не воскресает следующим проходом');

  eq(await upsertPromotion(tenantId, terms({ discount: { percent: 1500 } }), 'config'), 'created',
    'акция из конфига заводится');
  eq((await listPromotions(tenantId)).find((p) => p.source === 'config')?.state, 'active',
    'из конфига — сразу подтверждённая: это уже решение человека');

  // Условия на сайте поменяли: старая гасится, новая приходит черновиком.
  await upsertPromotion(tenantId, terms({ discount: { percent: 2000 } }), 'scrape');
  const expiredCount = await expireMissing(tenantId, [fingerprint(terms({ discount: { percent: 2000 } }))]);
  const afterChange = await listPromotions(tenantId);
  eq(afterChange.find((p) => p.source === 'config')?.state, 'active',
    'гашение пропавших не трогает акции из конфига');
  eq(afterChange.find((p) => 'percent' in p.discount && p.discount.percent === 2000)?.state, 'pending',
    'изменённые условия приходят новым черновиком');
  // `expiredCount >= 0` было бы истинно всегда: проверка, которая горит
  // зелёным и ничего не доказывает. Гасим настоящую акцию.
  eq(expiredCount, 0, 'акция, которая всё ещё на странице, не гасится');

  await upsertPromotion(tenantId, terms({ discount: { percent: 300 } }), 'scrape');
  const gone = await expireMissing(tenantId, [fingerprint(terms({ discount: { percent: 2000 } }))]);
  eq(gone, 1, 'акция, пропавшая со страницы, уходит в expired');
  eq((await listPromotions(tenantId))
      .find((p) => 'percent' in p.discount && p.discount.percent === 300)?.state, 'expired',
    'погашенная акция помечена именно expired, а не удалена');

  console.log('\nПрименение');

  const activeConfig = afterChange.find((p) => p.source === 'config')!;
  eq((await applicablePromotions(tenantId, undefined)).map((p) => p.id), [activeConfig.id],
    'в расчёт идёт только подтверждённая: черновик и отклонённая — нет');

  // Срок проверяется в момент расчёта, а не подтверждения.
  await withOwner((client) => client.query(
    `UPDATE promotions SET valid_until = current_date - 1 WHERE id = $1`, [activeConfig.id]));
  eq((await applicablePromotions(tenantId, undefined)).length, 0,
    'истёкшая вчера акция не применяется, хотя подтверждена');
  await withOwner((client) => client.query(
    `UPDATE promotions SET valid_until = NULL WHERE id = $1`, [activeConfig.id]));

  // Выборочная акция не должна доставать чужую модель.
  await withOwner((client) => client.query(
    `UPDATE promotions SET scope = 'models', model_ids = ARRAY['life'] WHERE id = $1`,
    [activeConfig.id]));
  eq((await applicablePromotions(tenantId, 'lofty')).length, 0,
    'акция на диваны не применяется к креслу');
  eq((await applicablePromotions(tenantId, 'life')).length, 1,
    'акция на диваны применяется к дивану');
  await withOwner((client) => client.query(
    `UPDATE promotions SET scope = 'sitewide', model_ids = '{}' WHERE id = $1`, [activeConfig.id]));

  // 10% на 20 000 больше, чем 500 лей; на 600 — меньше.
  const two = [
    { ...terms(), id: 'p', source: 'scrape', state: 'active', fingerprint: 'x', createdAt: '' },
    { ...terms({ discount: { bani: 50000 } }), id: 'f', source: 'scrape', state: 'active', fingerprint: 'y', createdAt: '' },
  ] as never as Parameters<typeof bestPromotion>[0];
  eq(bestPromotion(two, 2000000)?.promo.id, 'p', 'на дорогом изделии больше процент');
  eq(bestPromotion(two, 60000)?.promo.id, 'f', 'на дешёвом больше фиксированная сумма');

  console.log('\nЦена с акцией');

  const clients = resolve(process.env.CLIENTS_DIR ?? 'clients');
  const cfg = buildConfigurator({
    verticalId: 'furniture',
    clientLayer: {
      ...(await import('yaml')).parse(
        (await import('node:fs')).readFileSync(join(clients, 'sofabelle/configurator.yaml'), 'utf8'),
      ),
    } as never,
    locales: ['ro'],
  });
  void clientOfferLayer;

  const selections = {
    model: 'free-comfort', width: 310, seat: 'hr-foam',
    fabric: 'ambiant', colour: 'ambiant-06-whisper',
  };
  const withPromo = await priceWithPromotion(tenantId, cfg, selections);
  withPromo.promo && withPromo.price.discountBani > 0
    ? ok(`подтверждённая акция применена: −${withPromo.price.discountBani} бань`)
    : bad('подтверждённая акция не применилась к расчёту');

  await decidePromotion(tenantId, activeConfig.id, 'rejected', null);
  const withoutPromo = await priceWithPromotion(tenantId, cfg, selections);
  eq(withoutPromo.price.discountBani, 0,
    'снятая акция перестаёт влиять на цену немедленно');

  console.log('\nFail-safe');

  const before = (await listPromotions(tenantId)).map((p) => `${p.id}:${p.state}`).sort();
  const broken = await scrapePromotions({
    tenantId, tenantName: '__promo_probe__', locale: 'ro',
    modelIds: ['free-comfort'],
    // Локальный адрес: safe-fetch обязан отказать, не выходя в сеть.
    config: { maxDiscountPercent: 25, scrape: { url: 'http://127.0.0.1:1/', everyHours: 6, strategy: 'html' } },
  });
  broken.failed ? ok('упавший fetch — проход провален, а не «акций нет»')
                : bad('падение чтения страницы прошло незамеченным');
  eq(broken.created, 0, 'при провале не создаётся ни одного черновика');

  // Просроченный баннер, забытый на странице, до очереди подтверждений
  // доезжать не должен. Модель возвращает такие вопреки промпту — поймано
  // на настоящем сайте клиента, где июльская акция пришла в августе.
  eq(isStale(terms({ validUntil: '2026-07-30' }), '2026-08-24'), true,
    'акция, кончившаяся три недели назад, — просрочена');
  eq(isStale(terms({ validUntil: '2026-08-24' }), '2026-08-24'), false,
    'акция, кончающаяся сегодня, ещё действует');
  eq(isStale(terms({ validUntil: null }), '2026-08-24'), false,
    'бессрочная акция не просрочена');
  eq((await listPromotions(tenantId)).map((p) => `${p.id}:${p.state}`).sort(), before,
    'провалившийся проход НИЧЕГО не гасит — иначе моргнувший сайт снял бы все акции');

  console.log('\nАкции из конфига');

  const synced = await syncConfigPromotions(tenantId, [terms({ discount: { percent: 700 } })]);
  eq(synced.created, 1, 'акция из конфига синхронизируется подтверждённой');
  const afterSync = await listPromotions(tenantId);
  eq(afterSync.filter((p) => p.source === 'config' && p.state === 'active').length, 1,
    'убранная из конфига акция гасится, оставшаяся работает');

  console.log(failed === 0 ? '\nВсё сошлось.\n' : `\nНе сошлось: ${failed}\n`);
} finally {
  if (tenantId) {
    await withOwner((client) => client.query('DELETE FROM tenants WHERE id = $1', [tenantId]));
  }
  await pool.end();
  await closeOwnerPool();
}

process.exit(failed === 0 ? 0 : 1);
