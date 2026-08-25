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
const MESSAGES = ['ro', 'en'].map((l) => ({ locale: l, path: join(ROOT, `apps/site/messages/${l}.json`) }));

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


const TIERS = ['starter', 'pro'];

/**
 * Вилки агента.
 *
 * Блока может не быть: продукт заведён, а цену ещё не посчитали. Это законное
 * состояние — сайт покажет агента без цены, — но только пока он не продаётся.
 * У `shipped` цена обязана быть, иначе витрина обещает то, чего нельзя купить.
 *
 * Числа проверяются здесь, а тексты к ключам `features` — ниже, по messages
 * сайта. Разделение намеренное: число одинаково на всех языках, текст нет.
 */
function readTiers(m, where, status) {
  if (m.tiers === undefined) {
    if (status === 'shipped') {
      fail(`${where}: продукт продаётся (status: shipped), но блока tiers нет — витрине нечего показать`);
    }
    return undefined;
  }
  const out = {};
  for (const name of TIERS) {
    const t = m.tiers[name];
    if (!t) fail(`${where}: в tiers нет вилки «${name}» — их должно быть две: ${TIERS.join(', ')}`);
    for (const k of ['price', 'setup']) {
      if (!Number.isFinite(t[k]) || t[k] < 0) fail(`${where}: tiers.${name}.${k} должен быть числом от нуля`);
    }
    const limits = t.limits ?? {};
    for (const [k, v] of Object.entries(limits)) {
      if (!Number.isFinite(v) || v < 0) fail(`${where}: tiers.${name}.limits.${k} должен быть числом от нуля`);
    }
    out[name] = {
      price: t.price,
      setup: t.setup,
      limits,
      features: Array.isArray(t.features) ? t.features : [],
    };
  }
  /* Pro, который не больше Starter, — это не вилка, а две одинаковые
     карточки рядом. Ловится здесь, потому что заметить это глазами
     на витрине уже поздно. */
  if (out.pro.price <= out.starter.price) {
    fail(`${where}: Pro (${out.pro.price}) не дороже Starter (${out.starter.price}) — вилки нет`);
  }
  for (const [k, v] of Object.entries(out.starter.limits)) {
    const hi = out.pro.limits[k];
    if (hi !== undefined && hi < v) fail(`${where}: limits.${k} у Pro (${hi}) меньше, чем у Starter (${v})`);
  }
  return out;
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
    /* `plan` необязателен, и это не послабление. Он описывает СТАРУЮ модель
       — платформенный тариф, внутри которого продукт был доступен. Продукт,
       заведённый уже под поагентную продажу, в той лестнице не стоял никогда,
       и выдуманное значение здесь было бы хуже пустоты. Когда биллинг
       переведут, поле уйдёт у всех. */
    if (m.plan !== undefined && (typeof m.plan !== 'string' || !m.plan)) {
      fail(`${where}: plan задан, но пуст — уберите поле или впишите тариф`);
    }

    const tiers = readTiers(m, where, m.status);

    return {
      id: m.id,
      version: m.version,
      status: m.status,
      feature: m.feature,
      ...(m.plan === undefined ? {} : { plan: m.plan }),
      verticals: Array.isArray(m.verticals) ? m.verticals : [],
      ...(tiers ? { tiers } : {}),
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


/**
 * У каждого ключа вилки должен быть текст на сайте — на обоих языках.
 *
 * Это вторая половина договорённости. Первая — сайт не может обещать то,
 * чего нет в манифесте. Эта — манифест не может объявить то, что сайту
 * нечем показать: ключ без текста вылезет на витрину пустой строкой либо
 * сырым `tiers.pro.features.twoLanguages`, и увидит это клиент, а не мы.
 *
 * Ровно тот же вопрос задаётся в обе стороны, поэтому и живёт в контракте,
 * а не в сборке одной из сторон.
 */
function checkTierCopy(products) {
  const files = [];
  for (const { locale, path } of MESSAGES) {
    if (!existsSync(path)) fail(`не нашёл ${path} — сверять тексты вилок не с чем`);
    files.push({ locale, data: JSON.parse(readFileSync(path, 'utf8')) });
  }
  const missing = [];
  for (const p of products) {
    if (!p.tiers) continue;

    /* Подпись к лимиту — одна на продукт, а не на вилку: у Starter и Pro
       меняется число, а единица («оферты в месяц») та же. Держать её дважды
       значило бы дать им разойтись. Возможности, наоборот, у вилок разные,
       но ключ уникален внутри продукта, и нести его через вилку незачем. */
    const limitKeys = new Set();
    const featureKeys = new Set();
    for (const t of Object.values(p.tiers)) {
      Object.keys(t.limits).forEach((k) => limitKeys.add(k));
      t.features.forEach((k) => featureKeys.add(k));
    }

    for (const { locale, data } of files) {
      const at = data?.agentPricing?.[p.id] ?? {};
      const text = (o, k) => (typeof o?.[k] === 'string' && o[k].trim() ? null : k);
      for (const k of limitKeys) {
        if (text(at.limits, k)) missing.push(`${locale}: agentPricing.${p.id}.limits.${k}`);
      }
      for (const k of featureKeys) {
        if (text(at.features, k)) missing.push(`${locale}: agentPricing.${p.id}.features.${k}`);
      }
    }
  }
  if (missing.length) {
    fail(`нет текстов для ключей вилок (${missing.length}):\n  ` + missing.slice(0, 12).join('\n  '));
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
checkTierCopy(products);
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
