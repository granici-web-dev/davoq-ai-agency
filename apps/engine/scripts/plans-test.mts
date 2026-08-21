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
import { PLAN_IDS, PLANS, messageCapFor, planFor } from '../src/engine/plans.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };

// ── 1. Лестница ───────────────────────────────────────────────────────────
{
  const ladder = PLAN_IDS.map((id) => PLANS[id]).sort((a, b) => a.priceEur - b.priceEur);
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
