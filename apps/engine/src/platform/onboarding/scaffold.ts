import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadVertical, listVerticals } from '../../engine/prompt/vertical.js';
import { clientDir } from './config.js';

/**
 * Заготовка нового клиента: каталог, конфиг из шаблона ниши, пустая структура
 * базы знаний и чек-лист данных, которые надо запросить.
 *
 * Чек-лист — не формальность. Самая дорогая ошибка при заведении клиента —
 * узнать на третьей неделе пилота, что тканей и сроков доставки нам никто
 * не присылал, а бот всё это время честно отвечал «уточните у менеджера».
 */

export interface ScaffoldResult {
  dir: string;
  configPath: string;
  checklist: string[];
}

export async function scaffoldClient(
  id: string,
  opts: { name: string; vertical: string; domain: string; locale: string },
): Promise<ScaffoldResult> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`идентификатор клиента — строчные латинские буквы, цифры и дефис: «${id}»`);
  }
  const dir = clientDir(id);
  if (existsSync(dir)) throw new Error(`каталог уже существует: ${dir}`);

  // Ниша проверяется до создания каталогов: опечатка в названии не должна
  // оставить на диске половину клиента.
  const vertical = loadVertical(opts.vertical);

  await mkdir(join(dir, 'assets'), { recursive: true });
  // Пустая структура базы знаний — по разделам чек-листа. Клиент присылает
  // файлы, они кладутся в соответствующий каталог, и сразу видно, чего нет.
  for (const section of KNOWLEDGE_SECTIONS) {
    await mkdir(join(dir, 'knowledge', section), { recursive: true });
    await writeFile(join(dir, 'knowledge', section, '.gitkeep'), '');
  }

  const configPath = join(dir, 'config.yaml');
  await writeFile(configPath, renderConfig(id, opts, vertical));
  await writeFile(join(dir, 'README.md'), renderReadme(id, opts, vertical));

  return { dir, configPath, checklist: vertical.onboardingChecklist };
}

const KNOWLEDGE_SECTIONS = ['catalog', 'prices', 'materials', 'delivery', 'faq', 'showrooms'];

function renderConfig(
  id: string,
  o: { name: string; vertical: string; domain: string; locale: string },
  vertical: ReturnType<typeof loadVertical>,
): string {
  return `# Конфигурация клиента «${o.name}».
#
# Это ВХОД онбординга, а не источник правды в рантайме. Команда
# «npm run client apply ${id}» переносит отсюда всё в базу; дальше
# приветствие, тему и адрес для заявок клиент правит сам из панели,
# и повторное применение его правки не затирает.
#
# Секретов здесь нет: токены и ключи шифруются и живут в базе.
schema: 1
id: ${id}
name: ${o.name}

# Ниша. Отсюда приходят правила разговора о цене и сценарий квалификации.
# Известные: ${listVerticals().join(', ')}
vertical: ${o.vertical}
plan: starter

locale:
  default: ${o.locale}
  # Языки, на которых клиент ждёт разговоров. Второй язык здесь ничего
  # не включит: поиск по материалам одноязычен, и загрузка предупредит.
  supported: [${o.locale}]

channels:
  web:
    domains:
      - ${o.domain}
    widget:
      bot_name: Assistant
      # Положите файл в assets/ и укажите путь от каталога клиента.
      # logo: assets/logo.svg
      preset: classic
      position: bottom-right
      welcome:
        ${o.locale}: TODO приветствие на языке клиента

brand:
  # Тон — инструкция МОДЕЛИ, пишется ПО-АНГЛИЙСКИ: системный промпт английский
  # целиком, и чужой язык в нём протекает в ответ посетителю.
  # На каком языке отвечает бот, задаёт locale, а не это поле.
  tone: |
    TODO in English: how formal, how short, what the bot never promises.

catalog:
  # Что боту знать о ценах: где они опубликованы, что считает менеджер.
  price_guidance: |
    TODO

# Сценарий квалификации наследуется от ниши «${vertical.name}».
# Наследуемые поля: ${vertical.qualification.fields.map((f) => f.key).join(', ')}
qualification:
  inherit: true
  # override: [{ key: city, description: "..." }]
  # extra:    [{ key: ..., label: ..., description: ... }]
  # drop:     [filling]

# Факты о клиенте, которые нужны боту в разговоре.
showrooms: []
#  - { city: TODO, address: TODO, hours: TODO }

notifications:
  leads:
    # Куда падают заявки. Пусто — не слать.
    email: ""
    # Отправитель. Домен должен совпадать с доменом клиента, иначе спам.
    from: ""

# Пороги поиска этого клиента поверх порогов ниши
# (${vertical.retrieval.minSimilarity} / ${vertical.retrieval.approvedMinSimilarity}).
retrieval: {}

panel:
  # Экраны, которые клиенту не нужны: kb, connectors, aspect, chats, analytics, install
  hidden_screens: []
`;
}

function renderReadme(
  id: string,
  o: { name: string; vertical: string; domain: string; locale: string },
  vertical: ReturnType<typeof loadVertical>,
): string {
  return `# ${o.name}

Ниша: **${vertical.name}** (\`${o.vertical}\`) · сайт: ${o.domain} · язык: ${o.locale}

## Что сделать

1. Заполнить \`config.yaml\` — всё, где стоит TODO.
2. Сложить материалы в \`knowledge/\` по разделам.
3. Применить: \`npm run client apply ${id}\`
4. Завести пользователя панели: \`npm run cli create-user <tenantId> <email> <пароль>\`
5. Отдать клиенту сниппет из раздела «Instalare».

## Что запросить у клиента

${vertical.onboardingChecklist.map((x) => `- [ ] ${x}`).join('\n')}

## Что здесь НЕ хранится

Секреты. Токен Google Drive и ключи коннекторов шифруются \`SECRETS_KEY\`
и лежат в базе — клиент подключает их сам из панели.
`;
}
