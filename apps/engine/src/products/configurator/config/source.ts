import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import type { Json } from './layers.js';

/**
 * Чтение слоя конфигуратора с диска.
 *
 * Общее для всех секций (`offer`, `flow`, `pricing`): один и тот же файл
 * `configurator.yaml` у ниши и у клиента, одна и та же проверка версии схемы,
 * одно и то же правило «путь не выходит за каталог слоя».
 *
 * Секции разбирают этот объект каждая по-своему, но читают его отсюда:
 * иначе вторая секция принесла бы свою копию правил, и через полгода они
 * разошлись бы — например, в том, что считать выходом за каталог.
 */

export const VERTICALS_ROOT = resolve(
  process.env.VERTICALS_DIR ?? new URL('../../../verticals', import.meta.url).pathname,
);

/** Ссылка на файл — только с явным префиксом: иначе обычный текст с точкой стал бы путём. */
export const FILE_PREFIX = 'file:';

/** Абсолютный путь к файлу внутри каталога слоя. Выход за каталог — ошибка. */
export function inside(dir: string, rel: string, where: string): string {
  const full = resolve(join(dir, rel));
  if (!full.startsWith(resolve(dir) + '/')) {
    throw new Error(`${where}: путь «${rel}» выходит за каталог слоя`);
  }
  if (!existsSync(full)) throw new Error(`${where}: файл «${rel}» не найден`);
  return full;
}

export interface Layer {
  raw: Record<string, Json>;
  dir: string;
  where: string;
}

/** Слой ниши. Ниша не задана или не завела конфигуратор — законное состояние. */
export function verticalLayer(verticalId: string | null | undefined): Layer | undefined {
  if (!verticalId) return undefined;
  const dir = join(VERTICALS_ROOT, verticalId);
  return read(dir, `${verticalId}/configurator.yaml`);
}

/** Слой клиента с диска. Из базы придёт тот же объект — тогда этот шаг пропускается. */
export function clientLayer(clientDir: string): Layer | undefined {
  return read(clientDir, `${clientDir}/configurator.yaml`);
}

function read(dir: string, where: string): Layer | undefined {
  const file = join(dir, 'configurator.yaml');
  if (!existsSync(file)) return undefined;
  const raw = (parse(readFileSync(file, 'utf8')) ?? {}) as Record<string, Json>;
  if (raw.schema !== 1) throw new Error(`${where}: поддерживается только schema: 1`);
  return { raw, dir, where };
}
