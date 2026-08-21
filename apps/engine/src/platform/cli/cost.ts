/** Прикидка себестоимости сообщения на фактическом системном промпте. */
import { buildSystem } from '../../engine/rag/prompt.js';
import { CAPTURE_LEAD } from '../../engine/llm/tools.js';

const est = (s: string): number => Math.ceil(s.length / 4);

const system = buildSystem({ botName: 'SofaBelle', companyName: 'SofaBelle', localeDefault: 'de' })
  .map((b) => b.text).join('');
const tools = JSON.stringify([CAPTURE_LEAD]);

const systemTokens = est(system);
const toolTokens = est(tools);
const stable = systemTokens + toolTokens;

// Переменная часть: 6 фрагментов по ~400 токенов — это верхняя граница нарезки,
// реальные чанки на страницах SofaBelle вышли по 40–60.
const chunks = 6 * 400;
const history = 700;
const question = 60;
const output = 300;

const IN = 1 / 1_000_000;   // Haiku 4.5, ставки Anthropic
const OUT = 5 / 1_000_000;
const CACHE_READ = IN * 0.1;
const CACHE_WRITE = IN * 1.25;

const totalIn = stable + chunks + history + question;
const plain = totalIn * IN + output * OUT;
const cached = (chunks + history + question) * IN + stable * CACHE_READ + output * OUT;

console.log(`системный промпт   ${systemTokens} ток.`);
console.log(`описания инструментов ${toolTokens} ток.`);
console.log(`стабильный префикс ${stable} ток.  ${stable >= 1024 ? '✓ кешируется' : '✗ НИЖЕ минимума ~1024 — кеш не включится'}`);
console.log(`переменная часть   ${chunks + history + question} ток.`);
console.log(`вход всего         ${totalIn} ток., выход ${output} ток.`);
console.log('');
console.log(`без кеша:  $${plain.toFixed(5)}/сообщение  →  $${(plain * 15000).toFixed(2)} за 15 000`);
console.log(`с кешем:   $${cached.toFixed(5)}/сообщение  →  $${(cached * 15000).toFixed(2)} за 15 000`);
console.log('');
for (const [name, n] of [['Starter', 500], ['Pro', 3000], ['Business', 15000]] as const) {
  console.log(`${name.padEnd(9)} ${String(n).padStart(6)} сообщ.  $${(plain * n).toFixed(2)}`);
}
