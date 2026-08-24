/**
 * Тарифы: согласованность и то, что обещанное вообще работает.
 *
 *   npm run test:plans
 *
 * Проверяется не «код компилируется», а три вещи, каждая из которых уже
 * ломалась молча:
 *
 *   1. Лестница тарифов не перепутана. Тариф дороже — значит не меньше
 *      сообщений, документов и фрагментов, чем у предыдущего.
 *   2. Модель каждого тарифа существует в аккаунте. Идентификатор старшей
 *      модели был неверным, и пока модель выбиралась отдельной ручкой,
 *      этого никто не видел: клиент на Business получал бы 502 на каждое
 *      сообщение.
 *   3. Маржа каждого тарифа положительна на его же потолке сообщений.
 *      Тариф, который в пределах своих лимитов работает в убыток, — это
 *      не тариф, а обещание платить за клиента.
 */
import '../src/engine/env.js';
import { claude, modelFor } from '../src/engine/llm/claude.js';
import {
  PLAN_IDS, PLANS, hasFeature, messageCapFor, planFor, type Feature,
} from '../src/engine/plans.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };

// ── 1. Лестница ───────────────────────────────────────────────────────────
{
  /**
   * Тариф с ценой по запросу в сравнение по цене не входит.
   *
   * Ноль в `priceEur` означает «договариваемся», а не «бесплатно», и порядок
   * по нему поставил бы Enterprise ниже Start. Сравнивать по цене можно
   * только то, у чего цена есть.
   */
  const ladder = PLAN_IDS.map((id) => PLANS[id])
    .filter((p) => p.priceEur > 0)
    .sort((a, b) => a.priceEur - b.priceEur);
  let broken = false;
  for (let i = 1; i < ladder.length; i++) {
    const prev = ladder[i - 1]!;
    const cur = ladder[i]!;
    for (const [what, a, b] of [
      ['сообщений', prev.monthlyMessages, cur.monthlyMessages],
      ['документов', prev.maxDocuments, cur.maxDocuments],
      ['фрагментов', prev.maxChunks, cur.maxChunks],
      ['мегабайт', prev.maxTotalBytes, cur.maxTotalBytes],
    ] as const) {
      if (b < a) {
        bad(`«${cur.name}» дороже «${prev.name}», но ${what} меньше: ${b} против ${a}`);
        broken = true;
      }
    }
  }
  if (!broken) ok(`лестница не перепутана: ${ladder.map((p) => p.name).join(' → ')}`);
}

// ── 2. Модели существуют ──────────────────────────────────────────────────
{
  const tiers = [...new Set(PLAN_IDS.map((id) => PLANS[id].modelTier))];
  for (const tier of tiers) {
    const id = modelFor(tier);
    const plans = PLAN_IDS.filter((p) => PLANS[p].modelTier === tier).map((p) => PLANS[p].name);
    try {
      await claude.messages.create({
        model: id, max_tokens: 8, messages: [{ role: 'user', content: 'Say OK' }],
      });
      ok(`${plans.join(', ')}: модель ${id} отвечает`);
    } catch (err) {
      bad(`${plans.join(', ')}: модель ${id} НЕ отвечает — ${String((err as Error).message).slice(0, 110)}`);
    }
  }
}

// ── 3. Маржа ──────────────────────────────────────────────────────────────
{
  // Замерено: 5500 токенов входа и 200 выхода на сообщение.
  const IN_TOK = 5500, OUT_TOK = 200;
  const PRICE = { base: { in: 1, out: 5 }, premium: { in: 3, out: 15 } };
  const EUR_USD = 1.09;

  for (const id of PLAN_IDS) {
    const plan = PLANS[id];
    // Маржа считается там, где есть выручка. У тарифа по запросу её считает
    // человек на переговорах, а не тест.
    if (plan.priceEur === 0) {
      ok(`${plan.name}: цена по запросу — маржа обсуждается, а не проверяется`);
      continue;
    }
    const p = PRICE[plan.modelTier];
    // Без кеша: нижняя граница маржи. Считать по кешу значило бы закладывать
    // в цену предположение, которого мы ещё не замеряли.
    const cost = plan.monthlyMessages * (IN_TOK * p.in + OUT_TOK * p.out) / 1e6;
    const revenue = plan.priceEur * EUR_USD;
    const margin = ((revenue - cost) / revenue) * 100;
    const line = `${plan.name}: €${plan.priceEur} против $${cost.toFixed(0)} модели — маржа ${margin.toFixed(0)}%`;
    if (margin < 40) bad(`${line} (ниже 40% — тариф не окупает даже модель с запасом)`);
    else ok(line);
  }
}

