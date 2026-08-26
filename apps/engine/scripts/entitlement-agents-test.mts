/**
 * Проверка поагентных прав: что портал показывает на месте каждого агента.
 *
 * Без базы — `accessOf` чистая, и права решаются на ней. Запросы к
 * `tenant_agents` проверяются интеграционно, здесь проверяются правила.
 */
import { productById } from '@assistwidget/contract';
import { accessOf, agentsInPlan, planForAgent, type AgentGrant } from '../src/engine/billing/agents.js';
import { PLAN_IDS } from '../src/engine/plans.js';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получено ${JSON.stringify(got)}`}`);
};

const NOW = Date.UTC(2026, 7, 26);
const day = (n: number) => new Date(NOW + n * 24 * 60 * 60 * 1000);

const chatbot = productById('chatbot')!;
const analyst = productById('data-analyst')!;

const grant = (over: Partial<AgentGrant> = {}): AgentGrant => ({
  agentId: 'chatbot',
  tier: 'basic',
  source: 'subscription',
  status: 'active',
  expiresAt: null,
  ...over,
});

console.log('поагентные права:');

// ── Куплен ─────────────────────────────────────────────────────────────
{
  const a = accessOf(chatbot, grant(), NOW);
  check('оплаченный агент открыт', a.access === 'unlocked', a.access);
  check('вилка доходит до портала', a.tier === 'basic', a.tier);
}

// ── Не куплен, но продаётся ────────────────────────────────────────────
{
  const a = accessOf(chatbot, undefined, NOW);
  check('некупленный заперт', a.access === 'locked', a.access);
  check('цена для кнопки оплаты есть', a.priceFrom === 149, a.priceFrom);
  check('вилки у запертого нет', a.tier === null, a.tier);
}

// ── Не продаётся вовсе ─────────────────────────────────────────────────
{
  const a = accessOf(analyst, undefined, NOW);
  // Аналитик со статусом planned и без вилок. Кнопка оплаты на нём брала бы
  // деньги за обещание, поэтому состояние другое, а не то же самое.
  check('непроданный агент не «заперт», а недоступен', a.access === 'unavailable', a.access);
  check('цены у недоступного нет', a.priceFrom === null, a.priceFrom);
}

// ── Отменён, но период оплачен ─────────────────────────────────────────
{
  const a = accessOf(chatbot, grant({ status: 'canceled', expiresAt: day(10) }), NOW);
  check('отменённый доживает оплаченное', a.access === 'expiring', a.access);
  check('дни до отключения считаются', a.daysLeft === 10, a.daysLeft);
}

// ── Отменён и период вышел ─────────────────────────────────────────────
{
  const a = accessOf(chatbot, grant({ status: 'canceled', expiresAt: day(-1) }), NOW);
  check('истёкший заперт', a.access === 'locked', a.access);
}

// ── Отменён без даты ───────────────────────────────────────────────────
{
  const a = accessOf(chatbot, grant({ status: 'canceled', expiresAt: null }), NOW);
  check('отменённый без даты закрыт сразу', a.access === 'locked', a.access);
}

// ── Право от старой лестницы ───────────────────────────────────────────
{
  const a = accessOf(chatbot, grant({ source: 'plan', tier: null }), NOW);
  // Перенесённые права не имеют вилки, и это не повод их не пускать:
  // клиент платил за агента вчера и должен работать сегодня.
  check('право от тарифа открывает агента', a.access === 'unlocked', a.access);
  check('вилка остаётся пустой, а не выдуманной', a.tier === null, a.tier);
}

// ── Просрочка платежа ──────────────────────────────────────────────────
{
  const a = accessOf(chatbot, grant({ status: 'past_due' }), NOW);
  // Отсрочку считает entitlement.ts на уровне клиента. Дублировать её здесь
  // значило бы завести второй набор правил, который разойдётся с первым.
  check('просрочка не закрывает агента поштучно', a.access === 'unlocked', a.access);
}

// ── Тариф → набор агентов ──────────────────────────────────────────────
//
// Соответствие продублировано в миграции 040 на SQL, потому что миграция
// обязана применяться без приложения. Дубль без проверки разъезжается, и
// разъедется он молча: обе половины по отдельности выглядят правильно.
{
  const set = (plan: string) => agentsInPlan(plan).sort().join(',');

  check('starter даёт только чат-бота', set('starter') === 'chatbot', set('starter'));
  check('pro добавляет конфигуратор', set('pro') === 'chatbot,configurator', set('pro'));
  check(
    'business добавляет дожим и статус заказа',
    set('business') === 'chatbot,configurator,follow-up,order-status',
    set('business'),
  );
  check(
    'enterprise добавляет контент и голос',
    set('enterprise') ===
      'chatbot,configurator,content-engine,follow-up,order-status,voice-assistant',
    set('enterprise'),
  );

  // Значение вне лестницы — тот же выбор, что в 039 и 040: заниженные права
  // клиент заметит и позвонит, завышенные не заметит никто.
  check('неизвестный тариф падает до starter', set('чего-то такого') === 'chatbot');

  // Аналитик не запускается этим движком. Появись он здесь — портал открыл бы
  // раздел, которого движок открыть не может.
  const analystSomewhere = PLAN_IDS.filter((p) => agentsInPlan(p).includes('data-analyst'));
  check('аналитика не даёт ни один тариф', analystSomewhere.length === 0, analystSomewhere);

  // Outreach — тоже отдельная система, и тарифом движка не выдаётся.
  const outreachSomewhere = PLAN_IDS.filter((p) => agentsInPlan(p).includes('outreach'));
  check('outreach не даёт ни один тариф', outreachSomewhere.length === 0, outreachSomewhere);
}

// ── Чем включается запертый агент ──────────────────────────────────────
//
// Кнопка оплаты обязана знать не только цену, но и за что платить. Пока
// портал этого не знал, он уводил человека в другое приложение.
{
  const chatbot = planForAgent('chatbot');
  check('чат-бот включается стартовым тарифом', chatbot?.id === 'starter', chatbot?.id);
  check('и цена приходит вместе с ним', chatbot?.priceEur === 79, chatbot?.priceEur);

  const cfg = planForAgent('configurator');
  check('конфигуратор — тарифом pro', cfg?.id === 'pro', cfg?.id);

  // Business не продаётся кнопкой. Кнопка, ведущая к отказу «этот пакет ещё
  // не продаётся», хуже отсутствия кнопки.
  check('непокупаемый тариф не предлагается', planForAgent('follow-up') === null,
        planForAgent('follow-up'));
  check('аналитика не включает ни один тариф', planForAgent('data-analyst') === null,
        planForAgent('data-analyst'));
  check('outreach не включает ни один тариф', planForAgent('outreach') === null,
        planForAgent('outreach'));

  // Запереть можно только то, что построено и продаётся, — и у всего такого
  // тариф обязан быть, иначе замок некому открыть.
  const lockable = ['chatbot', 'configurator'];
  const withoutPlan = lockable.filter((id) => planForAgent(id) === null);
  check('у каждого запираемого агента есть чем открыть', withoutPlan.length === 0, withoutPlan);
}

if (failed) {
  console.error(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log('  все проверки прошли');
