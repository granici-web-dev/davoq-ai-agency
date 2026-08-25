// Первым импортом: остальные модули создают пулы на этапе загрузки.
import '../../engine/env.js';
import { closeOwnerPool, pool, withOwner } from '../../engine/db/pool.js';
import { CAPTURE_LEAD, REPORT_UNANSWERED } from '../../engine/llm/tools.js';
import { verticalOf } from '../../engine/prompt/vertical.js';
import { buildSystem } from '../../engine/rag/prompt.js';

/**
 * Себестоимость.
 *
 *   npm run cost                       # 25 000 сообщений в месяц
 *   npm run cost -- --messages 25000
 *   npm run cost -- --visitors 25000 --engagement 4
 *   npm run cost -- --visitors 25000 --clients 5
 *
 * Считается по ЗАМЕРЕННОМУ расходу токенов из базы, а не по прикидке
 * «символы делить на четыре». Прикидка используется только пока сообщений
 * слишком мало, чтобы на них опираться, — и об этом прямо сообщается.
 *
 * Цены проверяйте сами. Они меняются, а неверная цена здесь — это неверная
 * цена в коммерческом предложении, и обнаружится она на счёте.
 */

// ── Цены. Проверить перед тем, как называть клиенту ─────────────────────────
// Bedrock, Claude Haiku 4.5, eu-central-1, за миллион токенов.
const PRICE_IN = Number(process.env.PRICE_IN_PER_MTOK ?? 1.0);
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_MTOK ?? 5.0);
// Чтение из кеша дешевле входа в десять раз, запись — дороже на четверть.
const CACHE_READ_RATIO = 0.1;
const CACHE_WRITE_RATIO = 1.25;
// Titan Text Embeddings V2, за миллион токенов.
const PRICE_EMBED = Number(process.env.PRICE_EMBED_PER_MTOK ?? 0.02);

// ── Инфраструктура, в долларах в месяц ──────────────────────────────────────
// Общая на всех клиентов: второй клиент не удваивает эти строки.
const INFRA: Array<[string, number]> = [
  ['сервер (Hetzner CX22, 2 ядра / 4 ГБ)', Number(process.env.COST_SERVER ?? 4.9)],
  ['копии вне сервера (Storage Box)', Number(process.env.COST_BACKUP ?? 4.1)],
  ['домен', Number(process.env.COST_DOMAIN ?? 1.0)],
  ['отправка писем', Number(process.env.COST_MAIL ?? 0)],
];

/**
 * Инструменты разработки.
 *
 * Отдельной статьёй, и это не бухгалтерская придирка. Она ведёт себя иначе,
 * чем всё остальное: не зависит ни от трафика, ни от числа клиентов. На одном
 * клиенте она больше всей остальной себестоимости в несколько раз, на десяти
 * почти незаметна. Спрятать её в общую кучу — значит не увидеть, что цену
 * пилота определяет именно она, а не Bedrock.
 *
 * Делится на две части. Подписка на Claude нужна и тогда, когда продукт готов:
 * им он и поддерживается. Остальное нужно, пока идёт стройка, — и когда она
 * кончится, эти строки можно убрать.
 */
const TOOLS: Array<[string, number, 'всегда' | 'пока строим']> = [
  ['подписка Claude', Number(process.env.COST_CLAUDE ?? 120), 'всегда'],
  ['Figma', Number(process.env.COST_FIGMA ?? 25), 'пока строим'],
  ['Higgsfield', Number(process.env.COST_HIGGSFIELD ?? 25), 'пока строим'],
];

const args = process.argv.slice(2);
const flag = (name: string): number | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : null;
};

const visitors = flag('visitors');
const engagementPct = flag('engagement') ?? 4;
const msgsPerConversation = flag('per-conversation') ?? 4;

/** Между сколькими клиентами делятся общие статьи. */
const clients = Math.max(1, flag('clients') ?? 1);

/**
 * Сколько сообщений в месяц. Из посетителей сайта считается так: доля тех, кто
 * вообще открыл чат и написал, — обычно единицы процентов, — умноженная на
 * число реплик в разговоре.
 */
const monthlyMessages = visitors !== null
  ? Math.round(visitors * (engagementPct / 100) * msgsPerConversation)
  : (flag('messages') ?? 25_000);

const est = (s: string): number => Math.ceil(s.length / 4);

// ── Стабильный префикс: то, что одинаково во всех запросах ──────────────────
const stablePrefix = await withOwner(async (client) => {
  const { rows } = await client.query<{
    id: string; name: string; vertical: string | null; profile: Record<string, unknown>;
    bot_name: string | null; price_guidance: string | null; locale_default: string;
  }>(`SELECT t.id, t.name, t.vertical, t.profile, t.price_guidance, t.locale_default,
             w.bot_name
        FROM tenants t LEFT JOIN widget_configs w ON w.tenant_id = t.id
       ORDER BY t.created_at LIMIT 1`);
  const t = rows[0];
  const system = buildSystem({
    botName: t?.bot_name ?? 'Assistant',
    companyName: t?.name ?? 'the company',
    localeDefault: t?.locale_default ?? 'en',
    priceGuidance: t?.price_guidance ?? '',
    quoteFields: [],
    vertical: verticalOf(t?.vertical ?? null),
    profile: t?.profile ?? {},
  }).map((b) => b.text).join('');
  const tools = JSON.stringify([CAPTURE_LEAD, REPORT_UNANSWERED]);
  return { tokens: est(system) + est(tools), tenant: t?.name ?? '—' };
});

