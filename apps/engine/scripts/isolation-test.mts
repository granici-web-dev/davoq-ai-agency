/**
 * Проверка изоляции клиентов.
 *
 * Утверждение, которое здесь доказывается: запрос одного клиента физически
 * не может достать документы другого. Не «мы стараемся фильтровать», а именно
 * физически — политики RLS применяются самой базой к роли приложения, которая
 * не имеет права их обходить.
 *
 * Тест намеренно пробует смошенничать: ходит в базу под контекстом одного
 * тенанта и просит данные другого, явно указывая чужой tenant_id. Правильный
 * результат — ноль строк, а не ошибка доступа: политика не запрещает запрос,
 * она делает чужие строки невидимыми.
 *
 *   npm run test:isolation
 */
import '../src/engine/env.js';
import { closeOwnerPool, pool, withOwner, withTenant } from '../src/engine/db/pool.js';
import { retrieve } from '../src/engine/rag/retrieve.js';

const TABLES = [
  'chunks', 'documents', 'conversations', 'messages', 'leads',
  'approved_answers', 'unanswered_log', 'usage_daily', 'widget_configs',
  'connectors', 'connector_tools', 'audit_log',
];

let failures = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => {
  console.error(`  ✗ ${m}`);
  failures++;
};

// Список тенантов читается правами владельца: под рабочей ролью его и не видно,
// что само по себе хороший знак — но тесту нужно знать, кого с кем сравнивать.
const { rows: tenants } = await withOwner((client) =>
  client.query<{ id: string; name: string }>(`SELECT id, name FROM tenants ORDER BY created_at`),
);
if (tenants.length < 2) {
  console.error('нужно минимум два тенанта, иначе проверять нечего');
  await pool.end();
  process.exit(1);
}
const [a, b] = [tenants[0]!, tenants[1]!];
console.log(`изоляция: «${a.name}» против «${b.name}»\n`);

// 0. Роль приложения не должна иметь права обходить политики. Без этого
//    всё остальное — театр: политики есть, но не применяются.
{
  const { rows } = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean; current: string }>(
    `SELECT rolbypassrls, rolsuper, current_user AS current FROM pg_roles WHERE rolname = current_user`,
  );
  const r = rows[0]!;
  if (r.rolsuper || r.rolbypassrls) {
    bad(`роль ${r.current}: superuser=${r.rolsuper}, bypassrls=${r.rolbypassrls} — политики не применяются`);
  } else {
    ok(`роль ${r.current} не обходит RLS`);
  }
}

// 1. Каждая таблица с данными клиента — под FORCE ROW LEVEL SECURITY.
{
  const { rows } = await pool.query<{ relname: string; rls: boolean; forced: boolean }>(
    `SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS forced
       FROM pg_class WHERE relname = ANY($1)`, [TABLES],
  );
  const bad_ = rows.filter((r) => !r.rls || !r.forced);
  if (bad_.length > 0) bad(`без FORCE RLS: ${bad_.map((r) => r.relname).join(', ')}`);
  else ok(`${rows.length} таблиц под FORCE ROW LEVEL SECURITY`);
}

// 2. Прямая попытка достать чужие строки, зная чужой tenant_id.
await withTenant(a.id, async (client) => {
  for (const table of TABLES) {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE tenant_id = $1`, [b.id],
    );
    if (Number(rows[0]!.n) !== 0) bad(`${table}: из контекста «${a.name}» видно ${rows[0]!.n} строк «${b.name}»`);
  }
  ok(`явный запрос чужого tenant_id: ноль строк во всех ${TABLES.length} таблицах`);

  // 3. Попытка обойти фильтр целиком — без WHERE. Видно должно быть только своё.
  const { rows: leak } = await client.query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM chunks`,
  );
  const foreign = leak.filter((r) => r.tenant_id !== a.id);
  if (foreign.length > 0) bad(`chunks без WHERE: видны чужие тенанты (${foreign.length})`);
  else ok('запрос без фильтра возвращает только свои фрагменты');

  // 4. Попытка записать строку с чужим tenant_id — политика WITH CHECK.
  try {
    await client.query(
      `INSERT INTO unanswered_log (tenant_id, question, reason) VALUES ($1, $2, 'low_confidence')`,
      [b.id, 'попытка записи в чужого тенанта'],
    );
    bad('удалось записать строку с чужим tenant_id — политика WITH CHECK не работает');
  } catch {
    ok('запись с чужим tenant_id отклонена базой');
  }
});

// 5. Поиск по смыслу: тот же вопрос из двух контекстов не должен пересекаться.
{
  const question = 'garanție canapea livrare';
  const hitsA = await withTenant(a.id, (c) => retrieve(c, a.id, question));
  const hitsB = await withTenant(b.id, (c) => retrieve(c, b.id, question));
  const idsB = new Set(hitsB.map((h) => h.id));
  const shared = hitsA.filter((h) => idsB.has(h.id));
  if (shared.length > 0) bad(`поиск вернул ${shared.length} общих фрагментов`);
  else ok(`поиск: «${a.name}» — ${hitsA.length} фрагментов, «${b.name}» — ${hitsB.length}, пересечений нет`);

  // Подмена: ходим в контексте B, но просим искать по идентификатору A.
  const spoofed = await withTenant(b.id, (c) => retrieve(c, a.id, question));
  if (spoofed.length > 0) bad(`подстановка чужого tenantId в поиск вернула ${spoofed.length} фрагментов`);
  else ok('подстановка чужого идентификатора в поиск не возвращает ничего');
}

console.log(failures === 0 ? '\nИЗОЛЯЦИЯ OK' : `\nИЗОЛЯЦИЯ НАРУШЕНА: ${failures}`);
await pool.end();
await closeOwnerPool();
process.exit(failures === 0 ? 0 : 1);
