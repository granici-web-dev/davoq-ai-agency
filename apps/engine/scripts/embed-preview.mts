/**
 * Стенд встройки: страница товара на WordPress.
 *
 *   PORT=3111 npx tsx --env-file=.env src/engine/api/server.ts
 *   npm run embed:preview -- --key pk_… --api http://127.0.0.1:3111
 *
 * Зачем отдельная страница, а не «откроем сайт клиента»: сайт клиента нам
 * не принадлежит, а проверять надо ровно то, что ломается на чужих темах.
 *
 * Тема здесь НАМЕРЕННО ВРАЖДЕБНАЯ — так выглядит средний магазинный шаблон:
 *   `* { box-sizing: content-box }`, глобальные правила на button, input и img,
 *   `!important` на радиусах и шрифтах, ломаная типографика.
 * Если виджет переживает это, он переживёт и обычную тему.
 *
 * И кнопка вставляется В DOM ПОСЛЕ ЗАГРУЗКИ, как это делает любой магазинный
 * скрипт с ленивой отрисовкой карточек: обход элементов при старте нашёл бы
 * пустую страницу.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify from 'fastify';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const key = flag('key');
const api = flag('api') ?? 'http://127.0.0.1:3000';
if (!key) {
  console.error('нужен публичный ключ тенанта: npm run embed:preview -- --key pk_… [--api …]');
  process.exit(1);
}

const app = Fastify();

/**
 * Всё, что виджет просит у сервера, уходит на настоящий сервер.
 *
 * Заглушки здесь были бы вредны: половина того, что проверяет этот стенд, —
 * что виджет вообще доживает до данных на чужой странице.
 */
app.all('/v1/*', async (request, reply) => {
  const target = new URL(request.url, api);
  const res = await fetch(target, {
    method: request.method,
    headers: { 'content-type': 'application/json' },
    ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
  });
  const body = Buffer.from(await res.arrayBuffer());
  return reply
    .code(res.status)
    .header('content-type', res.headers.get('content-type') ?? 'application/json')
    .send(body);
});

app.get('/widget.js', async (_req, reply) =>
  reply.type('application/javascript; charset=utf-8')
    .send(readFileSync(resolve('dist/widget.js'), 'utf8')));

app.get('/', async (_req, reply) => reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canapea Free Comfort — Magazin</title>
<style>
  /* Ниже — типичная магазинная тема. Всё это должно остаться снаружи. */
  *{box-sizing:content-box}
  body{margin:0;font-family:Georgia,serif;background:#efe9e1;color:#2b2b2b;line-height:2.4}
  button{all:unset;background:#7a1f1f!important;color:#fff!important;padding:14px 22px;
         border-radius:0!important;font-family:Georgia,serif!important;font-size:19px!important;
         cursor:pointer;letter-spacing:.08em;text-transform:uppercase}
  input,textarea{border:3px dashed #7a1f1f!important;border-radius:0!important;
                 font-family:Georgia,serif!important;font-size:19px!important;padding:12px!important}
  img{filter:sepia(.6);border:6px solid #7a1f1f}
  a{color:#7a1f1f}
  h1{font-size:34px;margin:0 0 8px}
  .wrap{max-width:840px;margin:0 auto;padding:48px 24px}
  .card{background:#fff;padding:32px;border:1px solid #d8cfc2}
  .row{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px}
  .slot{min-height:64px}
</style>
</head><body>
<div class="wrap"><div class="card">
  <h1>Canapea Free Comfort</h1>
  <p>Canapea pe colț, dimensiuni la comandă. Livrare în toată țara.</p>
  <img src="data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" fill="#b9a894"/></svg>',
  ).toString('base64')}" alt="">
  <!-- Кнопки дорисовываются скриптом магазина, как в настоящей теме. -->
  <div class="row slot" id="actions"></div>
</div></div>

<script>
  setTimeout(function () {
    document.getElementById('actions').innerHTML =
      '<button type="button" onclick="alert(\\'Существующий поп-ап магазина\\')">Cere ofertă</button>' +
      '<button type="button" data-assistwidget-configurator>Configurator</button>';
  }, 600);
</script>
<script src="/widget.js" data-key="${key}"></script>
</body></html>`));

const port = Number(flag('port') ?? 4322);
await app.listen({ port, host: '127.0.0.1' });
console.log(`\nстенд встройки (тема магазина, кнопки дорисовываются через 600 мс)`);
console.log(`API: ${api}`);
console.log(`\n  http://127.0.0.1:${port}/\n`);
