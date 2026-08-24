/**
 * Предпросмотр конфигуратора.
 *
 *   npm run configurator:preview -- sofabelle
 *   npm run configurator:preview -- sofabelle --locale ro --port 4321
 *
 * Поднимает локальный сервер и показывает шаги живьём. Базы не требует:
 * слой клиента читается с диска, слой ниши — из репозитория.
 *
 * Цену считает НАСТОЯЩИЙ движок из `pricing/engine.ts`, а флоу отдаётся через
 * настоящий `publicFlow`. Заглушек нет намеренно: заглушенная цена показала бы
 * красивый экран и скрыла ровно то, ради чего предпросмотр и нужен —
 * что браузер видит и чего не видит.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import Fastify from 'fastify';
import { parse } from 'yaml';
import { buildConfigurator } from '../src/products/configurator/load.js';
import { publicFlow } from '../src/products/configurator/flow/public.js';
import { priceOf } from '../src/products/configurator/pricing/engine.js';
import { buildOfferTemplate, clientOfferLayer } from '../src/products/configurator/offer/load.js';
import { buildAgentSystem } from '../src/products/configurator/agent/prompt.js';
import { resolveSelections } from '../src/products/configurator/flow/select.js';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!id) {
  console.error('нужен идентификатор клиента: npm run configurator:preview -- <id> [--locale ro]');
  process.exit(1);
}

const dir = join(resolve(process.env.CLIENTS_DIR ?? 'clients'), id);
if (!existsSync(dir)) { console.error(`клиент «${id}» не найден`); process.exit(1); }

const clientConfig = existsSync(join(dir, 'config.yaml'))
  ? (parse(readFileSync(join(dir, 'config.yaml'), 'utf8')) as Record<string, any>)
  : {};
const verticalId = (clientConfig.vertical as string | undefined) ?? null;
const locales: string[] = clientConfig.locale?.supported ?? ['ro'];
const locale = flag('locale') ?? locales[0]!;

const cfg = buildConfigurator({ verticalId, clientDir: dir, locales, where: `клиент «${id}»` });
const offer = buildOfferTemplate({ verticalId, clientLayer: clientOfferLayer(dir), locales });

/** Картинки вариантов отдаются по индексу, а не по пути: путь на диске наружу не уходит. */
const assets: string[] = [];
const flow = publicFlow(cfg.flow, locale, (file) => {
  const i = assets.indexOf(file);
  return `/asset/${i === -1 ? assets.push(file) - 1 : i}`;
});

const bundle = await build({
  entryPoints: [resolve('scripts/configurator-demo.tsx')],
  bundle: true, format: 'iife', target: 'es2020', write: false,
  jsx: 'automatic', jsxImportSource: 'preact',
});
const script = bundle.outputFiles[0]!.text;

const app = Fastify();

