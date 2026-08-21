import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export interface IngestJob {
  tenantId: string;
  documentId: string;
}

// BullMQ требует maxRetriesPerRequest: null — иначе блокирующие команды воркера
// обрываются по таймауту ioredis и задания зависают в состоянии active.
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const ingestQueue = new Queue<IngestJob>('ingest', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    // Разбор падает либо мгновенно и навсегда (битый файл), либо от временной
    // неполадки — эмбеддинги, сеть. Выдержка растёт, чтобы не долбить провайдера.
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export interface DriveSyncJob {
  tenantId: string;
}

/**
 * Регулярная сверка папок Google Drive. Отдельная очередь от разбора документов:
 * у них разная частота и разная цена сбоя — упавшая сверка повторится через
 * четверть часа, упавший разбор файла нужно чинить руками.
 */
export const driveQueue = new Queue<DriveSyncJob>('drive-sync', {
  connection: redis,
  defaultJobOptions: { attempts: 2, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
});

export const DRIVE_SYNC_MINUTES = Number(process.env.DRIVE_SYNC_MINUTES ?? 15);

/**
 * Ключ повторения — tenantId: повторный вызов при старте воркера обновляет
 * существующее расписание, а не заводит второе.
 */
export async function scheduleDriveSync(tenantId: string): Promise<void> {
  await driveQueue.add('sync', { tenantId }, {
    repeat: { every: DRIVE_SYNC_MINUTES * 60_000 },
    jobId: `drive-${tenantId}`,
  });
}

export const enqueueDriveSyncNow = (tenantId: string): Promise<unknown> =>
  driveQueue.add('sync', { tenantId });

export interface RecheckJob {
  tenantId: string;
  /**
   * Перепроверять и закрытые вопросы. Нужно после удаления материала: файл,
   * которым вопрос был закрыт, мог только что исчезнуть из папки, и тогда
   * вопрос обязан вернуться в список — иначе дыра есть, а в списке её нет.
   */
  includeResolved?: boolean;
}

/**
 * Автопроверка чек-листа после появления новых материалов. Отдельная очередь,
 * потому что запускать её нужно один раз на пачку файлов, а не на каждый файл.
 */
export const recheckQueue = new Queue<RecheckJob>('recheck', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    // Задание должно исчезать сразу: пока оно лежит завершённым, повторная
    // постановка с тем же id молча игнорируется, и следующая пачка файлов
    // осталась бы непроверенной.
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  },
});

/** Пауза после индексации: пачка из десяти файлов должна дать один прогон, а не десять. */
const RECHECK_DELAY_MS = Number(process.env.RECHECK_DELAY_MS ?? 45_000);

/**
 * Постановка идемпотентна по тенанту: пока задание ждёт своей паузы, каждый
 * следующий доиндексированный файл попадает в тот же прогон.
 *
 * Полный прогон живёт под собственным id: иначе после удаления файла заявка
 * на него слилась бы с уже ждущим обычным прогоном и флаг потерялся бы —
 * закрытые вопросы никто бы не перепроверил.
 */
export async function enqueueRecheck(
  tenantId: string,
  { includeResolved = false }: { includeResolved?: boolean } = {},
): Promise<void> {
  const jobId = includeResolved ? `recheck-full-${tenantId}` : `recheck-${tenantId}`;

  // Полный прогон покрывает обычный целиком. Поэтому ждущий обычный снимается,
  // когда приходит полный, а обычный поверх ждущего полного не ставится вовсе:
  // иначе одни и те же сорок вопросов уходят в модель дважды подряд.
  const pendingFull = await recheckQueue.getJob(`recheck-full-${tenantId}`);
  const fullIsWaiting = pendingFull !== undefined && (await pendingFull.getState()) === 'delayed';
  if (!includeResolved && fullIsWaiting) return;

  if (includeResolved) {
    const pending = await recheckQueue.getJob(`recheck-${tenantId}`);
    if (pending && (await pending.getState()) === 'delayed') await pending.remove();
  }

  await recheckQueue.add('recheck', { tenantId, includeResolved }, {
    jobId,
    delay: RECHECK_DELAY_MS,
  });
}

export interface NotifyJob {
  tenantId: string;
  conversationId: string;
}

