/**
 * Ограничение частоты на публичных ручках.
 *
 * До него между чужим скриптом и счётом клиента не стояло ничего. Публичный
 * ключ лежит в HTML сайта клиента по замыслу, `Origin` подделывается обычным
 * curl, и оставались только потолок одновременных диалогов (двенадцать) да
 * месячная квота — то есть ровно то, что атака и уничтожает. Пятьсот
 * сообщений тарифа Basic выжигались двенадцатью потоками за минуты, после
 * чего клиент оставался без бота до первого числа и платил за токены.
 *
 * Считаем по паре «клиент + адрес». Не по посетителю: его идентификатор
 * приходит из тела запроса, и скрипту ничего не стоит слать каждый раз новый.
 * Адрес — единственное, что атакующему приходится добывать по-настоящему.
 *
 * Два окна, а не одно. Минутное ловит цикл сразу; часовое ловит медленный
 * слив, который в минуту укладывается. Одно окно пришлось бы делать либо
 * слишком тесным для живого разговора, либо бесполезным против ожидания.
 *
 * Честно про предел: распределённую атаку с сотни адресов это не остановит,
 * а поднимет ей цену. Остановить её на нашей стороне нечем — можно только
 * заметить, и для этого отказ пишется в журнал с адресом.
 *
 * Счётчики в памяти процесса, как и у потолка одновременных диалогов рядом.
 * Redis дал бы общий счёт на несколько копий API, но и новый способ упасть
 * прямо на пути запроса: недоступный Redis либо кладёт чат, либо снимает
 * ограничение — и то и другое хуже. Копия API сейчас одна; если их станет
 * несколько, потолок умножится на их число, и это надо будет переделать.
 */

/**
 * Бюджеты. Разные ручки — разная естественная частота, и один потолок на всех
 * пришлось бы ставить по самой частой, то есть не ставить вовсе.
 *
 * Живой посетитель в чате шлёт три-шесть сообщений в минуту: он читает ответ
 * и печатает. В конфигураторе он щёлкает варианты, и цена пересчитывается
 * на каждый щелчок — десятки запросов за ту же минуту, и это норма, а не
 * атака. А вопрос агенту снова зовёт модель, и там потолок нужен самый тесный.
 *
 * Ключ включает имя бюджета, поэтому щелчки по вариантам не расходуют
 * право задать вопрос.
 */
export interface RateBudget {
  name: string;
  perMinute: number;
  perHour: number;
}

export const CHAT_BUDGET: RateBudget = {
  name: 'chat',
  perMinute: Number(process.env.CHAT_RATE_PER_MINUTE ?? 10),
  perHour: Number(process.env.CHAT_RATE_PER_HOUR ?? 60),
};

/** Щелчки по вариантам и пересчёт цены. Частота человеческая, но высокая. */
export const CONFIGURATOR_BUDGET: RateBudget = {
  name: 'cfg',
  perMinute: Number(process.env.CONFIGURATOR_RATE_PER_MINUTE ?? 60),
  perHour: Number(process.env.CONFIGURATOR_RATE_PER_HOUR ?? 300),
};

/** Вопрос агенту конфигуратора: вызов модели, ничем больше не учитываемый. */
export const CONFIGURATOR_ASK_BUDGET: RateBudget = {
  name: 'cfg-ask',
  perMinute: Number(process.env.CONFIGURATOR_ASK_RATE_PER_MINUTE ?? 5),
  perHour: Number(process.env.CONFIGURATOR_ASK_RATE_PER_HOUR ?? 40),
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Потолок на число ключей.
 *
 * Атакующий, меняющий адрес на каждый запрос, иначе выращивал бы эту карту
 * без предела — то есть ограничитель сам стал бы способом уронить процесс.
 *
 * Одной уборки просроченного мало, и это выяснилось проверкой: за первый час
 * просроченного нет ВООБЩЕ, значит уборка не освобождает ничего, а звать её
 * приходится на каждом запросе — обход растущей карты сам превращается
 * в нагрузку. Поэтому потолок жёсткий: после уборки лишнее вытесняется
 * по старшинству, Map хранит порядок вставки.
 *
 * Вытесненный ключ получает счёт заново. Это плата, и она осознанная:
 * случай, в котором до вытеснения дойдёт, — атака с десятков тысяч адресов,
 * а против неё счёт по адресу и так почти ничего не значит. Ограниченная
 * память важнее точного счёта в том случае, где счёт всё равно бесполезен.
 */
const MAX_KEYS = 50_000;

interface Window {
  startedAt: number;
  count: number;
}

interface Counters {
  minute: Window;
  hour: Window;
}

const counters = new Map<string, Counters>();

export interface RateVerdict {
  allowed: boolean;
  /** Сколько ждать. Отдаётся посетителю заголовком retry-after. */
  retryAfterSeconds: number;
  /** Какое из окон переполнилось — для журнала, чтобы чинить не наугад. */
  window: 'minute' | 'hour' | null;
}

const ALLOWED: RateVerdict = { allowed: true, retryAfterSeconds: 0, window: null };

/** Окно, начатое раньше, чем `length` назад, считается новым. */
function roll(w: Window, now: number, length: number): void {
  if (now - w.startedAt >= length) {
    w.startedAt = now;
    w.count = 0;
  }
}

function sweep(now: number): void {
  for (const [key, c] of counters) {
    if (now - c.hour.startedAt >= HOUR_MS) counters.delete(key);
  }
  for (const key of counters.keys()) {
    if (counters.size < MAX_KEYS) break;
    counters.delete(key);
  }
}

/**
 * Учесть запрос и сказать, пропускать ли его.
 *
 * Считает ТОЛЬКО пропущенные: отказ не продлевает наказание сам себя, иначе
 * достаточно продолжать стучаться, чтобы окно не кончилось никогда, — и живой
 * посетитель, случайно попавший под потолок вместе с соседом по NAT, ждал бы
 * не минуту, а пока сосед не остановится.
 */
export function takeRateSlot(
  budget: RateBudget, tenantId: string, ip: string, now = Date.now(),
): RateVerdict {
  if (counters.size >= MAX_KEYS) sweep(now);

  const key = `${budget.name}:${tenantId}:${ip}`;
  let c = counters.get(key);
  if (!c) {
    c = { minute: { startedAt: now, count: 0 }, hour: { startedAt: now, count: 0 } };
    counters.set(key, c);
  }

  roll(c.minute, now, MINUTE_MS);
  roll(c.hour, now, HOUR_MS);

  if (c.minute.count >= budget.perMinute) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((MINUTE_MS - (now - c.minute.startedAt)) / 1000),
      window: 'minute',
    };
  }
  if (c.hour.count >= budget.perHour) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((HOUR_MS - (now - c.hour.startedAt)) / 1000),
      window: 'hour',
    };
  }

  c.minute.count++;
  c.hour.count++;
  return ALLOWED;
}

/** Для проверок: между случаями счётчики не должны перетекать. */
export function resetRateLimits(): void {
  counters.clear();
}

export const rateLimits = { tracked: (): number => counters.size };
