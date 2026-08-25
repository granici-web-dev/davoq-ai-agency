/**
 * Распознавание документов «вопрос-ответ» и нарезка по парам.
 *
 * Файлы, которые кладёт директор по продажам, — это почти всегда список вопросов
 * с ответами консультантов. Обычная нарезка по размеру складывает в один фрагмент
 * несколько пар, и запрос про рассрочку тянет за собой возврат и доставку.
 * Пара «вопрос-ответ» — естественная единица смысла: её и режем.
 *
 * Определяется автоматически, настройки нет: тенант не должен знать слово «чанк».
 */

/** Явные метки на языках, на которых пишут наши клиенты и их консультанты. */
const QUESTION_LABEL =
  /(?:^|[\n\s])(?:\d+[.)]?\s*)?(?:Întrebare|Intrebare|Question|Вопрос|Frage|Q)\s*[:.]\s*/gi;

const MIN_PAIRS = 2;

/** Предложения с сохранением знака в конце — по нему и опознаётся вопрос. */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [];
}

/**
 * Нарезка по явным меткам. Кусок начинается с метки вопроса и тянется
 * до следующей — вместе с ответом, который между ними.
 */
function splitByLabels(text: string): string[] | null {
  const marks = [...text.matchAll(QUESTION_LABEL)];
  if (marks.length < MIN_PAIRS) return null;

  const out: string[] = [];
  // Текст до первой метки — заголовок документа; он относится ко всему файлу,
  // а не к первой паре, поэтому в куски не попадает.
  marks.forEach((m, i) => {
    const from = m.index!;
    const to = i + 1 < marks.length ? marks[i + 1]!.index! : text.length;
    const piece = text.slice(from, to).trim();
    if (piece) out.push(piece);
  });
  return out;
}

/**
 * Нарезка без меток. Знак вопроса — единственная надёжная граница: в файлах,
 * которые пишут консультанты, ответ часто идёт без точки в конце, и вопрос
 * приклеивается к нему в одно «предложение».
 *
 * Поэтому текст режется по знакам вопроса, а затем собирается обратно:
 * вопрос — это хвост куска перед знаком, ответ — начало следующего куска
 * до хвоста, который уже принадлежит следующему вопросу.
 */
function splitByQuestionMarks(text: string): string[] | null {
  const segments = text.split('?');
  if (segments.length < MIN_PAIRS + 1) return null;

  // Порог по плотности отсекает обычную прозу, где знак вопроса встречается
  // изредка и парой не является.
  if (text.length / (segments.length - 1) > 700) return null;

  /** Хвост после последней точки — то, что читается как вопрос. */
  const tail = (seg: string): { head: string; question: string } => {
    const at = Math.max(seg.lastIndexOf('.'), seg.lastIndexOf('!'), seg.lastIndexOf('\n'));
    return at === -1
      ? { head: '', question: seg.trim() }
      : { head: seg.slice(0, at + 1).trim(), question: seg.slice(at + 1).trim() };
  };

  const out: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const question = tail(segments[i]!).question;
    const next = segments[i + 1]!;
    const answer = i + 1 < segments.length - 1 ? tail(next).head : next.trim();
    const pair = `${question}? ${answer}`.trim();
    if (pair.length > 3) out.push(pair);
  }
  return out.length >= MIN_PAIRS ? out : null;
}

/** Возвращает пары «вопрос-ответ» или null, если документ не такого рода. */
export function splitQa(text: string): string[] | null {
  return splitByLabels(text) ?? splitByQuestionMarks(text);
}

/** Похож ли документ целиком на список вопросов и ответов. */
export function looksLikeQa(texts: string[]): boolean {
  const joined = texts.join('\n');
  return splitQa(joined) !== null;
}
