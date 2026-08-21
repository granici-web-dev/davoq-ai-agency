/**
 * Вебхук платёжной системы: единственный открытый интернету адрес,
 * который меняет состояние подписки.
 *
 *   npm run test:webhook
 *
 * Проверяется не «работает ли он», а «нельзя ли получить продукт бесплатно».
 * Каждая проверка ниже — способ, которым это делается, если чего-то не сделать.
 */
import { createHmac } from 'node:crypto';
import { verifyWebhook, interpret } from '../src/engine/../platform/billing/stripe.js';

const SECRET = 'whsec_проба_ключа_вебхука';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };

const NOW = Date.now();
const sign = (body: string, at = NOW, secret = SECRET): string => {
  const t = Math.floor(at / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
};

const event = (type: string, object: Record<string, unknown>, id = 'evt_1'): string =>
  JSON.stringify({ id, type, data: { object } });

const paid = event('checkout.session.completed', {
  metadata: { tenant_id: '11111111-1111-1111-1111-111111111111' },
  subscription: 'sub_1', customer: 'cus_1',
});

// ── 1. Настоящая подпись проходит ─────────────────────────────────────────
{
  const r = verifyWebhook(paid, sign(paid), SECRET, NOW);
  if (r.ok) ok('настоящая подпись принимается');
  else bad(`настоящая подпись отвергнута: ${r.why}`);
}

// ── 2. Способы получить продукт бесплатно ─────────────────────────────────
const rejects = (what: string, body: string, header: string | undefined, at = NOW): void => {
  const r = verifyWebhook(body, header, SECRET, at);
  if (r.ok) bad(`${what}: ПРОШЛО — так можно включить себе оплату`);
  else ok(`${what}: отвергнуто — ${r.why}`);
};

rejects('без подписи вовсе', paid, undefined);
rejects('подпись выдумана', paid, 't=' + Math.floor(NOW / 1000) + ',v1=' + 'a'.repeat(64));
rejects('подпись от другого ключа', paid, sign(paid, NOW, 'whsec_чужой'));
rejects('тело подменено после подписи',
  event('checkout.session.completed', { metadata: { tenant_id: 'чужой-клиент' } }),
  sign(paid));
rejects('старый перехваченный вебхук (час назад)', paid, sign(paid, NOW - 3600_000));
rejects('отметка времени из будущего', paid, sign(paid, NOW + 3600_000));
rejects('заголовок без отметки времени', paid,
  'v1=' + createHmac('sha256', SECRET).update(paid).digest('hex'));
rejects('мусор вместо заголовка', paid, 'что-то не то');

// ── 3. Ключ не задан — не пропускаем «на всякий случай» ───────────────────
//
// Ключ приходится убирать из окружения по-настоящему: значение по умолчанию
// у параметра читает именно оттуда, и передать `undefined` недостаточно.
// На этом и попался первый вариант проверки — он показывал дыру там, где её нет.
{
  const saved = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const r = verifyWebhook(paid, sign(paid));
  process.env.STRIPE_WEBHOOK_SECRET = saved;
  if (r.ok) bad('без настроенного ключа вебхук ПРИНЯТ — это открытая дверь');
  else ok(`ключ не задан: отвергнуто — ${r.why}`);
}

// ── 4. Толкование событий ─────────────────────────────────────────────────
{
  const c = interpret(JSON.parse(paid));
  if (c?.status === 'active' && c.subscriptionId === 'sub_1') ok('оплата → active');
  else bad(`оплата истолкована как ${JSON.stringify(c)}`);

  const past = interpret(JSON.parse(event('customer.subscription.updated', {
    id: 'sub_1', status: 'past_due', customer: 'cus_1',
    current_period_end: Math.floor(NOW / 1000),
    metadata: { tenant_id: 'x', plan: 'pro' },
  })));
  if (past?.status === 'past_due' && past.plan === 'pro') ok('карта не прошла → past_due');
  else bad(`отказ карты истолкован как ${JSON.stringify(past)}`);

  const trialing = interpret(JSON.parse(event('customer.subscription.updated', {
    id: 'sub_1', status: 'trialing', metadata: { tenant_id: 'x' },
  })));
  if (trialing?.status === 'active') ok('пробный период Stripe → active (карта уже привязана)');
  else bad(`trialing истолкован как ${JSON.stringify(trialing)}`);

  const gone = interpret(JSON.parse(event('customer.subscription.deleted', {
    id: 'sub_1', status: 'canceled', metadata: { tenant_id: 'x' },
  })));
  if (gone?.status === 'canceled') ok('отмена → canceled');
  else bad(`отмена истолкована как ${JSON.stringify(gone)}`);

  // Событие без наших метаданных — не наше. Догадываться, кому его приписать,
  // опаснее, чем пропустить: угаданный клиент получит чужую подписку.
  const foreign = interpret(JSON.parse(event('customer.subscription.updated', {
    id: 'sub_9', status: 'active', customer: 'cus_9',
  })));
  if (foreign === null) ok('событие без наших метаданных игнорируется, а не угадывается');
  else bad(`событие без tenant_id приписано клиенту: ${JSON.stringify(foreign)}`);

  const other = interpret(JSON.parse(event('invoice.created', { id: 'in_1' })));
  if (other === null) ok('посторонние события игнорируются');
  else bad('постороннее событие что-то изменило');
}

console.log(failed === 0 ? '\nВЕБХУК OK' : `\nВЕБХУК НАРУШЕН: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
