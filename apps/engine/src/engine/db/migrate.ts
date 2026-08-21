// Первым импортом: остальные модули создают пулы и клиентов на этапе загрузки.
import '../env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const dir = new URL('../../../migrations/', import.meta.url).pathname;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
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

await client.end();
