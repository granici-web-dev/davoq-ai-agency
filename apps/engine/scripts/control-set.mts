/**
 * Прогон контрольного набора: критерий приёмки каждого шага рефакторинга.
 *
 * Каждый вопрос задаётся боту через настоящий HTTP-эндпоинт, в отдельном
 * разговоре — иначе ответ на десятый вопрос зависит от того, что было в первом,
 * и упавшая проверка ничего не говорит о причине.
 *
 *   npm run seed:control          — завести корпус-заготовку (один раз)
 *   npm run test:control
 *   npm run test:control -- --only warranty,lead_time
 *   npm run test:control -- --tenant "Sofa Belle"   — против другого тенанта
 *
 * Код возврата 0 — прошло. Ответы упавших случаев печатаются целиком:
 * «case failed» без текста ответа не даёт понять, что чинить.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import '../src/engine/env.js';
import { closeOwnerPool, pool, withOwner } from '../src/engine/db/pool.js';

interface Case {
  id: string;
  ask: string;
  reference: string;
  expect?: string[];
  expect_all?: string[];
  forbid?: string;
  expect_lead?: { phone?: string; email?: string };
  why?: string;
}

const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3779}`;
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const only = flag('only')?.split(',') ?? null;

const spec = parse(readFileSync(new URL('../tests/control-set.yaml', import.meta.url), 'utf8')) as {
  tenant: string; locale: string; cases: Case[]; global_forbid?: string;
};

/**
 * Собственный потолок частоты. Отдельным типом, потому что это не провал
 * случая, а конец прогона: остальные вопросы упрутся в то же самое, и
 * «10/15» с пятью пустыми ответами скажет неправду о боте.
 */
class RateLimited extends Error {}

/** `(?i)` — привычная запись из других языков; в JavaScript регистр задаётся флагом. */
function forbidden(pattern: string, text: string): string | null {
  const ci = pattern.startsWith('(?i)');
  return new RegExp(ci ? pattern.slice(4) : pattern, ci ? 'i' : '').exec(text)?.[0] ?? null;
}

/** Имя из набора, если не переопределили: набор идёт против заготовки. */
const wanted = flag('tenant') ?? spec.tenant;

const tenant = await withOwner(async (client) => {
  const { rows } = await client.query<{
    id: string; name: string; public_key: string; allowed_domains: string[];
  }>('SELECT id, name, public_key, allowed_domains FROM tenants WHERE name = $1', [wanted]);
  if (rows[0]) return rows[0];

  // Отсутствие тенанта — самая частая причина, по которой набор не идёт,
  // и «не найден» о ней не говорит ничего. Печатаем то, что в базе есть,
  // и команду, которая заводит недостающее: разница между «Etalon Mobilă»
  // и «Sofa Belle» видна глазом, между «SofaBelle» и «Sofa Belle» — нет.
  const { rows: known } = await client.query<{ name: string; chunks: string }>(
    `SELECT t.name, (SELECT count(*) FROM chunks c WHERE c.tenant_id = t.id) AS chunks
       FROM tenants t ORDER BY t.created_at`);
  throw new Error(
    `тенант «${wanted}» не найден.\n` +
    (known.length
      ? `  в базе есть: ${known.map((t) => `«${t.name}» (${t.chunks} фрагментов)`).join(', ')}\n`
      : '  в базе нет ни одного тенанта\n') +
    '  завести заготовку: npm run seed:control\n' +
    '  взять другого:     npm run test:control -- --tenant "имя"',
  );
});

// Тенант без единого фрагмента ответит «уточните у менеджера» на каждый
// вопрос, и набор насчитает десяток провалов там, где сломан не бот, а база.
const indexed = await withOwner(async (client) => {
  const { rows } = await client.query<{ n: string }>(
    'SELECT count(*) AS n FROM chunks WHERE tenant_id = $1', [tenant.id]);
  return Number(rows[0]!.n);
});
if (indexed === 0) {
  throw new Error(
    `у тенанта «${tenant.name}» не проиндексировано ни одного фрагмента.\n` +
    '  набор проверяет ответы по материалам — без материалов проверять нечего.\n' +
    '  завести заготовку: npm run seed:control',
  );
}

const VISITOR = `control-${process.pid}`;

