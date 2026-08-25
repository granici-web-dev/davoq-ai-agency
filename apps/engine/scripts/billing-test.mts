/**
 * Подписка: кто имеет право на ответы бота и когда это право кончается.
 *
 *   npm run test:billing
 *
 * Проверяются границы, а не середина. «Оплачено — работает» не ломается
 * никогда; ломается «последний день триала», «первая минута после отсрочки»
 * и «дата не заполнена». Каждая из этих ошибок молчалива: клиент либо
 * пользуется бесплатно, либо выключается на день раньше и звонит ругаться.
 */
import { entitlementOf, trialEndsAt, TRIAL_DAYS, GRACE_DAYS } from '../src/engine/billing/entitlement.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);
const days = (n: number): Date => new Date(NOW + n * DAY);

const check = (
  what: string,
  state: Parameters<typeof entitlementOf>[0],
  expectActive: boolean,
  expectReason?: string,
): void => {
  const e = entitlementOf(state, NOW);
  if (e.active !== expectActive) {
    bad(`${what}: ожидалось ${expectActive ? 'работает' : 'не работает'}, вышло наоборот (${e.reason})`);
  } else if (expectReason && e.reason !== expectReason) {
    bad(`${what}: причина «${e.reason}», ожидалась «${expectReason}»`);
  } else {
    ok(`${what} → ${e.active ? 'работает' : 'форма контакта'} (${e.reason}${e.daysLeft !== null ? `, дней ${e.daysLeft}` : ''})`);
  }
};

// ── Триал ────────────────────────────────────────────────────────────────
check('триал, осталось 14 дней',
  { subscriptionStatus: 'trial', trialEndsAt: days(14), currentPeriodEnd: null }, true, 'trial');
check('триал, последний день',
  { subscriptionStatus: 'trial', trialEndsAt: days(0.5), currentPeriodEnd: null }, true, 'trial');
check('триал истёк час назад',
  { subscriptionStatus: 'trial', trialEndsAt: days(-0.04), currentPeriodEnd: null }, false, 'trial_expired');
check('триал без даты — наша недоработка, не его неоплата',
  { subscriptionStatus: 'trial', trialEndsAt: null, currentPeriodEnd: null }, true, 'trial');

// ── Оплачено ─────────────────────────────────────────────────────────────
check('оплачено',
  { subscriptionStatus: 'active', trialEndsAt: null, currentPeriodEnd: days(20) }, true, 'paid');
check('оплачено, период формально истёк (вебхук не пришёл)',
  { subscriptionStatus: 'active', trialEndsAt: null, currentPeriodEnd: days(-2) }, true, 'paid');

// ── Карта не прошла ──────────────────────────────────────────────────────
check('карта не прошла, оплаченный период ещё идёт',
  { subscriptionStatus: 'past_due', trialEndsAt: null, currentPeriodEnd: days(3) }, true, 'grace');
check('карта не прошла, идёт отсрочка',
  { subscriptionStatus: 'past_due', trialEndsAt: null, currentPeriodEnd: days(-2) }, true, 'grace');
check('карта не прошла, отсрочка кончилась',
  { subscriptionStatus: 'past_due', trialEndsAt: null, currentPeriodEnd: days(-GRACE_DAYS - 1) }, false, 'unpaid');

// ── Отменено ─────────────────────────────────────────────────────────────
check('подписка отменена',
  { subscriptionStatus: 'canceled', trialEndsAt: null, currentPeriodEnd: days(30) }, false, 'canceled');
check('состояние, которого мы не знаем',
  { subscriptionStatus: 'что-то новое', trialEndsAt: null, currentPeriodEnd: null }, false, 'canceled');

// ── Длина триала ─────────────────────────────────────────────────────────
{
  const from = new Date(NOW);
  const end = trialEndsAt(from);
  const got = Math.round((end.getTime() - from.getTime()) / DAY);
  if (got === TRIAL_DAYS) ok(`триал длится ${TRIAL_DAYS} дней`);
  else bad(`триал вышел ${got} дней вместо ${TRIAL_DAYS}`);
}

console.log(failed === 0 ? '\nПОДПИСКА OK' : `\nПОДПИСКА НАРУШЕНА: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
