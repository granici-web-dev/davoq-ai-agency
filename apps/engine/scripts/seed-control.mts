/**
 * Заготовка корпуса для контрольного набора.
 *
 * Набор — проверка ДВИЖКА, а не знаний конкретного мебельщика: находит ли
 * поиск, не течёт ли промпт, не выдумывается ли цена, доезжает ли заявка.
 * Но проверять это можно только против базы, в которой что-то проиндексировано,
 * и до сих пор такой базой была ровно одна — с материалами пилота. То есть
 * набор не запускался нигде, кроме одной машины, и тащил за собой чужие данные.
 *
 * Здесь заводится вымышленный клиент «Etalon Mobilă» (clients/control) и
 * индексируются его материалы. Факты в них те же, что у пилота, по смыслу
 * и по числам, поэтому один и тот же набор случаев проходит против обоих.
 *
 *   npm run seed:control          — завести и проиндексировать
 *   npm run seed:control -- --yes — то же против неместной базы
 *
 * Повторный запуск переиндексирует с нуля: старые документы заготовки
 * удаляются, чужие — нет.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import '../src/engine/env.js';
import { closeOwnerPool, pool, withOwner, withTenant } from '../src/engine/db/pool.js';
import { ingestNow } from '../src/engine/ingest/index.js';
import { applyClientConfig } from '../src/platform/onboarding/apply.js';
import { clientDir, loadClientConfig } from '../src/platform/onboarding/config.js';

const CLIENT_ID = 'control';

/**
 * Заготовка создаёт тенанта и пишет в него. Против боевой базы это не
 * катастрофа — чужих тенантов она не трогает, — но и не то, что делают
 * случайно. Поэтому неместный адрес требует сказать это вслух.
 */
const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
})();
const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!local && !process.argv.includes('--yes')) {
  console.error(
    `seed:control: база не местная (${host || 'адрес не разобран'}).\n` +
    'Заготовка заведёт в ней тенанта «Etalon Mobilă» и проиндексирует его материалы.\n' +
    'Если это то, что нужно: npm run seed:control -- --yes',
  );
  process.exit(2);
}

const cfg = loadClientConfig(CLIENT_ID);
const applied = await applyClientConfig(cfg, { dryRun: false, force: true });
const tenantId = applied.tenantId;
console.log(
  `тенант «${cfg.name}» ${applied.created ? 'создан' : 'на месте'} · ${tenantId}`,
);

// Переиндексация с нуля: без этого повторный запуск накапливал бы копии
// тех же файлов, а расхождение с папкой заметить было бы нечем.
const dropped = await withTenant(tenantId, async (client) => {
  const { rowCount } = await client.query('DELETE FROM documents WHERE tenant_id = $1', [tenantId]);
  return rowCount ?? 0;
});
if (dropped > 0) console.log(`  прежних документов удалено: ${dropped}`);

const dir = join(clientDir(CLIENT_ID), 'knowledge');
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
if (files.length === 0) throw new Error(`в ${dir} нет ни одного .md`);

for (const filename of files) {
  await ingestNow(tenantId, {
    filename,
    mime: 'text/markdown',
    bytes: readFileSync(join(dir, filename)),
  });
  console.log(`  ✓ ${filename}`);
}

const counts = await withOwner(async (client) => {
  const { rows } = await client.query<{ docs: string; chunks: string }>(
    `SELECT (SELECT count(*) FROM documents WHERE tenant_id = $1) AS docs,
            (SELECT count(*) FROM chunks    WHERE tenant_id = $1) AS chunks`,
    [tenantId],
  );
  return rows[0]!;
});

console.log(
  `\nзаготовка готова: ${counts.docs} документа, ${counts.chunks} фрагментов\n` +
  'дальше: npm run test:control\n',
);

await pool.end();
await closeOwnerPool();