async function ask(message: string): Promise<{ text: string; conversationId?: string }> {
  const res = await fetch(`${BASE}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: `https://${tenant.allowed_domains[0]}`,
    },
    body: JSON.stringify({
      publicKey: tenant.public_key, visitorId: VISITOR, locale: spec.locale, message,
    }),
  });
  // Собственный потолок частоты. Набор — машина, а ограничитель на машины
  // и рассчитан: пятнадцать вопросов подряд в него упираются. Провал в этом
  // месте читался бы как «бот не отвечает», хотя бот в порядке, — поэтому
  // прогон останавливается с объяснением и командой, а не досчитывается
  // до «9/15» с шестью загадочными пустыми ответами.
  if (res.status === 429) {
    const wait = res.headers.get('retry-after') ?? '?';
    throw new RateLimited(
      `упёрлись в СВОЙ потолок частоты (429, ждать ${wait} с).\n` +
      '  Набор шлёт пятнадцать вопросов подряд — это машинная частота.\n' +
      '  Поднимите потолки у сервера, против которого идёт прогон:\n' +
      '    CHAT_RATE_PER_MINUTE=60 CHAT_RATE_PER_HOUR=600 npm run dev',
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);

  let text = '';
  let conversationId: string | undefined;
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const event = /^event: (.+)$/m.exec(part)?.[1];
      const data = /^data: (.+)$/m.exec(part)?.[1];
      if (!data) continue;
      const payload = JSON.parse(data) as { t?: string; conversationId?: string; error?: string };
      if (event === 'meta' && payload.conversationId) conversationId = payload.conversationId;
      if (event === 'delta' && payload.t) text += payload.t;
      if (event === 'error') throw new Error(`поток оборван: ${payload.error}`);
    }
  }
  return { text, ...(conversationId ? { conversationId } : {}) };
}

const cases = spec.cases.filter((c) => !only || only.includes(c.id));
let failed = 0;

console.log(
  `контрольный набор: ${cases.length} случаев, тенант «${tenant.name}», `
  + `${indexed} фрагментов\n`,
);

for (const c of cases) {
  const problems: string[] = [];
  let answer = '';
  try {
    const r = await ask(c.ask);
    answer = r.text.trim();
    if (!answer) problems.push('бот промолчал');

    const hay = answer.toLowerCase();
    if (c.expect && !c.expect.some((e) => hay.includes(e.toLowerCase()))) {
      problems.push(`нет ни одного из: ${c.expect.join(', ')}`);
    }
    for (const e of c.expect_all ?? []) {
      if (!hay.includes(e.toLowerCase())) problems.push(`нет обязательного: ${e}`);
    }
    if (c.forbid) {
      const hit = forbidden(c.forbid, answer);
      if (hit) problems.push(`встретилось запрещённое: «${hit}»`);
    }
    if (spec.global_forbid) {
      const hit = forbidden(spec.global_forbid, answer);
      if (hit) problems.push(`язык инструкций протёк в ответ: «${hit}»`);
    }

    // Заявка проверяется в базе, а не по словам бота: «передал менеджеру»
    // в тексте ответа — это обещание, а не факт.
    if (c.expect_lead && r.conversationId) {
      const lead = await withOwner(async (client) => {
        const { rows } = await client.query<{ phone: string | null; email: string | null }>(
          'SELECT phone, email FROM leads WHERE conversation_id = $1', [r.conversationId]);
        return rows[0];
      });
      if (!lead) problems.push('заявка не создана');
      else {
        const digits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');
        if (c.expect_lead.phone && digits(lead.phone) !== digits(c.expect_lead.phone)) {
          problems.push(`телефон в заявке «${lead.phone}», ожидался «${c.expect_lead.phone}»`);
        }
      }
    }
  } catch (err) {
    if (err instanceof RateLimited) {
      console.error(`\n  ✗ ${c.id} — ${err.message}`);
      console.error('\nПРОГОН ОСТАНОВЛЕН: это наш потолок, а не ответ бота.');
      await closeOwnerPool();
      await pool.end();
      process.exit(2);
    }
    problems.push((err as Error).message);
  }

  if (problems.length === 0) {
    console.log(`  ✓ ${c.id}`);
  } else {
    failed++;
    console.error(`  ✗ ${c.id} — ${problems.join('; ')}`);
    console.error(`      эталон: ${c.reference}`);
    console.error(`      ответ:  ${answer.replace(/\s+/g, ' ').slice(0, Number(process.env.ANSWER_CHARS ?? 240)) || '(пусто)'}`);
  }
}

// Контрольные разговоры не должны копиться в панели клиента.
await withOwner(async (client) => {
  // Пробелы удаляются ДО разговоров: внешний ключ обнуляется при удалении
  // разговора, и осиротевшие строки уже не связать с прогоном. Без этого
  // контрольные вопросы копились в списке пробелов клиента — «есть ли
  // шоурум в Кишинёве» тридцать раз подряд.
  await client.query(
    `DELETE FROM unanswered_log WHERE conversation_id IN
       (SELECT id FROM conversations WHERE visitor_id = $1)`, [VISITOR]);
  await client.query('DELETE FROM conversations WHERE visitor_id = $1', [VISITOR]);
  await client.query("DELETE FROM leads WHERE conversation_id IS NULL AND name ILIKE '%Control%'");
});

console.log(
  failed === 0
    ? `\nКОНТРОЛЬНЫЙ НАБОР OK (${cases.length}/${cases.length})`
    : `\nКОНТРОЛЬНЫЙ НАБОР: ${cases.length - failed}/${cases.length}, провалено ${failed}`,
);
await pool.end();
await closeOwnerPool();
process.exit(failed === 0 ? 0 : 1);