/**
 * Уведомления о заявках. Отдельная очередь от индексации: письмо должно уйти
 * через две минуты, а не встать в хвост за разбором пятидесятимегабайтного PDF.
 *
 * Попыток пять с растущей выдержкой — почтовый сервер бывает недоступен
 * несколько минут, и терять из-за этого заявку нельзя.
 */
export const notifyQueue = new Queue<NotifyJob>('lead-notify', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

/**
 * Пауза перед отправкой. Посетитель даёт телефон и продолжает разговор: метраж,
 * обивка, город приходят следующими репликами и дополняют ту же заявку. Письмо,
 * отправленное в ту же секунду, содержало бы один телефон — а смысл в том, чтобы
 * продавец звонил, уже зная, что считать.
 *
 * Две минуты — размен: столько заявка «стынет», зато письмо приходит заполненным.
 * На фоне ночной заявки, которую иначе увидели бы в обед, это ничто.
 */
const LEAD_NOTIFY_DELAY_MS = Number(process.env.LEAD_NOTIFY_DELAY_MS ?? 120_000);

/**
 * Ключ — разговор: сколько бы раз модель ни дополнила заявку, письмо одно.
 * Повторная постановка при уже ждущем или выполненном задании игнорируется
 * самим BullMQ, и это ровно нужное поведение.
 *
 * Исключение — задание, окончательно упавшее: почта могла лежать полчаса.
 * Такое снимаем, чтобы следующая реплика посетителя дала новую попытку,
 * а заявка не осталась в базе никем не увиденной.
 */
export async function enqueueLeadNotify(
  job: NotifyJob,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const jobId = `lead-${job.conversationId}`;
  const existing = await notifyQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    // Ещё не отправленное задание прочитает заявку заново в момент отправки —
    // оно и так увидит исправление. Пересоздавать его значит сдвинуть паузу
    // и отправить письмо позже без всякой пользы.
    if (state === 'delayed' || state === 'waiting' || state === 'active') return;
    // `force` — исправленный контакт: письмо уже ушло со старым номером,
    // и второе, помеченное как исправление, обязано уйти.
    if (state !== 'failed' && !force) return;
    await existing.remove();
  }
  await notifyQueue.add('notify', job, { jobId, delay: LEAD_NOTIFY_DELAY_MS });
}

/**
 * jobId равен id документа — это делает постановку идемпотентной: двойной клик
 * в админке не запустит два разбора. Обратная сторона в том, что BullMQ откажется
 * добавить задание с уже известным id, поэтому для повторной попытки старое
 * задание сначала удаляется.
 */
export async function enqueueIngest(job: IngestJob): Promise<void> {
  const existing = await ingestQueue.getJob(job.documentId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active' || state === 'waiting' || state === 'delayed') return;
    await existing.remove();
  }
  await ingestQueue.add('ingest', job, { jobId: job.documentId });
}

/**
 * Напоминания о конце пробного периода.
 *
 * Раз в час, а не раз в сутки: клиент, у которого триал кончается сегодня,
 * должен узнать об этом сегодня, а не завтра. Отметка о последней отправленной
 * ступени лежит в базе, поэтому частый проход не превращается в частые письма.
 *
 * jobId постоянный: повторный запуск воркера обновляет расписание,
 * а не заводит второе.
 */
export const trialQueue = new Queue('trial-notices', { connection: redis });

export const TRIAL_CHECK_MINUTES = Number(process.env.TRIAL_CHECK_MINUTES ?? 60);

export async function scheduleTrialNotices(): Promise<void> {
  await trialQueue.add('check', {}, {
    repeat: { every: TRIAL_CHECK_MINUTES * 60_000 },
    jobId: 'trial-notices',
    removeOnComplete: true,
  });
}

/**
 * Уборка по срокам хранения. Раз в сутки: сроки считаются днями, и проверять
 * их чаще незачем — а вот пропустить сутки при перезапуске нельзя, поэтому
 * расписание повторяемое, а не «в три часа ночи».
 */
export const purgeQueue = new Queue('retention-purge', { connection: redis });

export async function schedulePurge(): Promise<void> {
  await purgeQueue.add('purge', {}, {
    repeat: { every: 24 * 60 * 60_000 },
    jobId: 'retention-purge',
    removeOnComplete: true,
  });
}
