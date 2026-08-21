import { randomBytes, createHash, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string, salt: Buffer, keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Параметры хранятся внутри хеша: без них нельзя перехешировать пароли при ужесточении.
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEYLEN = 32;

/**
 * scrypt требует 128·N·r байт — при N=2^15 это ровно 32 МБ, то есть впритык
 * к дефолтному потолку Node, и вызов падает на ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
 * Потолок задаём явно с запасом; это ограничение рантайма, а не параметр хеша,
 * поэтому в строку хеша оно не пишется.
 */
const maxmemFor = (N: number, r: number): number => 256 * N * r;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { ...PARAMS, maxmem: maxmemFor(PARAMS.N, PARAMS.r) });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !key) return false;

  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: maxmemFor(Number(n), Number(r)),
  });
  // Сравнение постоянного времени: обычное === утекает длину общего префикса.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** В базе лежит только хеш токена: утечка таблицы сессий не даёт войти. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const newToken = (): string => randomBytes(32).toString('base64url');

export const SESSION_COOKIE = 'aw_session';
export const SESSION_TTL_DAYS = 14;

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  // HttpOnly — токен недоступен скриптам, значит XSS его не украдёт.
  // SameSite=Strict — админка ничего не встраивает, кросс-сайтовые запросы ей не нужны.
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  return flags.join('; ');
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
