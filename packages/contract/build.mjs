#!/usr/bin/env node
/**
 * Сборка контракта: манифесты продуктов и ниш → один порождённый файл.
 *
 * ── Зачем порождённый файл, а не чтение YAML на месте ──
 *
 * Сайт собирается статикой на Vercel, движок — эсбилдом в один бандл. Тащить
 * в оба разбор YAML и доступ к файловой системе ради шести коротких записей
 * — работа, которой можно не быть. Порождённый `.ts` импортируется как
 * обычный модуль и на обеих сторонах превращается в константу.
 *
 * ── Зачем он лежит в гите ──
 *
 * Чтобы изменение контракта было ВИДНО в диффе. Правка одной строки в
 * манифесте меняет то, что обещано клиенту; такое должно попадаться на
 * глаза при чтении коммита, а не растворяться в шаге сборки. Ровно та же
 * причина, по которой в гите держат лок-файл.
 *
 * Отсюда и режим `--check`: он пересобирает контракт в память и сравнивает
 * с тем, что на диске. Разошлись — значит манифест правили, а контракт
 * пересобрать забыли, и сборка падает.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PRODUCTS_DIR = join(ROOT, 'apps/engine/src/products');
const VERTICALS_DIR = join(ROOT, 'apps/engine/src/verticals');
const PLANS_TS = join(ROOT, 'apps/engine/src/engine/plans.ts');
const OUT = join(HERE, 'src/generated.ts');

const STATUSES = ['planned', 'beta', 'shipped'];

const fail = (msg) => { console.error(`контракт: ${msg}`); process.exit(1); };

/**
 * Ключи `PlanFeatures` — из самого `plans.ts`, а не списком здесь.
 *
 * Список здесь был бы третьей копией того же знания, а весь смысл контракта
 * в том, чтобы копий не было. Если объявление интерфейса переедет и разбор
 * сломается, это будет громкая ошибка, а не тихо разошедшийся список.
 */
function planFeatureKeys() {
  const src = readFileSync(PLANS_TS, 'utf8');
  const block = src.match(/export interface PlanFeatures \{([\s\S]*?)\n\}/);
  if (!block) fail(`не нашёл объявление PlanFeatures в ${PLANS_TS}`);
  const keys = [...block[1].matchAll(/^\s*(\w+)\s*:\s*boolean\s*;/gm)].map((m) => m[1]);
  if (!keys.length) fail('PlanFeatures разобран, но ключей в нём не оказалось');
  return keys;
}

/** Каталоги с манифестом. Каталог без манифеста пропускается молча: код может лежать и не быть продуктом. */
function manifests(dir, file) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, file)))
    .map((e) => ({ dirName: e.name, path: join(dir, e.name, file) }));
}

function readProducts(features) {
  return manifests(PRODUCTS_DIR, 'product.yaml').map(({ dirName, path }) => {
    const where = `apps/engine/src/products/${dirName}/product.yaml`;
    const m = parse(readFileSync(path, 'utf8'));

    if (m.schema !== 1) fail(`${where}: schema ${m.schema}, а поддерживается 1`);
    if (m.id !== dirName) fail(`${where}: id «${m.id}» не совпадает с именем каталога «${dirName}»`);
    if (!Number.isInteger(m.version) || m.version < 1) fail(`${where}: version должен быть целым от 1`);
    if (!STATUSES.includes(m.status)) fail(`${where}: status «${m.status}», допустимы ${STATUSES.join(', ')}`);
    if (!features.includes(m.feature)) {
      fail(`${where}: feature «${m.feature}» — такого ключа нет в PlanFeatures (${features.join(', ')})`);
    }
    if (typeof m.plan !== 'string' || !m.plan) fail(`${where}: plan обязателен`);

    return {
      id: m.id,
      version: m.version,
      status: m.status,
      feature: m.feature,
      plan: m.plan,
      verticals: Array.isArray(m.verticals) ? m.verticals : [],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function readVerticals() {
  return manifests(VERTICALS_DIR, 'vertical.yaml').map(({ dirName, path }) => {
    const where = `apps/engine/src/verticals/${dirName}/vertical.yaml`;
    const m = parse(readFileSync(path, 'utf8'));
    if (m.schema !== 1) fail(`${where}: schema ${m.schema}, а поддерживается 1`);
    if (m.id !== dirName) fail(`${where}: id «${m.id}» не совпадает с именем каталога «${dirName}»`);
    return { id: m.id, version: m.version ?? 1 };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Ссылка продукта на несуществующую нишу — ошибка: иначе сайт пообещает нишу, которой нет. */
function checkVerticalRefs(products, verticals) {
  const known = new Set(verticals.map((v) => v.id));
  for (const p of products) {
    for (const v of p.verticals) {
      if (!known.has(v)) fail(`продукт «${p.id}» ссылается на нишу «${v}», которой нет в apps/engine/src/verticals`);
    }
  }
}

function render(products, verticals) {
  const j = (x) => JSON.stringify(x, null, 2).replace(/\n/g, '\n  ');
  return `/**
 * ПОРОЖДЁННЫЙ ФАЙЛ. Руками не править.
 *
 * Источник — манифесты \`product.yaml\` и \`vertical.yaml\` рядом с кодом.
 * Пересобрать: npm run contract
 * Проверить:  npm run contract:check
 */

import type { Product, Vertical } from './index.js';

export const PRODUCTS: readonly Product[] = ${j(products)};

export const VERTICALS: readonly Vertical[] = ${j(verticals)};
`;
}

const features = planFeatureKeys();
const products = readProducts(features);
const verticals = readVerticals();
checkVerticalRefs(products, verticals);
const out = render(products, verticals);

if (process.argv.includes('--check')) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (have !== out) {
    fail('порождённый файл отстал от манифестов. Выполните npm run contract и закоммитьте результат.');
  }
  console.log(`контракт актуален: продуктов ${products.length}, ниш ${verticals.length}`);
} else {
  writeFileSync(OUT, out);
  console.log(`контракт собран: продуктов ${products.length}, ниш ${verticals.length}`);
}
