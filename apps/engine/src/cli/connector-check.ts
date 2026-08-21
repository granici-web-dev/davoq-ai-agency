/**
 * Проверка пути вызова коннектора против локального мока: подстановка параметров,
 * секрет в заголовке, обрезка ответа, таймаут, отказ следовать редиректу
 * в приватную сеть. Запускать с SSRF_ALLOW_LOOPBACK=1.
 */
import { createServer } from 'node:http';
import { callConnector, formatResult, type ConnectorTool } from '../llm/connector.js';
import { encryptSecret } from '../llm/secrets.js';

const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost');

  if (url.pathname.startsWith('/orders/')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: url.pathname.split('/')[2],
      status: 'shipped',
      auth: req.headers.authorization ?? null,
    }));
    return;
  }
  if (url.pathname === '/huge') {
    res.end('x'.repeat(64 * 1024));
    return;
  }
  if (url.pathname === '/slow') {
    setTimeout(() => res.end('too late'), 9_000);
    return;
  }
  if (url.pathname === '/redirect-to-metadata') {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    res.end();
    return;
  }
  res.writeHead(404).end('nope');
});

await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;

const base = (path: string, method = 'GET'): ConnectorTool => ({
  id: 't', connectorId: 'c', toolName: 'check', description: '',
  inputSchema: { type: 'object' }, httpMethod: method, pathTemplate: path,
  bodyTemplate: null, responseInstructions: 'Назови статус посетителю простыми словами.',
  baseUrl: `http://127.0.0.1:${port}`,
  headersTemplate: { authorization: 'Bearer {{secret}}' },
  secret: encryptSecret('super-token'),
});

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail: string): void => {
  results.push([name, ok, detail]);
};

{
  const r = await callConnector(base('/orders/{order_id}'), { order_id: 'A-42' });
  const body = JSON.parse(r.body) as { id: string; auth: string };
  check('подстановка пути и секрет в заголовке',
    r.status === 200 && body.id === 'A-42' && body.auth === 'Bearer super-token',
    `status=${r.status} id=${body.id} auth=${body.auth}`);
  check('инструкции по ответу приклеены',
    formatResult(base('/orders/{order_id}'), r).includes('простыми словами'), '');
}

{
  // Значение попадает в путь, поэтому слэши обязаны быть закодированы: иначе
  // аргумент модели «../../admin» уводит запрос на другой эндпоинт того же хоста.
  const r = await callConnector(base('/orders/{order_id}'), { order_id: '../../admin' });
  const body = JSON.parse(r.body) as { id: string };
  check('обход пути через параметр закодирован',
    r.status === 200 && body.id === '..%2F..%2Fadmin' && !body.id.includes('/'),
    `status=${r.status} id=${body.id}`);
}

{
  const r = await callConnector(base('/huge'), {});
  check('ответ обрезан на 32 КБ',
    r.truncated && r.body.length === 32 * 1024, `len=${r.body.length} truncated=${r.truncated}`);
}

{
  const started = Date.now();
  const r = await callConnector(base('/slow'), {});
  const elapsed = Date.now() - started;
  // Таймаут 5 с и одна повторная попытка — верхняя граница около 11 с.
  check('таймаут сработал', r.error !== undefined && elapsed < 12_000,
    `${elapsed} мс, error=${r.error}`);
}

{
  const r = await callConnector(base('/redirect-to-metadata'), {});
  check('редирект в метаданные облака отклонён',
    r.error !== undefined && r.error.includes('169.254.169.254'), `error=${r.error}`);
}

{
  const r = await callConnector(base('/missing'), {});
  check('404 подан модели как недоступность, а не как данные',
    formatResult(base('/missing'), r).includes('404'), formatResult(base('/missing'), r));
}

server.close();
let failed = 0;
for (const [name, ok, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  → ${detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} проверок пройдено`);
process.exit(failed ? 1 : 0);
