/**
 * Ограничение частоты: границы окон, независимость ключей, память.
 *
 * Часы передаются снаружи, поэтому час проверяется за миллисекунду, а не за
 * час. Проверка, которая ждёт по-настоящему, не запускается — а значит
 * не защищает.
 *
 *   npm run test:rate
 */
import {
  CHAT_BUDGET, CONFIGURATOR_ASK_BUDGET, CONFIGURATOR_BUDGET,
  rateLimits, resetRateLimits, takeRateSlot,
} from '../src/engine/api/rate-limit.js';

let failures = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failures++; };
const eq = (got: unknown, want: unknown, m: string): void =>
  got === want ? ok(m) : bad(`${m}: получено ${String(got)}, ожидалось ${String(want)}`);

const T = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

const B = CHAT_BUDGET;
console.log(`частота чата: ${B.perMinute}/мин, ${B.perHour}/час\n`);

// 1. Потолок минуты: пропускается ровно столько, сколько объявлено.
{
  resetRateLimits();
  let passed = 0;
  for (let i = 0; i < B.perMinute + 5; i++) {
    if (takeRateSlot(B, 't1', '1.1.1.1', T).allowed) passed++;
  }
  eq(passed, B.perMinute, 'за минуту пропущено ровно по потолку');
}

// 2. Отказ не продлевает сам себя. Иначе достаточно продолжать стучаться,
//    чтобы окно не кончилось никогда, — и сосед по NAT ждал бы не минуту,
//    а пока стучащийся не остановится.
{
  resetRateLimits();
  for (let i = 0; i < 100; i++) takeRateSlot(B, 't1', '1.1.1.1', T);
  eq(takeRateSlot(B, 't1', '1.1.1.1', T + MIN).allowed, true, 'через минуту снова пропускает');
}

// 3. Ключи не перетекают: ни между адресами, ни между клиентами.
{
  resetRateLimits();
  for (let i = 0; i < B.perMinute; i++) takeRateSlot(B, 't1', '1.1.1.1', T);
  eq(takeRateSlot(B, 't1', '2.2.2.2', T).allowed, true, 'другой адрес не наказан за первый');
  eq(takeRateSlot(B, 't2', '1.1.1.1', T).allowed, true, 'другой клиент не наказан за первого');
  eq(takeRateSlot(B, 't1', '1.1.1.1', T).allowed, false, 'исходный ключ всё ещё под потолком');
}

// 4. Часовое окно ловит то, что в минуту укладывается: по потолку минуты
//    раз в минуту — и через час всё равно отказ.
{
  resetRateLimits();
  let passed = 0;
  for (let m = 0; m < 120; m++) {
    for (let i = 0; i < B.perMinute; i++) {
      if (takeRateSlot(B, 't1', '1.1.1.1', T + m * MIN).allowed) passed++;
    }
  }
  eq(passed, B.perHour * 2, 'за два часа пропущено два часовых потолка');
}

// 5. Через час счёт начинается заново.
{
  resetRateLimits();
  for (let i = 0; i < 1000; i++) takeRateSlot(B, 't1', '1.1.1.1', T);
  eq(takeRateSlot(B, 't1', '1.1.1.1', T + HOUR).allowed, true, 'через час окно новое');
}

// 6. Заголовок retry-after не врёт: ждать столько, сколько осталось окну.
{
  resetRateLimits();
  for (let i = 0; i < B.perMinute; i++) takeRateSlot(B, 't1', '1.1.1.1', T);
  const v = takeRateSlot(B, 't1', '1.1.1.1', T + 20_000);
  eq(v.window, 'minute', 'названо переполненное окно');
  eq(v.retryAfterSeconds, 40, 'ждать ровно остаток окна');
}

// 7. Память, половина первая: просроченное убирается.
{
  resetRateLimits();
  const many = 60_000;
  for (let i = 0; i < many; i++) takeRateSlot(B, 't1', `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, T);
  const grown = rateLimits.tracked();
  for (let i = 0; i < 100; i++) takeRateSlot(B, 't1', `11.0.0.${i}`, T + HOUR + 1);
  const after = rateLimits.tracked();
  if (after <= 200) ok(`просроченные ключи убираются: было ${grown}, стало ${after}`);
  else bad(`просроченное не убирается: было ${grown}, стало ${after}`);
}

// 8. Память, половина вторая: за первый час просроченного НЕТ вообще,
//    и одной уборки мало. Без жёсткого потолка карта росла бы, пока хватает
//    памяти, а обход по ней звался бы на каждом запросе.
{
  resetRateLimits();
  const flood = 120_000;
  for (let i = 0; i < flood; i++) {
    takeRateSlot(B, 't1', `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, T);
  }
  const tracked = rateLimits.tracked();
  if (tracked <= 50_000) ok(`${flood.toLocaleString('ru')} свежих адресов подряд: в памяти ${tracked.toLocaleString('ru')} ключей`);
  else bad(`потолок ключей не держит: ${tracked}`);
}

// Бюджеты не перетекают друг в друга: щелчки по вариантам не должны
// расходовать право задать вопрос агенту, и наоборот.
{
  resetRateLimits();
  for (let i = 0; i < CONFIGURATOR_BUDGET.perMinute; i++) {
    takeRateSlot(CONFIGURATOR_BUDGET, 't1', '1.1.1.1', T);
  }
  eq(takeRateSlot(CONFIGURATOR_BUDGET, 't1', '1.1.1.1', T).allowed, false,
     'бюджет конфигуратора исчерпан');
  eq(takeRateSlot(CONFIGURATOR_ASK_BUDGET, 't1', '1.1.1.1', T).allowed, true,
     'вопрос агенту не наказан за щелчки по вариантам');
  eq(takeRateSlot(B, 't1', '1.1.1.1', T).allowed, true,
     'и чат тоже не наказан');
}

// Потолок вопроса агенту тесный намеренно: это вызов модели, который больше
// нигде не учитывается — ни в месячной квоте сообщений, ни в пакете оферт.
{
  resetRateLimits();
  let passed = 0;
  for (let i = 0; i < 100; i++) {
    if (takeRateSlot(CONFIGURATOR_ASK_BUDGET, 't1', '1.1.1.1', T + i * MIN).allowed) passed++;
  }
  eq(passed, CONFIGURATOR_ASK_BUDGET.perHour * 2, 'за сто минут — два часовых потолка вопросов');
}

resetRateLimits();
console.log(failures === 0 ? '\nЧАСТОТА OK' : `\nЧАСТОТА НАРУШЕНА: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
