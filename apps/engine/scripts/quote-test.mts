/**
 * Расчёт заказа. Здесь считаются деньги, поэтому проверяется придирчиво.
 *
 * Главное, что проверяется, — скидки ПЕРЕМНОЖАЮТСЯ. «Минус 10 и минус 20»
 * читается как минус 30 у любого, кто не смотрел в код, и ошибка эта не
 * теоретическая: она даёт клиенту счёт, который расходится с обещанным.
 *
 *   npm run test:quote
 */
import { quote, COMMERCE, productById } from '@assistwidget/contract';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получено ${JSON.stringify(got)}`}`);
};

const CHATBOT = productById('chatbot')!.tiers!.basic.price;
const CONFIG = productById('configurator')!.tiers!.basic.price;

console.log('расчёт заказа:');

// ── Один агент, помесячно ──────────────────────────────────────────────
{
  const q = quote([{ agentId: 'chatbot', tier: 'basic' }]);
  check('один агент — прайсовая цена без скидок', q.recurring === CHATBOT, q.recurring);
  check('скидки за количество нет', q.volumeDiscount === 0, q.volumeDiscount);
  check('заведение первого агента', q.setup === COMMERCE.setup.first, q.setup);
  check('к оплате — период плюс заведение', q.dueNow === CHATBOT + COMMERCE.setup.first, q.dueNow);
}

// ── Два агента: скидка за количество ───────────────────────────────────
{
  const q = quote([
    { agentId: 'chatbot', tier: 'basic' },
    { agentId: 'configurator', tier: 'basic' },
  ]);
  check('за двоих скидка десять процентов', q.volumeDiscount === 0.1, q.volumeDiscount);
  check(
    'месячный платёж со скидкой',
    q.recurring === Math.floor((CHATBOT + CONFIG) * 0.9),
    q.recurring,
  );
  check(
    'заведение: первый по одной цене, второй по другой',
    q.setup === COMMERCE.setup.first + COMMERCE.setup.next,
    q.setup,
  );
}

// ── Годовая: скидки перемножаются ──────────────────────────────────────
{
  const q = quote(
    [
      { agentId: 'chatbot', tier: 'basic' },
      { agentId: 'configurator', tier: 'basic' },
    ],
    { period: 'yearly' },
  );
  const expected = Math.floor((CHATBOT + CONFIG) * 0.9 * 12 * 0.8);
  check('годовой платёж', q.recurring === expected, q.recurring);

  // Сложение долей дало бы минус 30 вместо минус 28. Разница уходит клиенту
  // в счёт, и заметит её он, а не мы.
  const ifAdded = Math.floor((CHATBOT + CONFIG) * 12 * (1 - 0.3));
  check('доли перемножены, а не сложены', q.recurring !== ifAdded, {
    got: q.recurring,
    ifAdded,
  });
}

// ── У клиента уже есть агенты ──────────────────────────────────────────
{
  const q = quote([{ agentId: 'chatbot', tier: 'basic' }], { existingAgents: 2 });
  check('скидка считается от общего числа', q.volumeDiscount === 0.2, q.volumeDiscount);
  // «Первый» у клиента бывает один раз в жизни.
  check('заведение по цене следующего', q.setup === COMMERCE.setup.next, q.setup);
}

// ── Пилот ──────────────────────────────────────────────────────────────
{
  const q = quote([{ agentId: 'chatbot', tier: 'basic' }], { pilot: true });
  check('пилоту заведение бесплатно', q.setup === 0, q.setup);
  check('но подписка остаётся', q.recurring === CHATBOT, q.recurring);
}

// ── Вилка pro дороже basic ─────────────────────────────────────────────
{
  const basic = quote([{ agentId: 'chatbot', tier: 'basic' }]).recurring;
  const pro = quote([{ agentId: 'chatbot', tier: 'pro' }]).recurring;
  check('pro дороже basic', pro > basic, { basic, pro });
}

// ── Того, у чего нет цены, продать нельзя ──────────────────────────────
{
  let threw = false;
  try {
    quote([{ agentId: 'data-analyst', tier: 'basic' }]);
  } catch {
    threw = true;
  }
  // Молча посчитать нулём — худший способ сообщить, что цены нет.
  check('агент без цены роняет расчёт, а не считается нулём', threw);

  let threwUnknown = false;
  try {
    quote([{ agentId: 'нет-такого', tier: 'basic' }]);
  } catch {
    threwUnknown = true;
  }
  check('несуществующий агент роняет расчёт', threwUnknown);
}

// ── Округление в пользу клиента ────────────────────────────────────────
{
  const q = quote(
    [
      { agentId: 'chatbot', tier: 'basic' },
      { agentId: 'configurator', tier: 'basic' },
    ],
    { period: 'yearly' },
  );
  const exact = (CHATBOT + CONFIG) * 0.9 * 12 * 0.8;
  check('округление вниз, а не вверх', q.recurring <= exact, { got: q.recurring, exact });
}

if (failed) {
  console.error(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log('  все проверки прошли');
