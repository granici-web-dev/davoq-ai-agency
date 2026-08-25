#!/usr/bin/env node
/**
 * Замер под нагрузкой.
 *
 *   node scripts/load-test.mjs
 *   STEPS=1,4,8,16,32 PER_STEP=16 node scripts/load-test.mjs
 *
 * Что здесь меряется и, главное, что НЕ меряется.
 *
 * Меряется: как ведут себя наши потолки, пул соединений и обработка ошибок,
 * когда запросов больше, чем один. Где система начинает отказывать и КАК она
 * отказывает — честным 503 или обрывом на середине ответа.
 *
 * НЕ меряется: сколько посетителей выдержит боевой сервер. Ответ бота — это
 * ожидание Bedrock, а не работа нашего процесса, поэтому цифры задержки здесь
 * скажут больше о нагрузке на аккаунт Bedrock, чем о железе. Переносить их
 * на Hetzner нельзя, и делать вид, что можно, — хуже, чем не мерить вовсе.
 *
 * Каждое сообщение — настоящий вызов модели, то есть настоящие деньги.
 * Расход печатается в конце.
 *
 * Работает на отдельном временном клиенте и убирает его за собой: гонять
 * нагрузку по данным SofaBelle означало бы засорить им панель и статистику.
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

process.loadEnvFile();

const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3779}`;
const STEPS = (process.env.STEPS ?? '1,4,8,12,16,24,32').split(',').map(Number);
const PER_STEP = Number(process.env.PER_STEP ?? 16);
const PROBE = '__load_probe__';

/** Вопросы разные: одинаковый вопрос мерил бы кеш, а не работу. */
const QUESTIONS = [
  'Ce garanție oferiți pentru canapele?',
  'Cât durează livrarea în București?',
  'Puteți face o canapea la comandă pe dimensiunile mele?',
  'Ce materiale folosiți pentru tapițerie?',
  'Aveți showroom unde pot vedea produsele?',
  'Care este prețul pentru o canapea de colț?',
  'Se poate returna produsul dacă nu îmi place?',
  'Cât costă transportul în afara orașului?',
];

const MATERIAL = `
Garanție. Toate produsele au garanție standard de 3 ani pentru structură
și 2 ani pentru mecanisme. Durata medie de utilizare este de 15 ani.

Livrare. În București livrarea durează 1-2 săptămâni dacă produsul este în stoc.
Pentru comenzi personalizate termenul este de 4-6 săptămâni. Transportul în oraș
este inclus în preț.

Comenzi personalizate. Realizăm canapele pe dimensiunile clientului. Prețul
depinde de dimensiuni, materialul de tapițerie și mecanismul ales.

Materiale. Folosim țesături rezistente la uzură, piele naturală și piele
ecologică. Structura este din lemn masiv de fag.

Showroom. Avem showroom în București și în Brașov. Programul este de luni
până sâmbătă.

Retur. Produsele standard pot fi returnate în 14 zile. Comenzile personalizate
nu se pot returna, pentru că sunt realizate pe dimensiunile clientului.
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

// ── Временный клиент ──────────────────────────────────────────────────────
async function ensureProbe() {
  const existing = await client.query(
    'SELECT id, public_key FROM tenants WHERE name = $1', [PROBE],
  );
  if (existing.rows[0]) {
    const chunks = await client.query(
      'SELECT count(*)::int n FROM chunks WHERE tenant_id = $1', [existing.rows[0].id],
    );
    if (chunks.rows[0].n > 0) return existing.rows[0];
    await client.query('DELETE FROM tenants WHERE id = $1', [existing.rows[0].id]);
  }

  const pk = `pk_load_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const { rows } = await client.query(
    `INSERT INTO tenants (name, client_id, allowed_domains, locale_default, supported_locales,
                          public_key, vertical, plan, status)
     VALUES ($1, $1, ARRAY['localhost'], 'ro', ARRAY['ro'], $2, 'furniture', 'business', 'active')
     RETURNING id, public_key`, [PROBE, pk],
  );
  await client.query(
    `INSERT INTO widget_configs (tenant_id, bot_name) VALUES ($1, 'Proba')`, [rows[0].id],
  );

  process.stdout.write('индексирую материал для пробного клиента... ');
  const { ingestNow } = await import('../src/engine/ingest/index.js');
  await ingestNow(rows[0].id, {
    filename: 'material.md',
    mime: 'text/markdown',
    bytes: Buffer.from(MATERIAL, 'utf8'),
  });
  const n = await client.query(
    'SELECT count(*)::int n FROM chunks WHERE tenant_id = $1', [rows[0].id],
  );
  console.log(`${n.rows[0].n} фрагментов`);
  return rows[0];
}

