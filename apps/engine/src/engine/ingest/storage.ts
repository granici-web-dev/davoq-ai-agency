import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Локальное хранилище файлов. §7 предполагает S3; интерфейс здесь такой, чтобы
 * замена не задела вызывающий код — наружу торчат только ключ и байты.
 */
const ROOT = resolve(process.env.STORAGE_DIR ?? 'var/uploads');

export function storageKey(tenantId: string, documentId: string, ext: string): string {
  return `${tenantId}/${documentId}${ext}`;
}

/** Ключ приходит из базы, но собирается из uuid — проверка на выход за корень дешёвая. */
function pathFor(key: string): string {
  const full = resolve(join(ROOT, key));
  if (!full.startsWith(ROOT + '/')) throw new Error(`storage: invalid key ${key}`);
  return full;
}

export async function put(key: string, data: Buffer): Promise<void> {
  const path = pathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export const get = (key: string): Promise<Buffer> => readFile(pathFor(key));

/**
 * Абсолютный путь по ключу.
 *
 * Нужен там, где файл читает НЕ наш код: react-pdf открывает картинки и шрифты
 * сам, по пути. Проверка выхода за корень та же, что у чтения, — путь наружу
 * не отдаётся, он ложится в конфиг тенанта на сервере.
 */
export const absolute = (key: string): string => pathFor(key);

export async function remove(key: string): Promise<void> {
  await unlink(pathFor(key)).catch(() => undefined);
}
