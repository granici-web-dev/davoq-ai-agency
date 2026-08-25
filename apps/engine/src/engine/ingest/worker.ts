// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import { Worker } from 'bullmq';
import { closeOwnerPool, pool, withOwner } from '../db/pool.js';
import { processDocument } from './index.js';
import { WORKER_HEARTBEAT_KEY } from '../ops/health.js';
import {
  driveQueue, enqueueRecheck, notifyQueue, recheckQueue, redis, scheduleDriveSync,
  DRIVE_SYNC_MINUTES, scheduleTrialNotices, trialQueue, schedulePurge, purgeQueue,
  promoQueue, schedulePromoScrape, unschedulePromoScrape, type PromoScrapeJob,
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
    client.query<{ tenant_id: string; plan: string }>(
      `SELECT c.tenant_id, t.plan
         FROM connectors c JOIN tenants t ON t.id = c.tenant_id
        WHERE c.type = 'google_drive' AND c.status = 'active'`,
    ),
  );
  // Синхронизация ставится только тем, у кого Drive входит в тариф. Иначе
  // клиент, понизивший пакет, продолжал бы получать её молча — и платил бы
  // за Pro не он, а мы.
  const { planFor } = await import('../plans.js');
  const eligible = rows.filter((r) => planFor(r.plan).features.drive);
  for (const r of eligible) await scheduleDriveSync(r.tenant_id);
  console.log(`drive sync каждые ${DRIVE_SYNC_MINUTES} мин для ${eligible.length} из ${rows.length} тенант(ов)`);

  // Расписание одно на всю установку, а не на клиента: сам проход перебирает
  // тех, у кого триал заканчивается.
  await scheduleTrialNotices();
  console.log('напоминания о конце триала: проверка каждый час');

  await schedulePurge();
  const { CONVERSATION_DAYS, CANCELED_DAYS } = await import('../billing/retention.js');
  console.log(`сроки хранения: переписки ${CONVERSATION_DAYS} дн., ` +
              `данные отменивших ${CANCELED_DAYS} дн.`);

  await schedulePromoScrapes();
}

/**
 * Расписание скрейпа акций — по тенантам, у которых он настроен.
 *
 * Снятие тоже здесь: клиент убрал `promotions.scrape` из конфига, а джоб
 * остался бы в Redis и продолжал ходить на его сайт по расписанию, о котором
 * договорённости больше нет.
 */
async function schedulePromoScrapes(): Promise<void> {
  const { rows } = await withOwner((client) =>
    client.query<{ id: string; configurator: { promotions?: { scrape?: { everyHours?: number } } } }>(
      `SELECT id, configurator FROM tenants
        WHERE status = 'active' AND configurator <> '{}'::jsonb`,
    ),
  );

  let scheduled = 0;
  for (const t of rows) {
    const hours = t.configurator?.promotions?.scrape?.everyHours;
    if (typeof hours === 'number') {
      await schedulePromoScrape(t.id, hours);
      scheduled += 1;
    } else {
      await unschedulePromoScrape(t.id);
    }
  }
  console.log(`скрейп акций настроен у ${scheduled} из ${rows.length} тенант(ов) с конфигуратором`);
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

const trialWorker = new Worker(
  'trial-notices',
  async () => {
    const { sendTrialNotices } = await import('../notify/trial.js');
    const n = await sendTrialNotices();
    if (n > 0) console.log(`напоминаний о триале отправлено: ${n}`);
    return n;
  },
  { connection: redis, concurrency: 1 },
);
trialWorker.on('failed', (job, err) => console.error('trial notices failed', job?.id, err));

/**
 * Скрейп акций. Одна попытка, а не три: сайт клиента либо отвечает, либо нет,
 * и повторять запрос к модели за деньги ради того же ответа незачем —
 * следующий проход всё равно через шесть часов.
 */
const promoWorker = new Worker<PromoScrapeJob>(
  'promo-scrape',
  async (job) => {
    const { runPromoScrape } = await import('../../products/configurator/promo/run.js');
    const r = await runPromoScrape(job.data.tenantId);
    if (r.failed) console.error(`акции ${job.data.tenantId}: ${r.failed}`);
    else if (r.created > 0 || r.expired > 0) {
      console.log(`акции ${job.data.tenantId}: новых ${r.created}, погашено ${r.expired}`);
    }
    return r;
  },
  { connection: redis, concurrency: 2 },
);
promoWorker.on('failed', (job, err) => console.error('promo scrape failed', job?.id, err));

const purgeWorker = new Worker(
  'retention-purge',
  async () => {
    const { purge } = await import('../billing/retention.js');
    const r = await purge();
    if (r.conversations > 0 || r.leads > 0 || r.tenants > 0 || r.offerFiles > 0) {
      console.log(
        `уборка: переписок ${r.conversations}, заявок ${r.leads}, ` +
        `файлов ${r.offerFiles}, клиентов ${r.tenants}`,
      );
    }
    return r;
  },
  { connection: redis, concurrency: 1 },
);
purgeWorker.on('failed', (job, err) => console.error('retention purge failed', job?.id, err));

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
  await trialWorker.close();
  await purgeWorker.close();
  await promoWorker.close();
  await driveQueue.close();
  await recheckQueue.close();
  await notifyQueue.close();
  await trialQueue.close();
  await purgeQueue.close();
  await promoQueue.close();
  await redis.quit();
  await pool.end();
  await closeOwnerPool();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.log('ingest worker started');
