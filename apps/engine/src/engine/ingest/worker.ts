// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import { Worker } from 'bullmq';
import { closeOwnerPool, pool, withOwner } from '../db/pool.js';
import { processDocument } from './index.js';
import { WORKER_HEARTBEAT_KEY } from '../ops/health.js';
import {
  driveQueue, enqueueRecheck, notifyQueue, recheckQueue, redis, scheduleDriveSync,
  DRIVE_SYNC_MINUTES,
  type DriveSyncJob, type IngestJob, type NotifyJob, type RecheckJob,
} from './queue.js';

/**
 * Воркер обработки документов. Запускается отдельным процессом (`npm run worker`),
 * чтобы длинный разбор PDF не занимал цикл событий API-сервера.
 */
const worker = new Worker<IngestJob>(
  'ingest',
  async (job) => {
    await processDocument(job.data.tenantId, job.data.documentId);
  },
  { connection: redis, concurrency: Number(process.env.INGEST_CONCURRENCY ?? 2) },
);

// Новый материал в базе — повод перепроверить накопленные пробелы. Ставим
// задание отсюда, а не из ингестии: так покрыты оба пути, и диск, и обход сайта.
worker.on('completed', (job) => {
  console.log(`indexed ${job.data.documentId}`);
  void enqueueRecheck(job.data.tenantId);
});
worker.on('failed', (job, err) =>
  console.error(`failed ${job?.data.documentId}: ${err.message}`),
);

const driveWorker = new Worker<DriveSyncJob>(
  'drive-sync',
  async (job) => {
    const { syncDrive } = await import('../drive/sync.js');
    const r = await syncDrive(job.data.tenantId);
    console.log(
      `drive ${job.data.tenantId}: +${r.added} ~${r.updated} -${r.removed} =${r.unchanged}` +
      (r.errors.length ? ` ошибок ${r.errors.length}` : ''),
    );
    // Удаление файла не порождает ни одной задачи на индексацию, поэтому
    // обычный прогон после него не запустится сам — ставим полный отсюда.
    if (r.removed > 0) await enqueueRecheck(job.data.tenantId, { includeResolved: true });
    return r;
  },
  { connection: redis, concurrency: 1 },
);

driveWorker.on('failed', (job, err) =>
  console.error(`drive ${job?.data.tenantId}: ${err.message}`),
);

const recheckWorker = new Worker<RecheckJob>(
  'recheck',
  async (job) => {
    const { recheckUnanswered } = await import('../rag/recheck.js');
    const r = await recheckUnanswered(job.data.tenantId, {
      includeResolved: job.data.includeResolved ?? false,
    });
    console.log(
      `recheck ${job.data.tenantId}: проверено ${r.checked}, закрыто ${r.resolved}` +
      (r.reopened ? `, открыто обратно ${r.reopened}` : ''),
    );
    return r;
  },
  { connection: redis, concurrency: 1 },
);

recheckWorker.on('failed', (job, err) =>
  console.error(`recheck ${job?.data.tenantId}: ${err.message}`),
);

const notifyWorker = new Worker<NotifyJob>(
  'lead-notify',
  async (job) => {
    const { notifyLead } = await import('../notify/lead.js');
    const outcome = await notifyLead(job.data.tenantId, job.data.conversationId);
    console.log(`lead ${job.data.conversationId}: ${outcome}`);
    return outcome;
  },
  { connection: redis, concurrency: 2 },
);

// Падение здесь означает, что о заявке никто не узнал. Пишем в лог отдельно
// и заметно: причина уже лежит в leads.notify_error и видна в панели, но
// сначала её увидит тот, кто смотрит на воркер.
notifyWorker.on('failed', (job, err) =>
  console.error(`lead ${job?.data.conversationId}: письмо не ушло — ${err.message}`),
);

// Расписание восстанавливается при старте: тенанты с подключённым диском должны
// синхронизироваться и после перезапуска воркера, без ручного вмешательства.
{
  // Восстановление расписания — операция поверх всех тенантов сразу, то есть
  // по определению вне тенантного контекста. Рабочая роль под RLS такой запрос
  // видит пустым, и без пула владельца сверка молча перестала бы запускаться.
  const { rows } = await withOwner((client) =>
    client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM connectors WHERE type = 'google_drive' AND status = 'active'`,
    ),
  );
  for (const r of rows) await scheduleDriveSync(r.tenant_id);
  console.log(`drive sync каждые ${DRIVE_SYNC_MINUTES} мин для ${rows.length} тенант(ов)`);
}

/**
 * Отметка «жив».
 *
 * Воркер молчалив по природе: он просыпается на задание и снова засыпает.
 * Отличить «нечего делать» от «умер» снаружи нельзя никак, а умирает он
 * незаметно — виджет при этом отвечает, панель открывается, и только документы
 * не индексируются, а письма о заявках не уходят.
 *
 * Ключ с истечением, а не запись в базе: если воркер умрёт, отметка исчезнет
 * сама, и наблюдателю не придётся отличать старую от свежей.
 */
const heartbeat = setInterval(() => {
  void redis.set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 600);
}, 30_000);
void redis.set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 600);

const shutdown = async (): Promise<void> => {
  clearInterval(heartbeat);
  // Отметка убирается сразу: перезапуск воркера не должен три минуты выглядеть
  // как смерть, а остановка руками — выглядеть как работа.
  await redis.del(WORKER_HEARTBEAT_KEY).catch(() => undefined);
  // Закрываем воркер до пула: незавершённое задание должно успеть записать
  // статус failed, а не оборваться на закрытом соединении с базой.
  await worker.close();
  await driveWorker.close();
  await recheckWorker.close();
  await notifyWorker.close();
  await driveQueue.close();
  await recheckQueue.close();
  await notifyQueue.close();
  await redis.quit();
  await pool.end();
  await closeOwnerPool();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.log('ingest worker started');
