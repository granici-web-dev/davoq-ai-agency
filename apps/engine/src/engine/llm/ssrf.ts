import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Защита от SSRF (§8). Коннектор — это адрес, который вводит тенант, а запрос по нему
 * делает наш сервер изнутри нашей сети. Без проверки любой клиент админки получает
 * сканер внутренних сервисов и доступ к метаданным облака (169.254.169.254).
 */

interface Range {
  cidr: string;
  why: string;
}

const BLOCKED_V4: Range[] = [
  { cidr: '0.0.0.0/8', why: 'această gazdă' },
  { cidr: '10.0.0.0/8', why: 'rețea privată' },
  { cidr: '100.64.0.0/10', why: 'CGNAT' },
  { cidr: '127.0.0.0/8', why: 'adresă loopback' },
  { cidr: '169.254.0.0/16', why: 'link-local și metadate cloud' },
  { cidr: '172.16.0.0/12', why: 'rețea privată' },
  { cidr: '192.0.0.0/24', why: 'interval rezervat IETF' },
  { cidr: '192.168.0.0/16', why: 'rețea privată' },
  { cidr: '198.18.0.0/15', why: 'interval de benchmark' },
  { cidr: '224.0.0.0/4', why: 'multicast' },
  { cidr: '240.0.0.0/4', why: 'interval rezervat' },
];

const toInt = (ip: string): number =>
  ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

function blockedV4(ip: string): string | null {
  const value = toInt(ip);
  for (const { cidr, why } of BLOCKED_V4) {
    const [base, bits] = cidr.split('/') as [string, string];
    const mask = Number(bits) === 0 ? 0 : (-1 << (32 - Number(bits))) >>> 0;
    if ((value & mask) === (toInt(base) & mask)) return why;
  }
  return null;
}

/**
 * Разворачивает IPv4-mapped адрес обратно в v4. Форм две, и это важно:
 * `::ffff:169.254.169.254` записывается точками, но `new URL()` нормализует его
 * в шестнадцатеричное `::ffff:a9fe:a9fe`. Проверка только точечной формы
 * оставляет рабочий обход к метаданным облака — поймано тестом.
 */
function unmapV4(lower: string): string | null {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1]!;

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return null;
  const value = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16);
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}

function blockedV6(ip: string): string | null {
  const lower = ip.toLowerCase();
  const mapped = unmapV4(lower);
  if (mapped) return blockedV4(mapped) ?? null;

  if (lower === '::1' || lower === '::') return 'adresă loopback';
  if (/^f[cd]/.test(lower)) return 'unique local';
  if (/^fe[89ab]/.test(lower)) return 'link-local';
  if (/^ff/.test(lower)) return 'multicast';
  return null;
}

/**
 * Разрешение ходить в петлю — только для разработки: без него нельзя отладить
 * коннектор против локального мока CRM. Флаг намеренно не действует в проде,
 * потому что послабление в защите от SSRF, включаемое переменной окружения, —
 * это ровно тот тип «временной настройки», который однажды уезжает на сервер.
 */
const loopbackAllowed = (): boolean =>
  process.env.SSRF_ALLOW_LOOPBACK === '1' && process.env.NODE_ENV !== 'production';

export function blockedReason(ip: string): string | null {
  if (loopbackAllowed() && (ip === '127.0.0.1' || ip === '::1')) return null;
  const version = isIP(ip);
  if (version === 4) return blockedV4(ip);
  if (version === 6) return blockedV6(ip);
  return 'nu este o adresă IP';
}

export class SsrfError extends Error {}

/**
 * Проверяет адрес до запроса: схема, затем все адреса, в которые резолвится хост.
 * Проверяются ВСЕ записи DNS, а не первая: хост с одной публичной и одной приватной
 * записью иначе проходил бы через раз.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError(`Adresă invalidă: ${raw}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SsrfError(`Protocolul ${url.protocol} nu este permis — doar http și https`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (isIP(host)) {
    const why = blockedReason(host);
    if (why) throw new SsrfError(`Adresa ${host} nu este permisă: ${why}`);
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`Numele ${host} nu a putut fi rezolvat`);
  }

  for (const { address } of addresses) {
    const why = blockedReason(address);
    if (why) throw new SsrfError(`Numele ${host} duce la ${address} — ${why}`);
  }

  return url;
}
