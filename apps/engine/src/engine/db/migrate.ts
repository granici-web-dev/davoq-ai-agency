// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const dir = new URL('../../../migrations/', import.meta.url).pathname;

// Миграции идут под владельцем базы: рабочая роль намеренно не умеет
// создавать таблицы и менять схему.
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL не задан — миграции требуют прав владельца базы');
const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
const applied = new Set(rows.map((r) => r.name));

for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(name)) continue;
  process.stdout.write(`applying ${name} ... `);
  await client.query(await readFile(join(dir, name), 'utf8'));
  await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
  console.log('ok');
}

/**
 * Пароль роли приложения.
 *
 * В миграции 002 он задан как 'dev' — это нормально для разработки и никуда
 * не годится на сервере: роль `assistwidget_app` имеет доступ ко всем данным
 * всех клиентов, RLS её ограничивает только по выставленному контексту.
 * Менять пароль правкой миграции нельзя — она уже применена и второй раз
 * не выполнится.
 *
 * Поэтому отдельным шагом здесь: задана переменная — пароль ставится, не задана —
 * ничего не происходит (разработке он не нужен). Значение подставляется через
 * set_config и format(%L), а не склейкой строк: пароль приходит из окружения,
 * и склейка здесь была бы приглашением.
 */
const appPassword = process.env.APP_DB_PASSWORD;
if (appPassword) {
  await client.query('SELECT set_config($1, $2, false)', ['app.new_password', appPassword]);
  await client.query(`
    DO $$
    BEGIN
      EXECUTE format('ALTER ROLE assistwidget_app PASSWORD %L', current_setting('app.new_password'));
    END $$;
  `);
  console.log('пароль роли assistwidget_app обновлён из APP_DB_PASSWORD');
}

await client.end();
