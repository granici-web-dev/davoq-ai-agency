/** Интерфейсные строки виджета (§9). Языки: en/de/ro/ru. */
export const LOCALES = ['en', 'de', 'ro', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

export interface Strings {
  launcher: string;
  title: string;
  placeholder: string;
  send: string;
  close: string;
  typing: string;
  error: string;
  retry: string;
  offline: string;
  /** AI Act Art. 50(1): постоянная надпись, а не всплывающая подсказка. */
  disclosure: string;
  leadIntro: string;
  leadEmail: string;
  leadPhone: string;
  leadName: string;
  leadSubmit: string;
  leadThanks: string;
  leadNeedContact: string;
}

export const STRINGS: Record<Locale, Strings> = {
  en: {
    launcher: 'Chat with us', title: 'Assistant', placeholder: 'Ask a question…',
    send: 'Send', close: 'Close chat', typing: 'Typing…',
    error: 'Something went wrong.', retry: 'Try again',
    offline: 'The assistant is unavailable right now. Leave your contact and we will get back to you.',
    disclosure: 'You are chatting with an AI assistant.',
    leadIntro: 'Leave your contact details', leadEmail: 'Email', leadPhone: 'Phone',
    leadName: 'Name', leadSubmit: 'Send', leadThanks: 'Thank you, we will be in touch.',
    leadNeedContact: 'Please provide an email or a phone number.',
  },
  de: {
    launcher: 'Schreiben Sie uns', title: 'Assistent', placeholder: 'Stellen Sie eine Frage…',
    send: 'Senden', close: 'Chat schließen', typing: 'Schreibt…',
    error: 'Etwas ist schiefgelaufen.', retry: 'Erneut versuchen',
    offline: 'Der Assistent ist gerade nicht erreichbar. Hinterlassen Sie Ihre Kontaktdaten, wir melden uns.',
    disclosure: 'Sie chatten mit einem KI-Assistenten.',
    leadIntro: 'Hinterlassen Sie Ihre Kontaktdaten', leadEmail: 'E-Mail', leadPhone: 'Telefon',
    leadName: 'Name', leadSubmit: 'Absenden', leadThanks: 'Danke, wir melden uns.',
    leadNeedContact: 'Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.',
  },
  ro: {
    launcher: 'Scrieți-ne', title: 'Asistent', placeholder: 'Puneți o întrebare…',
    send: 'Trimite', close: 'Închide chatul', typing: 'Scrie…',
    error: 'Ceva nu a funcționat.', retry: 'Încercați din nou',
    offline: 'Asistentul nu este disponibil acum. Lăsați datele de contact și vă contactăm noi.',
    disclosure: 'Discutați cu un asistent AI.',
    leadIntro: 'Lăsați datele de contact', leadEmail: 'Email', leadPhone: 'Telefon',
    leadName: 'Nume', leadSubmit: 'Trimite', leadThanks: 'Mulțumim, vă contactăm în curând.',
    leadNeedContact: 'Indicați un email sau un număr de telefon.',
  },
  ru: {
    launcher: 'Написать нам', title: 'Ассистент', placeholder: 'Задайте вопрос…',
    send: 'Отправить', close: 'Закрыть чат', typing: 'Печатает…',
    error: 'Что-то пошло не так.', retry: 'Повторить',
    offline: 'Ассистент сейчас недоступен. Оставьте контакт, и мы свяжемся с вами.',
    disclosure: 'Вы общаетесь с ИИ-ассистентом.',
    leadIntro: 'Оставьте контакты', leadEmail: 'Email', leadPhone: 'Телефон',
    leadName: 'Имя', leadSubmit: 'Отправить', leadThanks: 'Спасибо, мы свяжемся с вами.',
    leadNeedContact: 'Укажите email или телефон.',
  },
};

/**
 * Язык виджета.
 *
 * navigator.language отдаёт «de-AT», «ru-MD» и подобное — интересует только
 * базовый язык. Но выбирать из всех четырёх встроенных нельзя: клиент отвечает
 * на тех языках, на которых у него есть материалы. Румынский производитель
 * с русским приветствием получает посетителя, который спрашивает по-русски
 * и не находит ничего — поиск одноязычен.
 *
 * Поэтому язык браузера учитывается, только если клиент его поддерживает.
 */
export function pickLocale(
  preferred: string | undefined,
  fallback: string,
  supported?: readonly string[],
): Locale {
  const base = (v: string | undefined): string | undefined => v?.toLowerCase().split('-')[0];

  const allowed = (supported && supported.length > 0 ? supported : LOCALES)
    .map((l) => base(l)!)
    .filter((l): l is Locale => (LOCALES as readonly string[]).includes(l));
  const pool: readonly Locale[] = allowed.length > 0 ? allowed : LOCALES;

  for (const candidate of [base(preferred), base(fallback)]) {
    if (candidate && pool.includes(candidate as Locale)) return candidate as Locale;
  }
  return pool[0]!;
}