app.get('/', async (_req, reply) => reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configurator · ${id}</title>
<style>
 body{margin:0;min-height:100vh;background:#f4f4f5;font-family:system-ui;color:#111}
 .page{max-width:760px;margin:0 auto;padding:64px 24px}
 .card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgb(0 0 0/6%)}
 h1{margin:0 0 6px;font-size:22px} p{margin:0 0 20px;color:#555;font-size:15px}
 .row{display:flex;gap:12px;flex-wrap:wrap}
 button{font:inherit;font-size:15px;padding:12px 20px;border:0;border-radius:10px;
        background:#111;color:#fff;cursor:pointer}
 button.ghost{background:#fff;color:#111;border:1px solid #d4d4d8}
</style>
</head><body>
<div class="page"><div class="card">
  <h1>Canapea Free Comfort</h1>
  <p>Страница товара клиента. Слева — его собственная кнопка, она не наша.
     Справа — та, что он ставит в вёрстку рядом с ней.</p>
  <div class="row">
    <button class="ghost" onclick="alert('Это существующий поп-ап клиента — мы его не трогаем.')">Cere ofertă</button>
    <button data-assistwidget-configurator>Configurator</button>
  </div>
</div></div>
<div id="root" data-locale="${locale}" data-name="${clientConfig.name ?? id}"
     data-preset="${clientConfig.channels?.web?.widget?.preset ?? 'classic'}"></div>
<script src="/demo.js"></script>
</body></html>`));

app.get('/demo.js', async (_req, reply) =>
  reply.type('application/javascript; charset=utf-8').send(script));

app.get('/v1/configurator/config', async () => ({
  flow,
  currency: offer.currency,
  vat: cfg.pricing.vat,
}));

app.post<{ Body: { selections: Record<string, string | string[] | number> } }>(
  '/v1/configurator/price', async (request, reply) => {
    try {
      const r = priceOf(cfg.flow, cfg.pricing, request.body?.selections ?? {});
      return {
        finalPriceBani: r.finalPriceBani, vatBani: r.vatBani,
        totalBani: r.totalBani, discountBani: r.discountBani,
      };
    } catch (e) {
      // Неполный или неверный выбор — ожидаемый ход, а не поломка сервера.
      return reply.code(422).send({ error: (e as Error).message });
    }
  },
);

app.post('/v1/configurator/offer', async (_req, reply) =>
  reply.code(501).send({ error: 'выпуск оферты — фаза 4' }));

/**
 * Вопрос агенту. Модель вызывается настоящая — иначе предпросмотр показал бы,
 * что кнопка нажимается, и умолчал бы о том, отвечает ли агент по делу.
 * Без ключей AWS отвечает 503: это предпросмотр, а не витрина.
 */
app.post<{ Body: {
  question?: string; stepId?: string; locale?: string;
  selections?: Record<string, string | string[] | number>;
} }>('/v1/configurator/ask', async (request, reply) => {
  const question = (request.body?.question ?? '').trim().slice(0, 500);
  if (!question) return reply.code(400).send({ error: 'нет вопроса' });

  let selections;
  let price: string | undefined;
  try {
    selections = resolveSelections(cfg.flow, request.body?.selections ?? {}, 'вопрос');
  } catch {
    // Выбор ещё неполный — это нормальный ход: агент отвечает и без него.
    selections = { picks: [], numbers: {}, texts: {} };
  }
  try {
    const r = priceOf(cfg.flow, cfg.pricing, request.body?.selections ?? {});
    price = new Intl.NumberFormat(locale, {
      style: 'currency', currency: offer.currency.code,
      minimumFractionDigits: offer.currency.decimals,
      maximumFractionDigits: offer.currency.decimals,
    }).format(r.totalBani / 10 ** offer.currency.decimals);
  } catch { /* цены ещё нет */ }

  const system = buildAgentSystem({
    botName: clientConfig.name ?? id,
    companyName: clientConfig.name ?? id,
    locale: request.body?.locale ?? locale,
    flow: cfg.flow,
    stepId: request.body?.stepId,
    selections,
    price,
    prompt: cfg.agent.prompt,
  });

  try {
    const { claude, modelFor } = await import('../src/engine/llm/claude.js');
    const res = await claude.messages.create({
      model: modelFor('base'),
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: question }],
    });
    const answer = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    return { answer };
  } catch (e) {
    console.error('агент не ответил:', (e as Error).message);
    return reply.code(503).send({ error: 'модель недоступна' });
  }
});

// Промпт агента печатается по запросу: его читают глазами чаще, чем кажется.
app.get('/agent-prompt', async (_req, reply) => reply.type('text/plain; charset=utf-8').send(
  buildAgentSystem({
    botName: clientConfig.name ?? id, companyName: clientConfig.name ?? id, locale,
    flow: cfg.flow, stepId: cfg.flow.steps[0]?.id,
    selections: { picks: [], numbers: {}, texts: {} },
    prompt: cfg.agent.prompt,
  }),
));

// Заявка продавцу: в предпросмотре только подтверждение, чтобы ветку
// «позвать консультанта» можно было пройти целиком.
app.post('/v1/lead', async (request) => {
  console.log('заявка продавцу:', JSON.stringify(request.body));
  return { ok: true };
});

app.get<{ Params: { i: string } }>('/asset/:i', async (request, reply) => {
  const file = assets[Number(request.params.i)];
  if (!file) return reply.code(404).send();
  return reply.type('image/jpeg').send(readFileSync(file));
});

const port = Number(flag('port') ?? 4321);
await app.listen({ port, host: '127.0.0.1' });
console.log(`\nшаги: ${flow.steps.map((s) => s.id).join(' → ')}`);
console.log(`валюта: ${offer.currency.code}, НДС: ${cfg.pricing.vat.rate / 100}% (${cfg.pricing.vat.mode})`);
console.log(`\n  http://127.0.0.1:${port}/\n`);
