#!/usr/bin/env node
/**
 * Перенос в dist того, что не компилируется: разметки панели, шрифтов
 * и шаблонов ниш.
 *
 * Разметка панели и шрифты — это ИСХОДНИКИ, а не результат сборки, и лежат
 * они в src/engine/admin/static. До этого скрипта они лежали прямо в dist,
 * который целиком в .gitignore: то есть вся вёрстка панели и самостоятельно
 * захостенные шрифты существовали ровно на одной машине и ни в один клон
 * репозитория не попадали. Свежая сборка отдавала бы 404 на /admin.
 *
 * Обнаружено при подготовке развёртывания, а не потерей — но потеря была
 * вопросом времени.
 *
 * Шрифты отдаются с нашего сервера намеренно: продукт продаётся как
 * DSGVO-native, и обращение браузера клиента к fonts.gstatic.com этому
 * противоречит.
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const from = join(root, 'src/engine/admin/static');
const to = join(root, 'dist');

await mkdir(to, { recursive: true });
await cp(join(from, 'index.html'), join(to, 'admin.html'));
await cp(join(from, 'fonts'), join(to, 'fonts'), { recursive: true });

// Шаблоны ниш — это YAML и Markdown, компилятор их не видит и в dist не кладёт.
// Загрузчик ищет их рядом с собой (`../../verticals` от `engine/prompt/`),
// поэтому в собранном виде каталог обязан лежать в dist. Без этого сервер
// поднимается, отдаёт статику и падает на ПЕРВОМ же сообщении посетителя:
// «вертикаль furniture не найдена». Поймано сборкой, а не чтением.
await cp(join(root, 'src/verticals'), join(to, 'verticals'), { recursive: true });

const fonts = await readdir(join(to, 'fonts'));
const verticals = await readdir(join(to, 'verticals'));
console.log(
  `статика: admin.html, ${fonts.length} шрифт(ов), ниши: ${verticals.join(', ')}`,
);
