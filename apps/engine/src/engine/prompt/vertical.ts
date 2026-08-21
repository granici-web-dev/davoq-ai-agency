import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

/**
 * Загрузка шаблонов вертикалей.
 *
 * Вертикаль — это то, что одинаково у всех клиентов ниши: правила разговора
 * о цене, сценарий квалификации, пороги поиска. Живёт файлами в репозитории,
 * а не в базе, ровно по одной причине: шаблон правим мы и версионируем вместе
 * с кодом, а конфигурацию клиента правит клиент. Смешать эти две вещи в одной
 * таблице значит однажды затереть чужую правку своим релизом.
 *
 * Читается один раз при старте процесса: файлы меняются с деплоем, а не в рантайме.
 */

export interface QualificationField {
  key: string;
  label: string;
  description: string;
}

export interface Vertical {
  id: string;
  version: number;
  name: string;
  /** Готовый текст блоков промпта, уже прочитанный с диска. */
  prompt: { price: string; qualification: string };
  qualification: { goal: string; fields: QualificationField[] };
  retrieval: { minSimilarity: number; approvedMinSimilarity: number };
  onboardingChecklist: string[];
}

/**
 * Каталог вертикалей. Вне `src/engine` намеренно: движок читает вертикали,
 * но не является одной из них.
 */
const ROOT = resolve(
  process.env.VERTICALS_DIR ?? new URL('../../verticals', import.meta.url).pathname,
);

const cache = new Map<string, Vertical>();

export function listVerticals(): string[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, 'vertical.yaml')))
    .map((e) => e.name)
    .sort();
}

/**
 * Схема проверяется руками, а не библиотекой валидации: правил десяток,
 * а зависимость тянуть ради них не стоит. Важно другое — падать на загрузке
 * с внятным текстом, а не отдавать в промпт `undefined` и выяснять это
 * по странным ответам бота через неделю.
 */
export function loadVertical(id: string): Vertical {
  const cached = cache.get(id);
  if (cached) return cached;

  const dir = join(ROOT, id);
  const file = join(dir, 'vertical.yaml');
  if (!existsSync(file)) {
    throw new Error(
      `вертикаль «${id}» не найдена в ${ROOT}. Известные: ${listVerticals().join(', ') || '—'}`,
    );
  }

  const raw: unknown = parse(readFileSync(file, 'utf8'));
  const v = raw as Record<string, unknown>;
  const where = `${id}/vertical.yaml`;

  if (v.schema !== 1) throw new Error(`${where}: поддерживается только schema: 1`);
  if (v.id !== id) throw new Error(`${where}: id «${String(v.id)}» не совпадает с каталогом «${id}»`);

  const prompt = v.prompt as Record<string, string> | undefined;
  if (!prompt?.price || !prompt.qualification) {
    throw new Error(`${where}: нужны prompt.price и prompt.qualification`);
  }

  const q = v.qualification as { goal?: string; fields?: unknown[] } | undefined;
  if (!Array.isArray(q?.fields) || q.fields.length === 0) {
    throw new Error(`${where}: qualification.fields не может быть пустым`);
  }
  const fields = q.fields.map((f, i) => {
    const field = f as Partial<QualificationField>;
    if (!field.key || !field.label || !field.description) {
      throw new Error(`${where}: qualification.fields[${i}] — нужны key, label, description`);
    }
    return { key: field.key, label: field.label, description: field.description };
  });

  const r = (v.retrieval ?? {}) as { min_similarity?: number; approved_min_similarity?: number };

  const vertical: Vertical = {
    id,
    version: Number(v.version ?? 1),
    name: String(v.name ?? id),
    prompt: {
      price: readBlock(dir, prompt.price, where),
      qualification: readBlock(dir, prompt.qualification, where),
    },
    qualification: { goal: String(q.goal ?? 'lead'), fields },
    retrieval: {
      minSimilarity: r.min_similarity ?? 0.35,
      approvedMinSimilarity: r.approved_min_similarity ?? 0.3,
    },
    onboardingChecklist: (v.onboarding_checklist as string[] | undefined) ?? [],
  };

  cache.set(id, vertical);
  return vertical;
}

/** Путь блока не должен выводить за каталог вертикали — файлы читаются по имени из YAML. */
function readBlock(dir: string, rel: string, where: string): string {
  const full = resolve(join(dir, rel));
  if (!full.startsWith(resolve(dir) + '/')) {
    throw new Error(`${where}: путь «${rel}» выходит за каталог вертикали`);
  }
  if (!existsSync(full)) throw new Error(`${where}: файл «${rel}» не найден`);
  // Хвостовой перевод строки снимается здесь: блоки склеиваются движком,
  // и лишняя пустая строка между ними меняет промпт без причины.
  return readFileSync(full, 'utf8').replace(/\n+$/, '');
}

/**
 * Удобная обёртка для вызывающего кода: у тенанта ниша может быть не задана,
 * и это законное состояние — бот тогда просто отвечает по материалам.
 */
export const verticalOf = (id: string | null | undefined): Vertical | undefined =>
  id ? loadVertical(id) : undefined;