// ── Замеренный расход ───────────────────────────────────────────────────────
const measured = await withOwner(async (client) => {
  const { rows } = await client.query<{
    n: string; avg_in: string | null; avg_out: string | null; cached: string | null;
  }>(`SELECT count(*) n,
             round(avg(tokens_in))  avg_in,
             round(avg(tokens_out)) avg_out,
             round(avg(cache_read_tokens)) cached
        FROM messages WHERE role = 'assistant' AND tokens_in > 0`);
  return {
    n: Number(rows[0]?.n ?? 0),
    tokensIn: Number(rows[0]?.avg_in ?? 0),
    tokensOut: Number(rows[0]?.avg_out ?? 0),
    cached: Number(rows[0]?.cached ?? 0),
  };
});

/** Запасные значения, пока настоящих ответов слишком мало. */
const FALLBACK_IN = 5_500;
const FALLBACK_OUT = 200;
const enough = measured.n >= 20;

const tokensIn = enough ? measured.tokensIn : FALLBACK_IN;
const tokensOut = enough ? measured.tokensOut : FALLBACK_OUT;
const variableIn = Math.max(0, tokensIn - stablePrefix.tokens);

const money = (v: number, digits = 2): string => `$${v.toFixed(digits)}`;
const pad = (s: string, n: number): string => s.padEnd(n);

console.log(`\nСЕБЕСТОИМОСТЬ · ${monthlyMessages.toLocaleString('ru-RU')} сообщений в месяц`);
if (visitors !== null) {
  console.log(`(из ${visitors.toLocaleString('ru-RU')} посетителей сайта: ` +
              `${engagementPct}% пишут в чат, по ${msgsPerConversation} реплики)`);
}
console.log(`клиент для расчёта промпта: ${stablePrefix.tenant}\n`);

console.log('── расход на одно сообщение ──');
if (enough) {
  console.log(`замерено на ${measured.n} настоящих ответах`);
} else {
  console.log(`настоящих ответов в базе ${measured.n} — мало для замера,`);
  console.log(`взяты значения по умолчанию (${FALLBACK_IN} / ${FALLBACK_OUT} ток.).`);
  console.log('Пересчитайте после первой недели работы — команда та же.');
}
console.log(`  вход   ${String(tokensIn).padStart(6)} ток.  из них стабильных ` +
            `${stablePrefix.tokens} (промпт и инструменты), переменных ${variableIn}`);
console.log(`  выход  ${String(tokensOut).padStart(6)} ток.`);
if (measured.cached > 0) console.log(`  из кеша ${measured.cached} ток. в среднем`);

// ── Модель ──────────────────────────────────────────────────────────────────
const perMsgPlain = (tokensIn * PRICE_IN + tokensOut * PRICE_OUT) / 1e6;

/**
 * С кешем. Стабильный префикс читается из кеша, а не считается заново, —
 * но только если предыдущий такой же запрос был не позже пяти минут назад.
 * Доля попаданий зависит от плотности трафика: на 25 000 сообщений в месяц
 * это примерно одно в две минуты, то есть попадания будут, но не всегда.
 */
const hitRate = Number(process.env.CACHE_HIT_RATE ?? 0.7);
const perMsgCached =
  (variableIn * PRICE_IN
   + stablePrefix.tokens * PRICE_IN * (hitRate * CACHE_READ_RATIO + (1 - hitRate) * CACHE_WRITE_RATIO)
   + tokensOut * PRICE_OUT) / 1e6;

/** Поиск: одно обращение к эмбеддеру на сообщение посетителя. */
const perMsgEmbed = (80 * PRICE_EMBED) / 1e6;

console.log('\n── в месяц ──');
const modelPlain = perMsgPlain * monthlyMessages;
const modelCached = perMsgCached * monthlyMessages;
const embed = perMsgEmbed * monthlyMessages;

console.log(`${pad('модель, без кеша', 38)}${money(modelPlain).padStart(10)}` +
            `   (${money(perMsgPlain, 5)} за сообщение)`);
console.log(`${pad(`модель, с кешем (попаданий ${Math.round(hitRate * 100)}%)`, 38)}` +
            `${money(modelCached).padStart(10)}   (${money(perMsgCached, 5)} за сообщение)`);
console.log(`${pad('поиск по материалам', 38)}${money(embed).padStart(10)}`);
for (const [name, v] of INFRA) console.log(`${pad(name, 38)}${money(v).padStart(10)}`);

const infraTotal = INFRA.reduce((a, [, v]) => a + v, 0);
const totalPlain = modelPlain + embed + infraTotal;
const totalCached = modelCached + embed + infraTotal;