// ── Один разговор ─────────────────────────────────────────────────────────
async function ask(pk, question, i) {
  const started = performance.now();
  let firstByte = null;
  let chars = 0;

  try {
    const res = await fetch(`${BASE}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://localhost' },
      body: JSON.stringify({ publicKey: pk, visitorId: `load-${i}`, message: question }),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 503) {
      // Наш потолок и квота Bedrock оба отвечают 503, но означают разное:
      // первый лечится подъёмом потолка, вторая — заявкой в Service Quotas.
      const body = await res.json().catch(() => ({}));
      const reason = body.reason === 'upstream' ? 'busy_upstream' : 'busy_ours';
      return { kind: reason, total: performance.now() - started };
    }
    if (!res.ok || !res.body) {
      await res.text().catch(() => '');
      return { kind: `http_${res.status}`, total: performance.now() - started };
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let sawError = false;
    let midFlightBusy = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Первый кусок текста — это момент, когда посетитель видит, что бот
      // начал отвечать. Всё, что до него, он проводит, глядя на «Печатает…».
      if (firstByte === null && value.includes('event: delta')) {
        firstByte = performance.now() - started;
      }
      if (value.includes('event: error')) {
        sawError = true;
        // Отказ по частоте на середине ответа — та же занятость, просто
        // заголовки уже ушли и кода состояния не поменять.
        if (value.includes('"busy"')) midFlightBusy = true;
      }
      chars += value.length;
    }
    const total = performance.now() - started;
    if (midFlightBusy) return { kind: 'busy_upstream', total, firstByte };
    if (sawError) return { kind: 'stream_error', total, firstByte };
    if (firstByte === null) return { kind: 'no_text', total };
    return { kind: 'ok', total, firstByte, chars };
  } catch (err) {
    return { kind: `fail:${String(err.message).slice(0, 40)}`, total: performance.now() - started };
  }
}

const pct = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const ms = (v) => (v === null ? '   —' : `${(v / 1000).toFixed(1)} с`);

/** Сколько соединений с базой занято прямо сейчас. */
async function poolInUse() {
  const { rows } = await client.query(
    `SELECT count(*)::int n FROM pg_stat_activity
      WHERE datname = current_database() AND usename = 'assistwidget_app' AND state <> 'idle'`,
  );
  return rows[0].n;
}

// ── Прогон ────────────────────────────────────────────────────────────────
const probe = await ensureProbe();
console.log(`\nзамер: ${BASE}, ступени ${STEPS.join(', ')}, по ${PER_STEP} запросов\n`);
console.log('одновр.  запросов   ответили  потолок/  ошибок   до первых знаков      весь ответ   пул');
console.log('                                 квота');
console.log('──────────────────────────────────────────────────────────────────────────────────────');

const totals = { requests: 0, ok: 0, busy: 0, errors: 0, chars: 0 };
const rows = [];

for (const concurrency of STEPS) {
  const results = [];
  let peakPool = 0;
  let index = 0;

  const watcher = setInterval(async () => {
    try { peakPool = Math.max(peakPool, await poolInUse()); } catch { /* не важно */ }
  }, 200);

  const worker = async () => {
    while (index < PER_STEP) {
      const i = index++;
      results.push(await ask(probe.public_key, QUESTIONS[i % QUESTIONS.length], i));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  clearInterval(watcher);

  const ok = results.filter((r) => r.kind === 'ok');
  const busyOurs = results.filter((r) => r.kind === 'busy_ours');
  const busyUp = results.filter((r) => r.kind === 'busy_upstream');
  const busy = [...busyOurs, ...busyUp];
  const errors = results.filter((r) => !r.kind.startsWith('busy') && r.kind !== 'ok');

  totals.requests += results.length;
  totals.ok += ok.length;
  totals.busy += busy.length;
  totals.errors += errors.length;
  totals.chars += ok.reduce((a, r) => a + r.chars, 0);

  const ttfb = ok.map((r) => r.firstByte);
  const full = ok.map((r) => r.total);
  rows.push({ concurrency, ok: ok.length, busyOurs: busyOurs.length,
              busyUp: busyUp.length, errors, peakPool });

  console.log(
    `${String(concurrency).padStart(5)}  ${String(results.length).padStart(9)}` +
    `${String(ok.length).padStart(11)}` +
    `${`${busyOurs.length}/${busyUp.length}`.padStart(9)}` +
    `${String(errors.length).padStart(9)}` +
    `     p50 ${ms(pct(ttfb, 50))}  p95 ${ms(pct(ttfb, 95))}` +
    `   p50 ${ms(pct(full, 50))}  p95 ${ms(pct(full, 95))}` +
    `${String(peakPool).padStart(6)}`,
  );

  if (errors.length > 0) {
    const kinds = {};
    for (const e of errors) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    for (const [k, n] of Object.entries(kinds)) console.log(`         ↳ ${n}× ${k}`);
  }
}

// ── Итог ──────────────────────────────────────────────────────────────────
console.log('\n── итог ──');
const ours = rows.reduce((a, r) => a + r.busyOurs, 0);
const upstream = rows.reduce((a, r) => a + r.busyUp, 0);
console.log(`запросов ${totals.requests}, ответили ${totals.ok}, ошибок ${totals.errors}`);
console.log(`отказано по занятости: нашим потолком ${ours}, квотой модели ${upstream}`);

const usage = await client.query(
  `SELECT coalesce(sum(tokens_in),0)::int i, coalesce(sum(tokens_out),0)::int o
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE c.tenant_id = $1`, [probe.id],
);
const { i: tokIn, o: tokOut } = usage.rows[0];
// Haiku 4.5 на Bedrock: $1 за миллион входных, $5 за миллион выходных.
const cost = (tokIn / 1e6) * 1 + (tokOut / 1e6) * 5;
console.log(`токенов: вход ${tokIn}, выход ${tokOut} · ориентировочно $${cost.toFixed(3)}`);

if (totals.errors > 0) {
  console.log('\nОШИБКИ ЕСТЬ. Отказ по занятости (503) — это работающий потолок,');
  console.log('а всё остальное здесь — то, чего быть не должно.');
}

// Убираем за собой: разговоры пробного клиента не должны копиться в базе.
await client.query('DELETE FROM tenants WHERE id = $1', [probe.id]);
console.log('пробный клиент удалён');
await client.end();
process.exit(totals.errors > 0 ? 1 : 0);
