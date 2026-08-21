import { statfs } from 'node:fs/promises';
import { withPlatform } from '../db/pool.js';
import { driveQueue, ingestQueue, notifyQueue, recheckQueue, redis } from '../ingest/queue.js';

/**
 * Проверки состояния установки.
 *
 * Разделены на два уровня, и разделены намеренно.
 *
 * ЖИВОСТЬ (`/health`) отвечает на один вопрос: процесс отвечает на запросы?
 * Её опрашивает docker и по ней перезапускает контейнер. Проверять здесь базу
 * нельзя: моргнувшая база перезапустила бы API, который в этот момент исправен,
 * и к одной неполадке добавилась бы вторая.
 *
 * ГОТОВНОСТЬ (`/health/ready`) отвечает на вопрос «работает ли продукт».
 * По ней никто ничего не перезапускает — её читает наблюдатель и по ней
 * пишет письмо человеку. Здесь и база, и очередь, и воркер, и место на диске.
 *
 * Чего эти проверки не умеют и уметь не могут: сказать, что сервер умер целиком.
 * Наблюдатель живёт на том же сервере и вместе с ним и замолкает. Для этого
 * есть отдельный механизм — «мёртвая рука» в `watchdog.ts`.
 */

export interface Check {
  name: string;
  ok: boolean;
  /** Короткая причина. Читает человек в письме, а не программа. */
  detail?: string;
}

/** Воркер записывает сюда отметку времени, пока жив. */
export const WORKER_HEARTBEAT_KEY = 'ops:worker:heartbeat';

/**
 * Сколько молчания воркера считается смертью. Отметка ставится раз в 30 секунд;
 * порог с запасом, чтобы обычная заминка на разборе тяжёлого PDF не поднимала
 * тревогу — воркер в это время занят, но жив.
 */
const WORKER_SILENCE_MS = Number(process.env.WORKER_SILENCE_MS ?? 180_000);

/** Ниже этого свободного места на диске — предупреждение. */
const DISK_FREE_MIN_PCT = Number(process.env.DISK_FREE_MIN_PCT ?? 10);

/**
 * Сколько заданий в очереди считается затором. Очередь на десяток документов —
 * это норма после загрузки папки; сотня застрявших — это остановившийся воркер
 * или бесконечная ошибка.
 */
const QUEUE_BACKLOG_MAX = Number(process.env.QUEUE_BACKLOG_MAX ?? 100);

async function checkDatabase(): Promise<Check> {
  try {
    // Именно рабочей ролью и именно запросом к таблице: `SELECT 1` подтвердил бы
    // только то, что соединение открылось. Права и схема при этом могли уехать.
    //
    // Таблица выбрана не любая. Считать `tenants` нельзя: она под RLS, а тенантный
    // контекст здесь не выставлен — политика честно вернёт ноль строк на исправной
    // базе, и проверка будет писать «клиентов 0» всегда. Поймано первым же запуском.
    // У schema_migrations политики нет, а её счётчик заодно показывает версию схемы:
    // разошедшиеся версии между копиями — отдельная беда, которую иначе не видно.
    const { rows } = await withPlatform((client) =>
      client.query<{ n: string }>('SELECT count(*) AS n FROM schema_migrations'),
    );
    return { name: 'база', ok: true, detail: `миграций применено ${rows[0]?.n ?? '?'}` };
  } catch (err) {
    return { name: 'база', ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

async function checkRedis(): Promise<Check> {
  try {
    const pong = await redis.ping();
    return { name: 'очередь', ok: pong === 'PONG' };
  } catch (err) {
    return { name: 'очередь', ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

async function checkWorker(): Promise<Check> {
  try {
    const raw = await redis.get(WORKER_HEARTBEAT_KEY);
    if (!raw) {
      return { name: 'воркер', ok: false, detail: 'отметки нет — не запускался или умер' };
    }
    const age = Date.now() - Number(raw);
    if (age > WORKER_SILENCE_MS) {
      return { name: 'воркер', ok: false, detail: `молчит ${Math.round(age / 1000)} с` };
    }
    return { name: 'воркер', ok: true };
  } catch (err) {
    return { name: 'воркер', ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

/**
 * Заторы и упавшие задания.
 *
 * Упавшее задание — это не абстракция: `lead-notify` это письмо о заявке.
 * Молча накапливающиеся failed здесь означают, что отдел продаж не узнал
 * о клиентах, и узнать об этом иначе неоткуда.
 */
async function checkQueues(): Promise<Check> {
  const queues = [
    ['разбор', ingestQueue],
    ['Drive', driveQueue],
    ['перепроверка', recheckQueue],
    ['письма', notifyQueue],
  ] as const;

  try {
    const problems: string[] = [];
    for (const [name, queue] of queues) {
      const counts = await queue.getJobCounts('waiting', 'failed', 'delayed');
      if ((counts.failed ?? 0) > 0) problems.push(`${name}: упавших ${counts.failed}`);
      const pending = (counts.waiting ?? 0) + (counts.delayed ?? 0);
      if (pending > QUEUE_BACKLOG_MAX) problems.push(`${name}: в очереди ${pending}`);
    }
    return problems.length === 0
      ? { name: 'задания', ok: true }
      : { name: 'задания', ok: false, detail: problems.join('; ') };
  } catch (err) {
    return { name: 'задания', ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

/**
 * Место на диске.
 *
 * Кончившееся место — самая тихая из поломок: база перестаёт писать, файлы
 * перестают сохраняться, а виджет при этом отвечает и выглядит исправным.
 * Растут здесь три вещи: материалы клиентов, переписки и резервные копии.
 */
async function checkDisk(): Promise<Check> {
  const path = process.env.STORAGE_DIR ?? '.';
  try {
    const fs = await statfs(path);
    const freePct = (fs.bfree / fs.blocks) * 100;
    const freeGb = (fs.bfree * fs.bsize) / 1024 ** 3;
    const detail = `свободно ${freePct.toFixed(1)}% (${freeGb.toFixed(1)} ГБ)`;
    return { name: 'диск', ok: freePct >= DISK_FREE_MIN_PCT, detail };
  } catch (err) {
    return { name: 'диск', ok: false, detail: (err as Error).message.slice(0, 200) };
  }
}

/** Все проверки разом. Параллельно: одна медленная не должна задерживать остальные. */
export async function readiness(): Promise<{ ok: boolean; checks: Check[] }> {
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWorker(),
    checkQueues(),
    checkDisk(),
  ]);
  return { ok: checks.every((c) => c.ok), checks };
}
