/**
 * Проверка поагентных прав: что портал показывает на месте каждого агента.
 *
 * Без базы — `accessOf` чистая, и права решаются на ней. Запросы к
 * `tenant_agents` проверяются интеграционно, здесь проверяются правила.
 */
import { productById } from '@assistwidget/contract';
import { accessOf, type AgentGrant } from '../src/engine/billing/agents.js';

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

if (failed) {
  console.error(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log('  все проверки прошли');
