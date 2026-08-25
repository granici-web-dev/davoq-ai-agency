import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { absolute } from '../../engine/ingest/storage.js';
import type { Json } from './config/layers.js';

/**
 * Перенос слоя клиента из каталога онбординга в базу.
 *
 * В рантайме каталога `clients/<id>` нет: на сервере лежит только jsonb.
 * Значит всё, что в YAML было ссылкой на файл, здесь обязано превратиться
 * в то, что переживёт переезд:
 *   картинки и шрифты — в хранилище тенанта, в конфиг ложится путь к файлу;
 *   `file:` в текстах и промпт агента — в само содержимое.
 *
 * Пропустить это значит записать в базу конфиг, который собирается на машине
 * разработчика и падает на сервере словами «файл assets/logo.svg не найден».
 */

/** Что нужно положить в хранилище рядом с записью конфига. */
export interface ConfiguratorAsset { key: string; content: Buffer }

export interface ConfiguratorLayer {
  layer: Record<string, Json>;
  assets: ConfiguratorAsset[];
}

const FILE_PREFIX = 'file:';

/**
 * Имя в хранилище — хеш ОТНОСИТЕЛЬНОГО пути, а не имя файла.
 *
 * Два шага могут ссылаться на `models/x.jpg` и `fabrics/x.jpg`: по имени они
 * склеились бы в один файл, и половина карточек показала бы чужую картинку.
 * Хеш заодно убирает из каталога хранилища осмысленные имена — по нему нельзя
 * прочитать, что за товар у клиента.
 */
const storedName = (rel: string): string =>
  createHash('sha1').update(rel).digest('hex').slice(0, 16) + extname(rel).toLowerCase();

export function configuratorLayer(
  clientDir: string, tenantId: string,
): ConfiguratorLayer | null {
  const file = join(clientDir, 'configurator.yaml');
  if (!existsSync(file)) return null;

  const raw = (parse(readFileSync(file, 'utf8')) ?? {}) as Record<string, Json>;
  if (raw.schema !== 1) throw new Error(`${file}: поддерживается только schema: 1`);

  const assets: ConfiguratorAsset[] = [];
  const seen = new Set<string>();

  /** Копирует файл в хранилище и возвращает путь, по которому его прочтёт сервер. */
  const asset = (rel: string, where: string): string => {
    const full = resolve(join(clientDir, rel));
    if (!full.startsWith(resolve(clientDir) + '/')) {
      throw new Error(`${where}: путь «${rel}» выходит за каталог клиента`);
    }
    if (!existsSync(full)) throw new Error(`${where}: файл «${rel}» не найден`);
    const key = `${tenantId}/configurator/${storedName(rel)}`;
    if (!seen.has(key)) {
      seen.add(key);
      assets.push({ key, content: readFileSync(full) });
    }
    return absolute(key);
  };

  const inline = (value: string, where: string): string => {
    const rel = value.slice(FILE_PREFIX.length);
    const full = resolve(join(clientDir, rel));
    if (!full.startsWith(resolve(clientDir) + '/')) {
      throw new Error(`${where}: путь «${rel}» выходит за каталог клиента`);
    }
    if (!existsSync(full)) throw new Error(`${where}: файл «${rel}» не найден`);
    return readFileSync(full, 'utf8').trimEnd();
  };

  const layer: Record<string, Json> = {};

  // ── Бланк ────────────────────────────────────────────────────────────────
  const offer = obj(raw.offer);
  if (offer) {
    const out: Record<string, Json> = { ...offer };
    if (typeof out.logo === 'string') out.logo = asset(out.logo, 'offer.logo');

    const hero = obj(out.hero);
    if (hero) {
      const h = { ...hero };
      for (const key of ['image', 'logo'] as const) {
        if (typeof h[key] === 'string') h[key] = asset(h[key] as string, `offer.hero.${key}`);
      }
      out.hero = h;
    }

    if (Array.isArray(out.gallery)) {
      out.gallery = out.gallery.map((f, i) =>
        typeof f === 'string' ? asset(f, `offer.gallery[${i}]`) : f);
    }

    const theme = obj(out.theme);
    if (theme && Array.isArray(theme.fonts)) {
      out.theme = {
        ...theme,
        fonts: theme.fonts.map((f, i) => {
          const font = obj(f);
          if (!font) return f;
          const next = { ...font };
          if (typeof next.src === 'string') {
            next.src = asset(next.src, `offer.theme.fonts[${i}].src`);
          }
          return next;
        }),
      };
    }

    const text = obj(out.text);
    if (text) {
      const locales: Record<string, Json> = {};
      for (const [locale, block] of Object.entries(text)) {
        const section = obj(block);
        if (!section) { locales[locale] = block; continue; }
        const resolvedBlock: Record<string, Json> = {};
        for (const [key, value] of Object.entries(section)) {
          resolvedBlock[key] = typeof value === 'string' && value.startsWith(FILE_PREFIX)
            ? inline(value, `offer.text.${locale}.${key}`)
            : value;
        }
        locales[locale] = resolvedBlock;
      }
      out.text = locales;
    }

    layer.offer = out;
  }

  // ── Флоу ─────────────────────────────────────────────────────────────────
  const flow = obj(raw.flow);
  if (flow) {
    const out = { ...flow };
    if (Array.isArray(out.steps)) {
      out.steps = out.steps.map((rawStep, i) => {
        const step = obj(rawStep);
        if (!step || !Array.isArray(step.options)) return rawStep;
        return {
          ...step,
          options: step.options.map((rawOption, j) => {
            const option = obj(rawOption);
            if (!option || typeof option.image !== 'string') return rawOption;
            return {
              ...option,
              image: asset(option.image, `flow.steps[${i}].options[${j}].image`),
            };
          }),
        };
      });
    }
    layer.flow = out;
  }

  if (raw.pricing !== undefined) layer.pricing = raw.pricing;
  if (raw.promotions !== undefined) layer.promotions = raw.promotions;

  // ── Агент ────────────────────────────────────────────────────────────────
  //
  // Промпт ложится ТЕКСТОМ: файла на сервере нет, а читать его при каждом
  // вопросе посетителя было бы обращением к диску на горячем пути.
  const agent = obj(raw.agent);
  if (agent) {
    const out = { ...agent };
    if (typeof out.prompt === 'string') {
      out.prompt = inline(
        out.prompt.startsWith(FILE_PREFIX) ? out.prompt : FILE_PREFIX + out.prompt,
        'agent.prompt',
      );
    }
    layer.agent = out;
  }

  return Object.keys(layer).length > 0 ? { layer, assets } : null;
}

const obj = (v: Json | undefined): Record<string, Json> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : null;
