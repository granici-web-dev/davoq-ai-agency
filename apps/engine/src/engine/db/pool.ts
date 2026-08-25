import pg from 'pg';

const { Pool } = pg;

/**
 * Рабочий пул приложения. Подключается ролью `assistwidget_app`
 * (NOSUPERUSER, NOBYPASSRLS) — именно поэтому политики RLS вообще
 * что-то значат. Владелец базы superuser и обходит даже FORCE RLS,
 * то есть под ним изоляция тенантов существует только на бумаге.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),

  // Ожидание соединения обязано кончаться. Без этого исчерпанный пул не даёт
  // отказа — он даёт зависание: запрос стоит в очереди столько, сколько
  // потребуется, посетитель смотрит на «Печатает…», а панель клиента не
  // открывается вовсе. Отказ за пять секунд честнее бесконечного ожидания.
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5_000),
  idleTimeoutMillis: 30_000,

  // Потолок на один запрос. Ошибка в условии или блокировка иначе держат
  // соединение до перезапуска процесса — и уносят с собой остальные девятнадцать.
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
});

// Соединение, умершее в простое (перезапуск базы, обрыв сети), иначе валит
// процесс необработанной ошибкой: у pg это событие пула, а не запроса.
pool.on('error', (err) => {
  console.error('pool: соединение в простое умерло —', err.message);
});

/**
 * Пул владельца. Нужен ровно для двух вещей, которые по определению
 * происходят вне тенантного контекста: миграции и заведение тенанта.
 * Всё остальное обязано ходить через `pool` — иначе смысл разделения
 * теряется на первом же удобном случае.
 *
 * Отдельная переменная окружения, а не флаг: адрес с правами владельца
 * не должен случайно оказаться в конфигурации веб-процесса.
 */
let owner: pg.Pool | null = null;
const ownerPool = (): pg.Pool => {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error(
      'DATABASE_ADMIN_URL не задан — заведение тенантов и миграции требуют прав владельца базы',
    );
  }
  owner ??= new Pool({ connectionString: url, max: 4 });
  return owner;
};

/**
 * Провизионирование: создание тенанта и миграции. Ходит под владельцем,
 * то есть RLS здесь не применяется. Пользовательский ввод сюда попадать
 * не должен — вызывается из CLI и онбординга, не из веб-обработчиков.
 */
export async function withOwner<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await ownerPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export const closeOwnerPool = async (): Promise<void> => {
  if (owner) await owner.end();
  owner = null;
};

/**
 * Выполняет работу в тенантном контексте.
 *
 * Два обязательных условия, каждое из которых при нарушении даёт утечку между тенантами:
 *
 * 1. `set_config(..., is_local => true)` вместо `SET`. Соединения берутся из пула и
 *    переиспользуются: обычный `SET` пережил бы запрос и достался следующему клиенту
 *    вместе с чужим tenant_id. Локальная установка откатывается вместе с транзакцией.
 * 2. Приложение подключается ролью `assistwidget_app` (NOSUPERUSER, NOBYPASSRLS).
 *    Владелец БД — superuser и обходит даже FORCE ROW LEVEL SECURITY, то есть под ним
 *    политики не работают вовсе.
 *
 * Отсутствие tenantId — ошибка программиста, а не пустая выборка: политики при пустом
 * контексте вернут ноль строк молча, и баг уехал бы в прод незамеченным.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error('withTenant: tenantId is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Откат не должен подменить собой причину: если соединение уже мертво,
    // ROLLBACK бросит своё, и наверх уедет «connection terminated» вместо
    // настоящей ошибки — а искать будут по ней.
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Платформенный контекст: таблицы без RLS (admin_users, admin_sessions)
 * и функции SECURITY DEFINER. Ходит рабочей ролью — «платформенный»
 * здесь значит «без тенантного контекста», а не «с правами владельца».
 */
export async function withPlatform<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