// ── 3б. Лестница фич не идёт вспять ──────────────────────────────────────
//
// Тариф дороже — значит НЕ МЕНЬШЕ включает. Ошибка здесь тихая: клиент
// покупает Pro и обнаруживает, что потерял то, что было на Start.
{
  const FEATURES: Feature[] = [
    'chatbot', 'configurator', 'drive', 'connectors',
    'followup', 'productionUpdates', 'social',
  ];
  const paid = PLAN_IDS.map((id) => PLANS[id])
    .filter((p) => p.priceEur > 0)
    .sort((a, b) => a.priceEur - b.priceEur);

  let broken = false;
  for (let i = 1; i < paid.length; i++) {
    for (const f of FEATURES) {
      if (paid[i - 1]!.features[f] && !paid[i]!.features[f]) {
        bad(`«${paid[i]!.name}» дороже «${paid[i - 1]!.name}», но теряет «${f}»`);
        broken = true;
      }
    }
  }
  if (!broken) ok('фичи только добавляются вверх по лестнице');

  hasFeature('starter', 'configurator')
    ? bad('Start получил конфигуратор — за него платят на Pro')
    : ok('Start без конфигуратора');
  hasFeature('pro', 'configurator') ? ok('Pro с конфигуратором')
                                    : bad('Pro без конфигуратора — тариф не за что продавать');
  hasFeature('starter', 'drive')
    ? bad('Start получил Drive — регресс замка, который уже работал')
    : ok('Start без Drive: замок не откатился');
  hasFeature('pro', 'followup')
    ? bad('Pro обещает follow-up, которого нет в коде')
    : ok('нереализованное не обещано покупаемым тарифом');

  // Незнакомый тариф не должен молча открывать платное.
  hasFeature('нет-такого', 'configurator')
    ? bad('неизвестный тариф открыл конфигуратор')
    : ok('неизвестный тариф не открывает платных фич');
}

