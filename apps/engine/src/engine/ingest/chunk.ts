import type { Block } from './extract.js';
import { splitQa } from './qa.js';
import { sanitizeText } from '../shared/text.js';

export interface Chunk {
  seq: number;
  content: string;
  tokenCount: number;
  metadata: { headingPath: string[] };
}

/**
 * Оценка длины в токенах по символам. Точный счёт потребовал бы обращения к API
 * на каждый чанк — на корпусе в тысячи кусков это заметные деньги и время ради
 * решения «резать здесь или на строку ниже». Для нарезки достаточно приближения;
 * фактический расход считается по usage в ответе модели.
 */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

const TARGET = 400; // §7: целевой размер 300–500 токенов
const MAX = 500;
const OVERLAP = 50;

const render = (headingPath: string[], text: string): string =>
  headingPath.length ? `${headingPath.join(' > ')}\n${text}` : text;

/**
 * Нарезка по §7: heading-aware, 300–500 токенов, перекрытие 50.
 *
 * Граница раздела всегда рвёт чанк, даже если места оставалось много. Иначе короткая
 * страница схлопывается в один кусок, где «Гарантия», «Доставка» и «Оплата» лежат
 * вперемешку под заголовком вступления, и ретрив по любому из этих вопросов
 * возвращает всё сразу — то есть ничего.
 *
 * Перекрытие действует только внутри раздела: перенос хвоста через границу
 * притащил бы в раздел про оплату конец раздела про доставку.
 */
export function chunkBlocks(blocks: Block[]): Chunk[] {
  const chunks: Chunk[] = [];

  // Документ без единого заголовка не даёт нарезке ни одной границы, и всё
  // сливается в куски по 400 токенов. Такие файлы режем мельче: у них структура
  // либо в парах «вопрос-ответ», либо её нет вовсе, и тогда мельче безопаснее.
  const flat = blocks.every((b) => b.headingPath.length === 0);

  for (const group of groupByHeading(blocks)) {
    for (const text of packGroup(group.blocks, flat)) {
      chunks.push({
        seq: chunks.length,
        // Чистка здесь, а не у записи: PDF и .doc приносят нулевой байт
        // регулярно, а база отвергает не строку, а всю команду вставки —
        // то есть один такой фрагмент валил бы весь документ.
        content: sanitizeText(render(group.headingPath, text)),
        tokenCount: estimateTokens(render(group.headingPath, text)),
        metadata: { headingPath: group.headingPath },
      });
    }
  }
  return chunks;
}

interface Group {
  headingPath: string[];
  blocks: Block[];
}

/** Подряд идущие блоки с одинаковым путём заголовков — один раздел. */
function groupByHeading(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (last && samePath(last.headingPath, block.headingPath)) last.blocks.push(block);
    else groups.push({ headingPath: block.headingPath, blocks: [block] });
  }
  return groups;
}

const samePath = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Пакует блоки одного раздела. Если раздел устроен как список вопросов и ответов,
 * границей становится пара, а не размер: искать ответ про рассрочку в куске,
 * где рядом лежат возврат и доставка, — значит тянуть в контекст лишнее.
 */
function packGroup(blocks: Block[], flat = false): string[] {
  const qa = splitQa(blocks.map((b) => b.text).join('\n'));
  if (qa) {
    // Слишком длинная пара всё же режется по размеру — контекст не резиновый.
    return qa.flatMap((pair) => (estimateTokens(pair) > MAX ? splitLong(pair) : [pair]));
  }

  const target = flat ? 200 : TARGET;
  const out: string[] = [];
  let buffer: string[] = [];
  let tokens = 0;

  const flush = (): void => {
    if (buffer.length === 0) return;
    out.push(buffer.join(' '));

    const tail: string[] = [];
    let tailTokens = 0;
    for (let i = buffer.length - 1; i >= 0 && tailTokens < OVERLAP; i--) {
      tail.unshift(buffer[i]!);
      tailTokens += estimateTokens(buffer[i]!);
    }
    // Хвост переносится только если за ним последует что-то ещё; иначе получится
    // чанк-дубликат, целиком содержащийся в предыдущем.
    buffer = tail;
    tokens = tailTokens;
  };

  for (const block of blocks) {
    for (const piece of block.text.length / 4 > MAX ? splitLong(block.text) : [block.text]) {
      const pieceTokens = estimateTokens(piece);
      if (buffer.length > 0 && tokens + pieceTokens > target) flush();
      buffer.push(piece);
      tokens += pieceTokens;
    }
  }

  if (buffer.length > 0) {
    const text = buffer.join(' ');
    // Отбрасываем последний кусок, если это чистый хвост перекрытия без нового содержимого.
    if (out.length === 0 || !out.at(-1)!.endsWith(text)) out.push(text);
  }
  return out;
}

/** Абзац длиннее максимума режется по предложениям, иначе он не влезет в бюджет контекста. */
function splitLong(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && estimateTokens(current + sentence) > MAX) {
      out.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
