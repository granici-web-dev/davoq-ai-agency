/**
 * Пережимает скачанный из Higgsfield PNG в один WebP, который и лежит
 * в public/images/ как единственный исходник.
 *
 * Почему один файл, а не набор размеров: next/image сам нарезает варианты
 * под ширину экрана. Держать рядом ещё и webp, и три размера значит
 * поддерживать вручную то, что фреймворк делает на сборке — и однажды
 * забыть обновить один из пяти файлов.
 *
 * Исходник — WebP, а не AVIF, хотя AVIF на этих тёмных кадрах жмёт вдвое
 * лучше. Причина не в качестве: Turbopack не умеет читать метаданные AVIF
 * при статическом импорте, поэтому такой файл не получает ни размеров в
 * разметке, ни нарезки по ширине экрана — и уезжает на телефон целиком.
 * WebP он читает, а AVIF next/image соберёт сам на выдаче: в next.config
 * он стоит первым в `formats`. Так выигрыш AVIF достаётся браузеру,
 * а сборка не ломается.
 *
 *   node scripts/optimize-image.mjs public/images/hero-home.png
 */
import sharp from 'sharp';
import { stat, unlink } from 'node:fs/promises';
import { basename } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/optimize-image.mjs <file.png> [--keep]');
  process.exit(1);
}
const keep = process.argv.includes('--keep');
const out = src.replace(/\.png$/i, '.webp');

const before = (await stat(src)).size;
const meta = await sharp(src).metadata();

await sharp(src)
  // Качество 82 — граница, за которой на этих сценах появляется полосатость
  // в градиенте неба. Ниже не опускать: небо занимает треть кадра.
  .webp({ quality: 82, effort: 6 })
  .toFile(out);

const after = (await stat(out)).size;
if (!keep) await unlink(src);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(
  `${basename(out)}  ${meta.width}×${meta.height}  ` +
    `${kb(before)} → ${kb(after)}  (${Math.round((1 - after / before) * 100)}% меньше)`,
);
