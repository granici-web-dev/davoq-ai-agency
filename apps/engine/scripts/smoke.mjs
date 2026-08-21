#!/usr/bin/env node
/**
 * Smoke-тест: живой диалог через настоящий HTTP-эндпоинт, от приветствия
 * до переданной заявки.
 *
 * Гоняется после каждого шага рефакторинга. Проверяет не «код компилируется»,
 * а то единственное, ради чего продукт существует: посетитель спросил, бот
 * ответил по материалам, собрал квалификацию и передал заявку с контактом.
 *
 *   node scripts/smoke.mjs                 # против localhost
 *   BASE=http://... node scripts/smoke.mjs
 *
 * Код возврата 0 — прошло, 1 — нет. Никаких «вроде работает».
 */
import pg from 'pg';

process.loadEnvFile();

const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3779}`;
const VISITOR = `smoke-${process.pid}`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
  return false;
};
const ok = (msg) => {
  console.log(`  ✓ ${msg}`);
  return true;
};

/** Тенант берём из базы, а не из константы: тест не должен знать ни одного клиента по имени. */
async function pickTenant() {
  const { rows } = await pool.query(
    `SELECT id, name, public_key, allowed_domains, locale_default
       FROM tenants WHERE status = 'active' AND public_key IS NOT NULL
       ORDER BY created_at LIMIT 1`,
  );
  if (!rows[0]) throw new Error('нет ни одного активного тенанта с публичным ключом');
  return rows[0];
}

/** Разбор SSE: собираем текст ответа и conversationId из служебного события. */
async function say(tenant, message, conversationId) {
  const res = await fetch(`${BASE}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Origin проверяется сервером и подделать его страница не может —
      // тест обязан присылать настоящий домен тенанта.
      origin: `https://${tenant.allowed_domains[0]}`,
    },
    body: JSON.stringify({
      publicKey: tenant.public_key,
      visitorId: VISITOR,
      locale: tenant.locale_default,
      message,
      ...(conversationId ? { conversationId } : {}),
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  let text = '';
  let id = conversationId;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const event = /^event: (.+)$/m.exec(part)?.[1];
      const data = /^data: (.+)$/m.exec(part)?.[1];
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === 'meta' && payload.conversationId) id = payload.conversationId;
      if (event === 'delta' && payload.t) text += payload.t;
      if (event === 'error') throw new Error(`поток оборван: ${payload.error}`);
    }
  }
  return { text, conversationId: id };
}

const TURNS = [
  { what: 'приветствие', say: 'Bună ziua!' },
  { what: 'вопрос по материалам', say: 'Ce garanție oferiți la canapele?' },
  { what: 'квалификация', say: 'Vreau o canapea de colț de 2.80 m, țesătură gri, stau în Brașov.' },
  { what: 'передача контакта', say: 'Mă numesc Ion Test, telefonul meu este 0700 000 001.' },
];

async function main() {
  const tenant = await pickTenant();
  console.log(`smoke: ${BASE}, тенант «${tenant.name}» (${tenant.locale_default})\n`);

  // 1. Здоровье процесса
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  if (!health.ok) return fail('/health не отвечает ok');
  ok('сервер отвечает');

  // 2. Виджет отдаёт конфигурацию по публичному ключу
  const cfg = await fetch(`${BASE}/v1/widget/config?key=${tenant.public_key}`).then((r) => r.json());
  if (!cfg.botName) return fail('конфигурация виджета без имени бота');
  ok(`конфигурация виджета: «${cfg.botName}»`);

  // 3. Диалог
  let conversationId;
  for (const turn of TURNS) {
    const t0 = Date.now();
    const r = await say(tenant, turn.say, conversationId);
    conversationId = r.conversationId;
    if (!r.text.trim()) return fail(`${turn.what}: бот промолчал`);
    ok(`${turn.what} — ${r.text.trim().length} знаков за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  }
  if (!conversationId) return fail('сервер не вернул conversationId');

  // 4. Разговор сохранён
  const msgs = await pool.query(
    `SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1`, [conversationId]);
  if (msgs.rows[0].n < TURNS.length * 2) {
    return fail(`в базе ${msgs.rows[0].n} реплик, ожидалось минимум ${TURNS.length * 2}`);
  }
  ok(`переписка сохранена: ${msgs.rows[0].n} реплик`);

  // 5. Заявка передана — то, ради чего всё.
  //
  // Передача заявки — вызов инструмента моделью, то есть вероятностное действие:
  // один прогон из нескольких модель переспрашивает вместо того, чтобы передать.
  // Поэтому одна дополнительная реплика — как в настоящем разговоре — и повторная
  // проверка. Ретрай печатается заметно: если он начнёт срабатывать регулярно,
  // это регрессия промпта, а не случайность, и увидеть её надо сразу.
  const leadOf = async () => (await pool.query(
    `SELECT name, phone, email, payload, quote_completeness
       FROM leads WHERE conversation_id = $1`, [conversationId])).rows[0];

  let l = await leadOf();
  if (!l) {
    console.log('  … заявки нет после первой попытки, спрашиваем ещё раз');
    await say(tenant, 'Când mă puteți contacta pentru ofertă?', conversationId);
    l = await leadOf();
    if (l) console.log('  ! заявка передана только со второй попытки');
  }
  if (!l) return fail('заявка не создана — бот не вызвал передачу лида');
  if (!l.phone && !l.email) return fail('заявка без контакта');
  ok(`заявка: ${l.name ?? '—'} · ${l.phone ?? l.email} · полей квалификации ${l.quote_completeness}`);

  // 6. Метрики привязаны к клиенту
  const usage = await pool.query(
    `SELECT messages FROM usage_daily WHERE tenant_id = $1 AND date = current_date`,
    [tenant.id]);
  if (!usage.rows[0]) return fail('расход за сегодня не записан на тенанта');
  ok(`метрики пишутся на client_id: ${usage.rows[0].messages} сообщений сегодня`);

  return true;
}

try {
  const passed = await main();
  console.log(passed ? '\nSMOKE OK' : '\nSMOKE FAILED');
} catch (err) {
  console.error(`\n  ✗ ${err.message}`);
  console.log('\nSMOKE FAILED');
  process.exitCode = 1;
} finally {
  // Тестовые разговоры не должны копиться в панели клиента: он их увидит
  // и решит, что бот разговаривает сам с собой. KEEP=1 оставляет их,
  // когда тест упал и надо посмотреть, что именно бот сделал.
  if (process.env.KEEP) {
    console.log(`(разговор оставлен: visitor_id = ${VISITOR})`);
    await pool.end();
    process.exit(process.exitCode ?? 0);
  }
  const { rows } = await pool.query(
    `DELETE FROM conversations WHERE visitor_id = $1 RETURNING id`, [VISITOR]);
  await pool.query(`DELETE FROM leads WHERE conversation_id IS NULL AND name = 'Ion Test'`);
  if (rows.length) console.log(`(убрано тестовых разговоров: ${rows.length})`);
  await pool.end();
}
