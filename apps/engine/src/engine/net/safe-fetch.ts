import { lookup as dnsLookup } from 'node:dns';
import { Agent, request, type Dispatcher } from 'undici';
import { assertPublicUrl, blockedReason, SsrfError } from '../llm/ssrf.js';

/**
 * Единственный способ, которым сервер ходит по адресу, который назвал не мы.
 *
 * Таких мест три: документ, добавляемый в базу знаний по ссылке, проверка
 * установки виджета на сайте клиента и вызов коннектора. Все три принимают
 * адрес из панели, то есть от человека, у которого есть логин, — а запрос по
 * этому адресу делает наш сервер изнутри нашей сети. Проверка адреса до запроса
 * (`assertPublicUrl`) закрывает прямую попытку, но сама по себе оставляет две
 * дыры, и обе рабочие:
 *
 *   1. Переход. Публичный адрес отвечает `302` на `169.254.169.254`, и клиент,
 *      которому разрешено ходить по переходам, идёт туда уже без проверки.
 *   2. Подмена имени между проверкой и запросом (DNS rebinding). `assertPublicUrl`
 *      резолвит имя и убеждается, что адрес публичный; затем `fetch` резолвит то
 *      же имя ЗАНОВО, и владелец имени за эти миллисекунды отдаёт другой ответ.
 *      Проверка была честной, соединение уходит в приватную сеть.
 *
 * Первое лечится ручной обработкой переходов с проверкой на каждом шаге.
 * Второе — только тем, чтобы проверять адрес там же, где устанавливается
 * соединение: свой `lookup` в диспетчере получает те самые адреса, которые
 * пойдут в сокет, и других у соединения не будет.
 */

/** Потолок на тело ответа. Больше нам ни от одного из трёх источников не нужно. */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 3;

/**
 * Заголовки, которые нельзя нести на чужой хост после перехода. Секрет коннектора
 * живёт в `authorization` или в собственном заголовке вроде `x-api-key`, поэтому
 * список не перечисляет опасные, а оставляет заведомо безобидные: любой заголовок,
 * которого здесь нет, на новом источнике отбрасывается.
 */
const SAFE_ACROSS_ORIGINS = new Set(['accept', 'accept-language', 'content-type', 'user-agent']);

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

/**
 * DNS-запрос с проверкой каждого полученного адреса. Экспортируется ради теста:
 * это единственное место, где закрывается подмена имени, и оно должно быть
 * проверяемо отдельно от всего остального.
 * Возвращается ошибка, а не
 * отфильтрованный список: хост, у которого хотя бы одна запись ведёт внутрь, —
 * это не «частично рабочий» хост, а попытка.
 */
export function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  cb: LookupCallback,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0);
    const list = addresses as Array<{ address: string; family: number }>;
    if (list.length === 0) {
      return cb(new SsrfError(`Numele ${hostname} nu a putut fi rezolvat`) as NodeJS.ErrnoException, '', 0);
    }
    for (const { address } of list) {
      const why = blockedReason(address);
      if (why) {
        return cb(
          new SsrfError(`Numele ${hostname} duce la ${address} — ${why}`) as NodeJS.ErrnoException,
          '',
          0,
        );
      }
    }
    if (options.all) return cb(null, list);
    const first = list[0]!;
    cb(null, first.address, first.family);
  });
}

const agent = new Agent({
  connect: { lookup: guardedLookup as never },
  headersTimeout: DEFAULT_TIMEOUT_MS,
  bodyTimeout: DEFAULT_TIMEOUT_MS,
});

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | undefined;
  maxBytes?: number;
  timeoutMs?: number;
  /** 0 — не ходить по переходам вовсе (проверка установки виджета). */
  maxRedirects?: number;
}

export interface SafeResponse {
  status: number;
  /** Адрес, с которого фактически прочитано тело: после переходов он другой. */
  url: string;
  contentType: string;
  body: string;
  truncated: boolean;
  redirected: boolean;
}

const sameOrigin = (a: URL, b: URL): boolean =>
  a.protocol === b.protocol && a.host === b.host;

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let url = await assertPublicUrl(raw);
  let headers = { ...(opts.headers ?? {}) };
  let body = opts.body;
  let method = (opts.method ?? 'GET').toUpperCase();
  let redirected = false;

  for (let hop = 0; ; hop++) {
    // `request` не ходит по переходам сам — их обрабатывает цикл ниже.
    const res = await request(url, {
      method: method as Dispatcher.HttpMethod,
      headers,
      ...(body === undefined ? {} : { body }),
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.statusCode >= 300 && res.statusCode < 400) {
      const location = res.headers['location'];
      const target = Array.isArray(location) ? location[0] : location;
      // Тело перехода читать незачем, но и бросать поток нельзя — соединение
      // останется занятым до таймаута.
      await res.body.dump();

      if (!target) break;
      if (hop >= maxRedirects) throw new SsrfError('Prea multe redirecționări');

      const next = await assertPublicUrl(new URL(target, url).toString());
      if (!sameOrigin(next, url)) {
        headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => SAFE_ACROSS_ORIGINS.has(name.toLowerCase())),
        );
      }
      // 303, а также 301/302 после POST, продолжаются методом GET — тело
      // при этом отбрасывается, иначе оно уедет на новый хост без запроса.
      if (res.statusCode === 303 || (method !== 'GET' && method !== 'HEAD' && res.statusCode !== 307 && res.statusCode !== 308)) {
        method = 'GET';
        body = undefined;
        delete headers['content-type'];
      }
      url = next;
      redirected = true;
      continue;
    }

    const contentTypeRaw = res.headers['content-type'];
    const contentType = (Array.isArray(contentTypeRaw) ? contentTypeRaw[0] : contentTypeRaw) ?? '';
    const read = await readCapped(res.body, maxBytes);
    return { status: res.statusCode, url: url.toString(), contentType, redirected, ...read };
  }

  // Переход без Location: отвечаем тем, что есть, а не молчанием.
  return { status: 302, url: url.toString(), contentType: '', body: '', truncated: false, redirected };
}

/**
 * Тело читается с потолком. Content-Length не проверяется намеренно: сервер может
 * соврать или не прислать его вовсе, поэтому считается фактически прочитанное,
 * а поток обрывается на месте.
 */
async function readCapped(
  stream: Dispatcher.ResponseData['body'],
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
    if (size + buf.length > maxBytes) {
      chunks.push(buf.subarray(0, maxBytes - size));
      truncated = true;
      break;
    }
    chunks.push(buf);
    size += buf.length;
  }
  if (truncated) await stream.dump().catch(() => undefined);

  return { body: Buffer.concat(chunks).toString('utf8'), truncated };
}