console.log('─'.repeat(48));
console.log(`${pad('ИТОГО в месяц, без кеша', 38)}${money(totalPlain).padStart(10)}`);
console.log(`${pad('ИТОГО в месяц, с кешем', 38)}${money(totalCached).padStart(10)}`);
console.log(`${pad('ИТОГО за год, с кешем', 38)}${money(totalCached * 12).padStart(10)}`);

// ── Инструменты ─────────────────────────────────────────────────────────────
console.log('\n── инструменты разработки (общие на всех клиентов) ──');
for (const [name, v, when] of TOOLS) {
  console.log(`${pad(name, 30)}${money(v).padStart(10)}   ${when}`);
}
const toolsAlways = TOOLS.filter(([, , w]) => w === 'всегда').reduce((a, [, v]) => a + v, 0);
const toolsTotal = TOOLS.reduce((a, [, v]) => a + v, 0);
console.log('─'.repeat(48));
console.log(`${pad('всего', 30)}${money(toolsTotal).padStart(10)}` +
            `   из них постоянно ${money(toolsAlways)}`);

// ── Полная картина ──────────────────────────────────────────────────────────
const perClientShared = (infraTotal + toolsTotal) / clients;
const perClientAlways = (infraTotal + toolsAlways) / clients;
const perClient = modelCached + embed + perClientShared;

console.log(`\n── всё вместе, при ${clients} клиент(ах) ──`);
console.log(`${pad('на клиента: модель и поиск', 38)}${money(modelCached + embed).padStart(10)}`);
console.log(`${pad('доля общего (сервер + инструменты)', 38)}${money(perClientShared).padStart(10)}`);
console.log('─'.repeat(48));
console.log(`${pad('СЕБЕСТОИМОСТЬ КЛИЕНТА в месяц', 38)}${money(perClient).padStart(10)}`);
console.log(`${pad('она же, когда стройка кончится', 38)}` +
            `${money(modelCached + embed + perClientAlways).padStart(10)}`);
console.log(`${pad('ВСЕГО расходов в месяц', 38)}` +
            `${money((modelCached + embed) * clients + infraTotal + toolsTotal).padStart(10)}`);
console.log(`${pad('ВСЕГО за год', 38)}` +
            `${money(((modelCached + embed) * clients + infraTotal + toolsTotal) * 12).padStart(10)}`);

console.log('\n── на что уходят деньги ──');
const grand = perClient;
const share = (v: number): string => `${Math.round((v / grand) * 100)}%`;
console.log(`модель ${share(modelCached)} · инструменты ${share(toolsTotal / clients)} · ` +
            `сервер ${share(infraTotal / clients)} · поиск ${share(embed)}`);
console.log(`на один разговор (${msgsPerConversation} реплики): ` +
            `${money(perMsgCached * msgsPerConversation, 3)}`);

// ── Сколько клиентов нужно ──────────────────────────────────────────────────
console.log('\n── за сколько сдавать ──');
console.log('клиентов   себестоимость клиента   всего в месяц   окупается при цене');
for (const n of [1, 2, 3, 5, 10, 20]) {
  const each = modelCached + embed + (infraTotal + toolsTotal) / n;
  const all = (modelCached + embed) * n + infraTotal + toolsTotal;
  // Цена, при которой сходится в ноль, с округлением вверх до полусотни:
  // назначать цену впритык к себестоимости — значит работать бесплатно.
  const breakeven = Math.ceil(each / 50) * 50;
  console.log(`${String(n).padStart(6)}   ${money(each).padStart(18)}   ` +
              `${money(all).padStart(11)}   ${money(breakeven).padStart(14)}`);
}

console.log('\n── о чём здесь легко ошибиться ──');
console.log('Цены Bedrock и хостинга заданы константами и могут устареть:');
console.log(`  вход ${money(PRICE_IN)}/млн, выход ${money(PRICE_OUT)}/млн, ` +
            `эмбеддинги ${money(PRICE_EMBED, 3)}/млн.`);
console.log('Переопределяются переменными PRICE_IN_PER_MTOK, PRICE_OUT_PER_MTOK,');
console.log('PRICE_EMBED_PER_MTOK, COST_SERVER, COST_BACKUP, COST_DOMAIN,');
console.log('COST_CLAUDE, COST_FIGMA, COST_HIGGSFIELD.');
console.log('');
console.log('Доля попаданий в кеш — предположение, а не замер: кеш живёт пять минут,');
console.log('и попадёт ли следующее сообщение в это окно, зависит от плотности');
console.log('трафика. Проверить можно после первой недели: если cache_read_tokens');
console.log('в базе остаётся нулевым, кеш не работает вовсе и счёт будет по верхней');
console.log('строке. Задаётся переменной CACHE_HIT_RATE.');
console.log('');
console.log('Не учтено: НДС, исходящий трафик сервера (на таких объёмах он в тариф');
console.log('входит) и ваше собственное время. Последнее на пилоте — самая большая');
console.log('статья, и в деньгах она здесь не выражена.');

await pool.end();
await closeOwnerPool();
