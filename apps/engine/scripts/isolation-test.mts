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
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeOwnerPool, pool, withOwner, withTenant } from '../src/engine/db/pool.js';
import { retrieve } from '../src/engine/rag/retrieve.js';

const TABLES = [
  'chunks', 'documents', 'conversations', 'messages', 'leads',
  'approved_answers', 'unanswered_log', 'usage_daily', 'widget_configs',
  'connectors', 'connector_tools', 'audit_log', 'offers',
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

// Второго тенанта заводим сами, если его нет. Проверка изоляции, которая
// требует ручной подготовки, не запускается — а значит не защищает.
let temporary: string | null = null;
if (tenants.length < 2) {
  const created = await withOwner(async (client) => {
    const { rows } = await client.query<{ id: string; name: string }>(
      `INSERT INTO tenants (name, allowed_domains, locale_default, public_key, status)
       VALUES ('__isolation_probe__', ARRAY['probe.invalid'], 'en',
               'pk_probe_' || substr(md5(random()::text), 1, 22), 'suspended')
       RETURNING id, name`,
    );
    const probe = rows[0]!;
    // Кладём пробнику собственный фрагмент: без своих строк «чужого не видно»
    // доказывается тривиально и ничего не значит.
    await client.query(
      `INSERT INTO chunks (tenant_id, document_id, seq, content, embedding_model)
       SELECT $1, d.id, 0, 'фрагмент тенанта-пробника', 'probe'
         FROM documents d LIMIT 1`,
      [probe.id],
    ).catch(() => undefined);
    return probe;
  });
  tenants.push(created);
  temporary = created.id;
  console.log('(заведён временный тенант-пробник)');
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

// 6. Вход. Изоляция данных не спасает, если сессия ведёт не к тому клиенту.
//
// Почта уникальна на всю платформу. Команда create-user на второго клиента
// с уже занятой почтой раньше меняла пароль, не трогая tenant_id: тот, кто
// просил доступ ко второму клиенту, получал рабочий вход в первый — со всеми
// его переписками, заявками и выгрузкой. Все проверки выше при этом проходили:
// контекст был выставлен верно, просто не на того.
{
  const email = `probe-${randomUUID().slice(0, 8)}@isolation.invalid`;
  const cli = (tenantId: string): { code: number; err: string } => {
    const r = spawnSync('npx', ['tsx', '--env-file=.env', 'src/platform/cli/admin.ts',
      'create-user', tenantId, email, 'parola-de-proba-123'], { encoding: 'utf8' });
    return { code: r.status ?? -1, err: `${r.stdout}${r.stderr}` };
  };

  const first = cli(a.id);
  if (first.code !== 0) bad(`не удалось завести пользователя первому клиенту: ${first.err.slice(0, 200)}`);
  else {
    const second = cli(b.id);
    if (second.code === 0) bad('та же почта завелась второму клиенту — вход ведёт в чужой кабинет');
    else if (!/уже занята/.test(second.err)) bad(`отказ есть, но не по той причине: ${second.err.slice(0, 200)}`);
    else ok('почта, занятая другим клиентом, не переезжает: отказ с объяснением');

    const { rows } = await withOwner((client) => client.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM admin_users WHERE lower(email) = lower($1)', [email]));
    if (rows[0]?.tenant_id !== a.id) bad('запись всё-таки сменила владельца');
    else ok('владелец записи не изменился');

    await withOwner((client) => client.query('DELETE FROM admin_users WHERE lower(email) = lower($1)', [email]));
  }
}

// 7. Уникальность заявки на разговор — внутри клиента, а не на всю платформу.
{
  const { rows } = await withOwner((client) => client.query<{ def: string }>(
    "SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'leads_one_per_conversation'"));
  const def = rows[0]?.def ?? '';
  if (/\(tenant_id, conversation_id\)/.test(def)) ok('ключ заявки составной: столкнуть клиентов через чужой UUID нельзя');
  else bad(`ключ заявки не тенантный: ${def || 'индекса нет'}`);
}

if (temporary) {
  await withOwner((client) => client.query('DELETE FROM tenants WHERE id = $1', [temporary]));
}

console.log(failures === 0 ? '\nИЗОЛЯЦИЯ OK' : `\nИЗОЛЯЦИЯ НАРУШЕНА: ${failures}`);
await pool.end();
await closeOwnerPool();
process.exit(failures === 0 ? 0 : 1);
