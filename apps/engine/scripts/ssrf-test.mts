/**
 * Доказательство, что сервер не сходит по адресу, который ему назвали.
 *
 *   npm run test:ssrf
 *
 * Проверяются четыре обхода, а не один. Прямой адрес метаданных облака ловила
 * и прежняя защита; ломались остальные три: переход на внутренний адрес,
 * секрет, уезжающий на чужой хост после перехода, и подмена имени между
 * проверкой и соединением.
 */
process.env.SSRF_ALLOW_LOOPBACK = '1';
process.env.NODE_ENV = 'test';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { safeFetch, guardedLookup } from '../src/engine/net/safe-fetch.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };

async function rejects(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    bad(`${what}: ПРОШЛО — обход работает`);
  } catch (err) {
    ok(`${what}: отвергнуто — ${(err as Error).message.slice(0, 70)}`);
  }
}

// Сервер, который отвечает так, как отвечал бы злоумышленник.
const seen: Array<{ path: string; headers: Record<string, unknown> }> = [];
const handler = (req: IncomingMessage, res: ServerResponse): void => {
  seen.push({ path: req.url ?? '', headers: { ...req.headers } });
  const url = req.url ?? '/';
  if (url === '/to-metadata') {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    return res.end();
  }
  if (url.startsWith('/to-other')) {
    res.writeHead(302, { location: new URL(url, 'http://x').searchParams.get('u') ?? '/' });
    return res.end();
  }
  if (url === '/huge') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('x'.repeat(200_000));
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<html>ok</html>');
};

const a = createServer(handler);
const b = createServer(handler);
await new Promise<void>((r) => a.listen(0, '127.0.0.1', r));
await new Promise<void>((r) => b.listen(0, '127.0.0.1', r));
const portA = (a.address() as { port: number }).port;
const portB = (b.address() as { port: number }).port;
const A = `http://127.0.0.1:${portA}`;
const B = `http://127.0.0.1:${portB}`;

// ── 1. Прямой адрес метаданных ──────────────────────────────────────────────
await rejects('прямой запрос к 169.254.169.254', () => safeFetch('http://169.254.169.254/latest/meta-data/'));
await rejects('он же в форме IPv4-mapped', () => safeFetch('http://[::ffff:a9fe:a9fe]/'));
await rejects('файловая схема', () => safeFetch('file:///etc/passwd'));

// ── 2. Переход на внутренний адрес ──────────────────────────────────────────
await rejects('переход на 169.254.169.254', () => safeFetch(`${A}/to-metadata`));

// ── 3. Секрет не уезжает на чужой источник ──────────────────────────────────
{
  seen.length = 0;
  const res = await safeFetch(`${A}/to-other?u=${encodeURIComponent(B + '/final')}`, {
    headers: { authorization: 'Bearer SECRET-CRM-KEY', 'x-api-key': 'SECRET2', accept: 'application/json' },
  });
  const last = seen[seen.length - 1];
  if (res.status !== 200) bad(`переход между источниками не дошёл: ${res.status}`);
  else if (last?.headers['authorization'] || last?.headers['x-api-key']) {
    bad(`секрет уехал на чужой хост: ${JSON.stringify(last.headers['authorization'] ?? last.headers['x-api-key'])}`);
  } else if (last?.headers['accept'] !== 'application/json') {
    bad('вместе с секретом отрезали и безобидные заголовки');
  } else ok('секрет отрезан на переходе к чужому источнику, accept сохранён');
}

// ── 4. Переход внутри одного источника секрет сохраняет ─────────────────────
{
  seen.length = 0;
  await safeFetch(`${A}/to-other?u=${encodeURIComponent(A + '/final')}`, {
    headers: { authorization: 'Bearer SECRET-CRM-KEY' },
  });
  const last = seen[seen.length - 1];
  if (last?.headers['authorization'] === 'Bearer SECRET-CRM-KEY') ok('на своём источнике секрет сохраняется');
  else bad('переход внутри одного источника потерял заголовок — сломан обычный случай');
}

// ── 5. Потолок на размер ────────────────────────────────────────────────────
{
  const res = await safeFetch(`${A}/huge`, { maxBytes: 4096 });
  if (res.truncated && res.body.length === 4096) ok('тело обрезано на потолке');
  else bad(`потолок не сработал: ${res.body.length} байт, truncated=${res.truncated}`);
}

// ── 6. Подмена имени в момент соединения ────────────────────────────────────
// Проверка адреса до запроса и проверка в момент соединения — разные проверки.
// Здесь проверяется вторая: она и только она закрывает подмену имени.
{
  // Послабление для петли на время этой проверки снимается: тесту выше оно нужно,
  // чтобы вообще достучаться до локального сервера, а здесь оно бы всё скрыло.
  process.env.SSRF_ALLOW_LOOPBACK = '0';
  const why = await new Promise<string | null>((resolve) => {
    guardedLookup('localhost', { all: false }, (err) => resolve(err ? err.message : null));
  });
  process.env.SSRF_ALLOW_LOOPBACK = '1';
  if (why) ok(`соединение с именем, ведущим внутрь, отклонено — ${why.slice(0, 60)}`);
  else bad('проверка в момент соединения пропускает имя, ведущее в петлю');
}

// ── 7. Обычная страница по-прежнему грузится ────────────────────────────────
{
  const res = await safeFetch(`${A}/plain`);
  if (res.status === 200 && res.body.includes('ok')) ok('обычная страница грузится');
  else bad('сломана нормальная загрузка');
}

a.close(); b.close();
console.log(failed === 0 ? '\nSSRF OK' : `\nSSRF НАРУШЕН: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
