import type { FastifyReply } from 'fastify';
import { wrongLanguage } from '../rag/language.js';

/**
 * Задержка первых знаков ответа ради проверки языка.
 *
 * Зачем это нужно вообще: правило в промпте задаёт вероятность, а не гарантию.
 * После всех правок бот отвечает на языке инструкций примерно раз из пятидесяти
 * на самой трудной развилке, и дальше формулировками это не давится. Гарантию
 * даёт только проверка в коде — но проверить можно лишь то, что уже написано,
 * а написанное уже улетело посетителю. Значит, начало ответа приходится
 * придержать.
 *
 * Размен принят осознанно: первые знаки появляются на доли секунды позже
 * у всех и всегда, ради случая, который случается редко. Порог маленький
 * намеренно — судить о языке хватает одного предложения, а каждый лишний
 * знак задержки платят все.
 *
 * Отклонённый ответ не дописывается и не правится: он выбрасывается целиком
 * и просится заново. Склеивать половину английского ответа с румынским
 * продолжением — получить текст, который не читается ни на одном языке.
 */
const PROBE_CHARS = Number(process.env.LANGUAGE_PROBE_CHARS ?? 90);

export interface StreamGuard {
  /** Принять кусок текста. Возвращает false, если ответ надо перегенерировать. */
  push: (chunk: string) => boolean;
  /** Конец текста в этом обороте: решить по тому, что накопилось. */
  settle: () => boolean;
  /** Всё, что накопилось, уже отдано посетителю? */
  readonly flushed: boolean;
  /** Язык оказался чужим. */
  readonly rejected: boolean;
}

export function createStreamGuard(
  reply: FastifyReply,
  acceptedLocales: string[],
): StreamGuard {
  let buffer = '';
  let flushed = false;
  let rejected = false;

  const write = (text: string): void => {
    if (text) reply.raw.write(`event: delta\ndata: ${JSON.stringify({ t: text })}\n\n`);
  };

  const decide = (): boolean => {
    if (wrongLanguage(buffer, acceptedLocales)) {
      rejected = true;
      buffer = '';
      return false;
    }
    flushed = true;
    write(buffer);
    buffer = '';
    return true;
  };

  return {
    push(chunk: string): boolean {
      if (rejected) return false;
      if (flushed) {
        write(chunk);
        return true;
      }
      buffer += chunk;
      // Пока текста мало, судить не о чем: определитель на коротком отрезке
      // честно отвечает «не знаю», и решение всё равно пришлось бы отложить.
      return buffer.length < PROBE_CHARS ? true : decide();
    },
    settle(): boolean {
      if (rejected) return false;
      if (flushed || buffer === '') return true;
      return decide();
    },
    get flushed() {
      return flushed;
    },
    get rejected() {
      return rejected;
    },
  };
}

/**
 * Поправка, которая дописывается к системному промпту на повторной попытке.
 *
 * Отдельным блоком в конце, а не правкой основного промпта: у конца
 * наибольший вес, и говорить надо ровно об одном — о том, что не получилось.
 */
export const languageCorrection = (locale: string): string =>
  [
    'CORRECTION.',
    `Your previous attempt was written in the wrong language and was discarded.`,
    `Write the reply in ${locale}. Every sentence, from the first word.`,
    'Do not apologise for the previous attempt and do not mention it.',
  ].join('\n');
