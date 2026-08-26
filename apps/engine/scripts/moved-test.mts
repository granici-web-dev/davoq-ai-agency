/**
 * Страница на месте снесённой панели действительно уводит куда надо.
 *
 * Скрипт переадресации собирается строками, поэтому ни типы, ни сборка про
 * него ничего не знают. Здесь он исполняется с подставным `location` — так же,
 * как его исполнит браузер, — и проверяется, куда он уводит.
 *
 *   npm run test:moved
 */
import { movedPage, redirectScript } from '../src/engine/admin/moved.js';

const PORTAL = 'https://cabinet.example';

interface Case {
  why: string;
  hash: string;
  query?: string;
  expect: string;
}

const CASES: Case[] = [
  {
    why: 'ссылка из уже отправленного письма о заявке',
    hash: '#chats/9f1c2a7b-4d5e',
    expect: `${PORTAL}/agents/chatbot/conversations?conversation=9f1c2a7b-4d5e`,
  },
  {
    why: 'возврат из кассы Stripe по старому адресу',
    hash: '#subscription',
    expect: `${PORTAL}/subscription`,
  },
  {
    why: 'ссылка из нового письма — строкой запроса, без якоря',
    hash: '',
    query: '?conversation=abc12345',
    expect: `${PORTAL}?conversation=abc12345`,
  },
  {
    why: 'закладка на панель',
    hash: '',
    expect: PORTAL,
  },
  {
    why: 'чужой якорь не уводит наружу',
    hash: '#//evil.example',
    expect: PORTAL,
  },
];

let failed = 0;

for (const c of CASES) {
  const body = redirectScript(PORTAL, c.query ?? '');
  let got: string | null = null;
  const location = { hash: c.hash, replace: (url: string) => { got = url; } };
  new Function('location', body)(location);

  if (got === c.expect) {
    console.log(`  ✓ ${c.why}`);
  } else {
    console.log(`  ✗ ${c.why}\n      якорь ${JSON.stringify(c.hash)} → ${got}\n      ждали  ${c.expect}`);
    failed += 1;
  }
}

// Страница обязана работать и без скриптов: ссылка в разметке — вторая дорога.
const page = movedPage(PORTAL, '');
if (!page.includes(`href="${PORTAL}"`)) {
  console.log('  ✗ на странице нет обычной ссылки — с выключенными скриптами это тупик');
  failed += 1;
} else {
  console.log('  ✓ есть обычная ссылка на случай выключенных скриптов');
}

console.log(failed ? `\nпровалено: ${failed}` : `\nвсе ${CASES.length + 1} проверки пройдены`);
process.exit(failed ? 1 : 0);