// ── 3в. Замок конфигуратора ──────────────────────────────────────────────
//
// Тариф и подписка складываются. Проверять их порознь — значит однажды
// открыть конфигуратор тому, кто перестал платить, или закрыть тому,
// кто платит.
{
  const { configuratorAllowed, offerQuotaLeft } = await import(
    '../src/products/configurator/access.js');
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const base = { trialEndsAt: null, currentPeriodEnd: null } as const;

  const cases: Array<[string, boolean, Parameters<typeof configuratorAllowed>[0]]> = [
    ['Pro с оплаченной подпиской', true,
     { ...base, plan: 'pro', subscriptionStatus: 'active' }],
    ['Pro на живом триале', true,
     { ...base, plan: 'pro', subscriptionStatus: 'trial', trialEndsAt: new Date(now + 5 * DAY) }],
    ['Pro с кончившимся триалом', false,
     { ...base, plan: 'pro', subscriptionStatus: 'trial', trialEndsAt: new Date(now - DAY) }],
    ['Pro с отменённой подпиской', false,
     { ...base, plan: 'pro', subscriptionStatus: 'canceled' }],
    ['Start с оплаченной подпиской', false,
     { ...base, plan: 'starter', subscriptionStatus: 'active' }],
    ['Business с оплаченной подпиской', true,
     { ...base, plan: 'business', subscriptionStatus: 'active' }],
    ['неизвестный тариф', false,
     { ...base, plan: 'нет-такого', subscriptionStatus: 'active' }],
  ];
  for (const [name, want, state] of cases) {
    const got = configuratorAllowed(state, now);
    got === want
      ? ok(`${name}: ${want ? 'доступ есть' : 'доступа нет'}`)
      : bad(`${name}: получено ${got}, ожидалось ${want}`);
  }

  // Grace-период: тариф не потерян, автоматизация потеряна.
  const grace = configuratorAllowed({
    plan: 'pro', subscriptionStatus: 'past_due',
    trialEndsAt: null, currentPeriodEnd: new Date(now - 30 * DAY),
  }, now);
  grace ? bad('через месяц после неоплаты конфигуратор всё ещё открыт')
        : ok('grace кончился — автоматизация выключена, хотя тариф прежний');

  offerQuotaLeft('starter', null, 0)
    ? bad('Start получил право на оферту — конфигуратора у него нет')
    : ok('пакет оферт у Start нулевой');
  offerQuotaLeft('pro', null, PLANS.pro.monthlyOffers - 1)
    ? ok('последняя оферта пакета выпускается')
    : bad('последняя оферта пакета отклонена');
  offerQuotaLeft('pro', null, PLANS.pro.monthlyOffers)
    ? bad('оферта сверх пакета выпущена')
    : ok('оферта сверх пакета отклонена');
  /**
   * Плата за заведение — только у того, кого мы правда заводим руками.
   * И только одним числом: вилка в прайсе торгуется до нижней границы
   * ещё до разговора о том, что клиенту нужно.
   */
  PLANS.starter.setupFeeEur === 0
    ? ok('Start заводится сам — платы за заведение нет')
    : bad('Start просит денег за то, что клиент делает сам');
  PLANS.pro.setupFeeEur > 0
    ? ok(`Pro: разовая плата за заведение €${PLANS.pro.setupFeeEur}`)
    : bad('Pro без платы за заведение — полтора дня работы даром');
  // Она обязана окупать хотя бы день, иначе не покупает и обязательства.
  PLANS.pro.setupFeeEur >= 400
    ? ok('плата за заведение покрывает не меньше дня работы')
    : bad(`€${PLANS.pro.setupFeeEur} не покрывают полутора дней онбординга`);
  // И не должна пугать сильнее, чем сам тариф за квартал.
  PLANS.pro.setupFeeEur <= PLANS.pro.priceEur * 3
    ? ok('плата за заведение не выше трёх месяцев подписки')
    : bad('плата за заведение отпугивает сильнее, чем сам тариф');

  offerQuotaLeft('starter', 50, 10)
    ? ok('индивидуальный потолок перекрывает тарифный')
    : bad('индивидуальный потолок не сработал');
}

// ── 4. Потолок есть всегда ────────────────────────────────────────────────
{
  const capNull = messageCapFor('pro', null);
  const capOverride = messageCapFor('pro', 42);
  if (capNull === PLANS.pro.monthlyMessages) ok('пустой потолок в базе означает потолок тарифа');
  else bad(`пустой потолок дал ${capNull}, а тариф обещает ${PLANS.pro.monthlyMessages}`);
  if (capOverride === 42) ok('явное значение перекрывает тариф');
  else bad('явное значение потолка не сработало');
}

// ── 5. Неизвестный тариф падает вниз, а не вверх ──────────────────────────
{
  const unknown = planFor('enterprise-gold');
  if (unknown.modelTier === 'base' && unknown.priceEur === PLANS.starter.priceEur) {
    ok('неизвестный тариф откатывается на самый дешёвый, а не на самый дорогой');
  } else {
    bad(`неизвестный тариф дал «${unknown.name}» — ошибка в данных выдала бы старшую модель за наш счёт`);
  }
}

console.log(failed === 0 ? '\nТАРИФЫ OK' : `\nТАРИФЫ НАРУШЕНЫ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
