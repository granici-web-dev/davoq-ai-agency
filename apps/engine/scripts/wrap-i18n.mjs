#!/usr/bin/env node
/**
 * Одноразовый инструмент: оборачивает румынские строки панели в t().
 *
 * Разбирает файл компилятором TypeScript, а не регулярками. Первая попытка была
 * регулярками и сломала JSX на первой же стрелочной функции: `=>` содержит `>`,
 * и шаблон `>текст<` радостно съел половину разметки.
 *
 *   node scripts/wrap-i18n.mjs src/engine/admin/main.tsx [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const file = process.argv[2];
const write = process.argv.includes('--write');
if (!file) throw new Error('usage: wrap-i18n.mjs <file> [--write]');

const source = readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

const RO = /[ăâîșțĂÂÎȘȚ]/;
const WORDS = /\b(?:Salvează|Salvat|Șterge|Adaugă|Trimite|Trimis|Netrimis|Conversații|Analize|Instalare|Aspect|Cereri|Întrebări|Nume|Email|Telefon|Când|Stare|Copiat|Copiază|Înapoi|Ieșire|Parola|Intră|Verifică|Sincronizează|Aprobă|Aprobat|Corectează|Anulează|Bot|Vizitator|Fragmente|Indexat|Consum|Previzualizare|Culori|Bază|Conectori|Drive|Google|Toate|Nicio|Niciun)\b/;
const isRo = (s) => RO.test(s) || WORDS.test(s);

const edits = [];
const keys = new Set();

/** Текст внутри элемента: <h2>Cereri</h2> → <h2>{t('Cereri')}</h2> */
function jsxText(node) {
  const raw = node.getText(sf);
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || !isRo(text)) return;
  // Отступы вокруг текста сохраняем: они держат форматирование разметки.
  const lead = raw.match(/^\s*/)[0];
  const tail = raw.match(/\s*$/)[0];
  keys.add(text);
  edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `${lead}{t(${quote(text)})}${tail}` });
}

/** Строковый литерал: placeholder="…", 'Se încarcă…' */
function stringLike(node) {
  const text = node.text;
  if (!text || !isRo(text)) return;
  // Многострочное — не подпись на кнопке: заворачивать нечего, а кавычки поедут.
  if (text.includes('\n')) return;
  const parent = node.parent;
  // Импорты и ключи объектов не трогаем — там строка не текст для человека.
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return;
  keys.add(text);
  // В JSX-атрибуте значение обязано быть выражением: title={t('…')}
  const wrapped = `t(${quote(text)})`;
  const replacement = ts.isJsxAttribute(parent) ? `{${wrapped}}` : wrapped;
  edits.push({ start: node.getStart(sf), end: node.getEnd(), text: replacement });
}

const quote = (s) => (s.includes("'") ? `"${s.replace(/"/g, '\\"')}"` : `'${s}'`);

function walk(node) {
  if (node.kind === ts.SyntaxKind.JsxText) jsxText(node);
  else if (ts.isStringLiteral(node)) stringLike(node);
  // Шаблонные строки не трогаем: единственная румынская среди них — пример
  // JSON-схемы коннектора, то есть значение по умолчанию, а не текст интерфейса.

  ts.forEachChild(node, walk);
}
walk(sf);

// Правки применяются с конца: иначе каждая сдвигает позиции следующих.
edits.sort((a, b) => b.start - a.start);
let out = source;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

if (!/from '\.\/i18n\.js'/.test(out)) {
  out = out.replace(
    /(import .* from '\.\/preview\.js';)/,
    "$1\nimport { setPanelLocale, t } from './i18n.js';",
  );
}

console.log(`строк найдено: ${keys.size}, правок: ${edits.length}`);
if (write) {
  writeFileSync(file, out);
  writeFileSync('/tmp/i18n-keys.json', JSON.stringify([...keys].sort(), null, 1));
  console.log('записано');
} else {
  console.log([...keys].sort().slice(0, 15).map((k) => `  • ${k.slice(0, 70)}`).join('\n'));
}
