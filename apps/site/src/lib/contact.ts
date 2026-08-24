/**
 * Проверка заявки.
 *
 * Один файл на клиент и на сервер. Проверка, написанная в форме и ещё раз
 * в обработчике, расходится на второй правке — и расходится в сторону
 * сервера, то есть в сторону потерянных заявок.
 *
 * Серверная проверка обязательна независимо от клиентской: форму можно
 * обойти, послав запрос напрямую, и на это рассчитывает любой спам-бот.
 */

export interface ContactInput {
  name: string;
  contact: string;
  site: string;
  message: string;
  /** Ловушка. Человек это поле не видит и не заполняет. */
  company: string;
}

export type ContactField = 'name' | 'contact' | 'site' | 'message';

export const LIMITS = {
  name: 100,
  contact: 200,
  site: 200,
  message: 2000,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Минимум семь цифр: короче не бывает ни одного действующего номера. */
const PHONE = /^[+\d][\d\s().-]{5,}$/;

export function contactErrors(input: ContactInput): Partial<Record<ContactField, string>> {
  const errors: Partial<Record<ContactField, string>> = {};
  const name = input.name.trim();
  const contact = input.contact.trim();

  if (name.length < 2) errors.name = 'name';
  else if (name.length > LIMITS.name) errors.name = 'tooLong';

  if (!contact) errors.contact = 'contact';
  else if (contact.length > LIMITS.contact) errors.contact = 'tooLong';
  else if (!EMAIL.test(contact) && !(PHONE.test(contact) && digits(contact) >= 7)) {
    errors.contact = 'contactFormat';
  }

  if (input.site.trim().length > LIMITS.site) errors.site = 'tooLong';
  if (input.message.trim().length > LIMITS.message) errors.message = 'tooLong';

  return errors;
}

const digits = (s: string) => (s.match(/\d/g) ?? []).length;

/** Ловушка сработала — заявку принимаем молча и никуда не отправляем. */
export const isBot = (input: ContactInput) => input.company.trim().length > 0;

export const EMPTY: ContactInput = { name: '', contact: '', site: '', message: '', company: '' };
