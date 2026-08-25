// Первым импортом: остальные модули создают клиентов на этапе загрузки.
import '../env.js';
import { defaultMailFrom, mailer, send } from '../notify/email.js';
import type { Check } from './health.js';

/**
 * Наблюдатель.
 *
 * Раз в минуту спрашивает у API, всё ли в порядке, и пишет письмо человеку,
 * когда перестаёт быть в порядке. Отдельным процессом, а не внутри API:
 * наблюдатель, живущий в том же процессе, что и наблюдаемое, молчит ровно
 * тогда, когда должен кричать.
 *
 * ЧЕГО ОН НЕ УМЕЕТ. Он живёт на том же сервере. Умерла машина, кончилась сеть,
 * хостер выключил свет — наблюдатель умирает вместе со всем остальным и никому
 * ничего не сообщает. Это не недоделка, это предел: изнутри нельзя доложить
 * о собственной смерти.
 *
 * Поэтому вторым слоем — «мёртвая рука». Пока всё хорошо, наблюдатель дёргает
 * внешний адрес (`HEARTBEAT_URL`). Внешняя служба ждёт этих сигналов и поднимает
 * тревогу, когда они ПЕРЕСТАЮТ приходить. Молчание становится сигналом,
 * и молчащий сервер перестаёт быть неотличимым от исправного.
 *
 * Годится любая служба с бесплатным тарифом (healthchecks.io, Better Stack,
 * cron-job.org) или просто cron на другой машине. Ставить её на этот же
 * сервер бессмысленно по той же причине, по которой недостаточно наблюдателя.
 */

const READY_URL = process.env.OPS_READY_URL ?? 'http://api:3000/health/ready';
const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS ?? 60_000);
const TIMEOUT_MS = Number(process.env.WATCHDOG_TIMEOUT_MS ?? 15_000);

/**
 * Сколько неудач подряд считается поломкой.
 *
 * Не одна. Перезапуск контейнера, секунда сетевой заминки, перевыпуск
 * сертификата — всё это даёт единичный отказ, и письмо на каждый такой отказ
 * учит человека не читать эти письма. А человек, не читающий письма от
 * наблюдателя, — это отсутствие наблюдателя, только с расходами.
 */
const FAILURES_BEFORE_ALARM = Number(process.env.WATCHDOG_FAILURES ?? 3);

/** Повторное напоминание, пока не починили. Реже, чем проверка. */
const REMINDER_MS = Number(process.env.WATCHDOG_REMINDER_MS ?? 6 * 60 * 60 * 1000);

const TO = process.env.WATCHDOG_EMAIL;
const HEARTBEAT_URL = process.env.HEARTBEAT_URL;
const LABEL = process.env.WATCHDOG_LABEL ?? process.env.API_DOMAIN ?? 'установка';

interface Probe {
  ok: boolean;
  checks: Check[];
  /** Причина, по которой не удалось даже спросить. */
  unreachable?: string;
}

async function probe(): Promise<Probe> {
  try {
    const res = await fetch(READY_URL, {
      headers: process.env.OPS_TOKEN ? { 'x-ops-token': process.env.OPS_TOKEN } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 503 — это осмысленный ответ «мне плохо, вот почему», а не сбой связи.
    if (res.status === 200 || res.status === 503) {
      const body = (await res.json()) as { ok: boolean; checks: Check[] };
      return { ok: body.ok, checks: body.checks };
    }
    return { ok: false, checks: [], unreachable: `ответ ${res.status}` };
  } catch (err) {
    return { ok: false, checks: [], unreachable: (err as Error).message.slice(0, 200) };
  }
}

function describe(p: Probe): string {
  if (p.unreachable) return `API не отвечает: ${p.unreachable}`;
  return p.checks
    .map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
    .join('\n');
}

async function notify(subject: string, text: string): Promise<void> {
  console.log(`[watchdog] ${subject}\n${text}`);
  if (!TO) return;
  if (!mailer()) {
    console.error('[watchdog] SMTP_URL не задан — письмо не отправлено');
    return;
  }
  try {
    await send({
      from: defaultMailFrom(),
      to: TO,
      subject,
      text,
      // Письмо читает человек в телефоне посреди дня. Ему нужно одно: что
      // сломалось и когда. Оформление здесь только мешает.
      html: `<pre style="font:14px/1.5 ui-monospace,monospace">${text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    });
  } catch (err) {
    // Почта — единственный канал, и если умер он, сказать об этом можно только
    // в журнал. Молча проглотить нельзя: тогда наблюдатель выглядит работающим.
    console.error('[watchdog] письмо не ушло:', (err as Error).message);
  }
}

/** Сигнал «я жив» внешней службе. Только когда всё в порядке. */
async function heartbeat(): Promise<void> {
  if (!HEARTBEAT_URL) return;
  try {
    await fetch(HEARTBEAT_URL, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    // Недоступная внешняя служба — не повод поднимать тревогу об установке:
    // сломалась она, а не мы. Но в журнал это попасть обязано, иначе мёртвая
    // рука тихо перестаёт работать и об этом никто не узнаёт.
    console.error('[watchdog] мёртвая рука недоступна:', (err as Error).message);
  }
}

let consecutiveFailures = 0;
let alarmed = false;
let lastReminder = 0;

async function tick(): Promise<void> {
  const p = await probe();

  if (p.ok) {
    if (alarmed) {
      await notify(`[${LABEL}] снова работает`, describe(p));
      alarmed = false;
    }
    consecutiveFailures = 0;
    await heartbeat();
    return;
  }

  consecutiveFailures++;
  if (consecutiveFailures < FAILURES_BEFORE_ALARM) {
    console.log(`[watchdog] неудача ${consecutiveFailures}/${FAILURES_BEFORE_ALARM}`);
    return;
  }

  const now = Date.now();
  if (!alarmed) {
    alarmed = true;
    lastReminder = now;
    await notify(`[${LABEL}] НЕ РАБОТАЕТ`, describe(p));
  } else if (now - lastReminder >= REMINDER_MS) {
    lastReminder = now;
    await notify(`[${LABEL}] всё ещё не работает`, describe(p));
  }

  // Сигнал наружу НЕ идёт: в этом и смысл мёртвой руки. Даже если письмо
  // не ушло — почта тоже могла лечь, — внешняя служба заметит молчание.
}

console.log(
  `наблюдатель: ${READY_URL} каждые ${INTERVAL_MS / 1000} с, ` +
  `тревога после ${FAILURES_BEFORE_ALARM} неудач подряд, ` +
  `письма ${TO ? `на ${TO}` : 'НЕ НАСТРОЕНЫ'}, ` +
  `мёртвая рука ${HEARTBEAT_URL ? 'настроена' : 'НЕ НАСТРОЕНА'}`,
);

if (!TO && !HEARTBEAT_URL) {
  console.error(
    'наблюдатель запущен, но сообщить о поломке ему некому: ни WATCHDOG_EMAIL,\n' +
    'ни HEARTBEAT_URL не заданы. Это наблюдение, о котором никто не узнает.',
  );
}

const timer = setInterval(() => void tick(), INTERVAL_MS);
void tick();

const stop = (): void => {
  clearInterval(timer);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
