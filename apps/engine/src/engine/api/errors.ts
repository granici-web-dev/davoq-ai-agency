/**
 * Ошибки, которые видит клиент в панели.
 *
 * Раньше это были румынские литералы в коде сервера, и панель печатала их как
 * есть. Пока клиент один и румынский, это работало; на втором клиенте немецкий
 * директор получал бы румынский текст ошибки посреди немецкой панели.
 *
 * Сервер отдаёт код, панель переводит. Текст рядом с кодом остаётся —
 * он уходит в логи и в ответ как запасной вариант: неизвестный панели код
 * лучше показать словами, чем строкой `error.file_empty`.
 */
export class ClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

export const clientError = (
  code: string,
  message: string,
  detail?: Record<string, string | number>,
): ClientError => new ClientError(code, message, detail);
