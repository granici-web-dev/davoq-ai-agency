/**
 * Статика в dist.
 *
 * Шаблоны ниш — это YAML и Markdown, компилятор их не видит и в dist не кладёт.
 * Загрузчик ищет их рядом с собой (`../../verticals` от `engine/prompt/`),
 * поэтому в собранном виде каталог обязан лежать в dist. Без этого сервер
 * поднимается и падает на ПЕРВОМ же сообщении посетителя: «вертикаль furniture
 * не найдена». Поймано сборкой, а не чтением.
 *
 * Раньше сюда же копировались разметка и шрифты панели. Панель снесена —
 * кабинет один, и он в портале.
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const to = join(root, 'dist');

await mkdir(to, { recursive: true });

// Шаблоны ниш — это YAML и Markdown, компилятор их не видит и в dist не кладёт.
// Загрузчик ищет их рядом с собой (`../../verticals` от `engine/prompt/`),
// поэтому в собранном виде каталог обязан лежать в dist. Без этого сервер
// поднимается, отдаёт статику и падает на ПЕРВОМ же сообщении посетителя:
// «вертикаль furniture не найдена». Поймано сборкой, а не чтением.
await cp(join(root, 'src/verticals'), join(to, 'verticals'), { recursive: true });

const verticals = await readdir(join(to, 'verticals'));
console.log(`статика: ниши: ${verticals.join(', ')}`);
