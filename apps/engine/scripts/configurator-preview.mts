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
<style>body{margin:0;min-height:100vh;background:#f4f4f5;font-family:system-ui}</style>
</head><body>
<div id="root" data-locale="${locale}" data-name="${clientConfig.name ?? id}"
     data-preset="${clientConfig.channels?.web?.widget?.preset ?? 'classic'}"
     data-disclosure="Preț estimativ, calculat pe server."></div>
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
