import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Платформенный контекст: agencies, создание тенантов, служебные задачи. Без RLS. */
export async function withPlatform<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
