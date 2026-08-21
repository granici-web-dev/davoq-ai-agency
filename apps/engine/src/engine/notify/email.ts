import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Транспорт почты. Один на процесс: nodemailer держит пул соединений сам,
 * а создание транспорта на каждое письмо роняет производительность и
 * открывает по соединению на заявку.
 *
 * Настраивается одной строкой `SMTP_URL` — так одинаково выражаются и локальный
 * ящик разработчика (`smtp://localhost:1025`), и рабочий отправитель
 * (`smtps://user:pass@smtp.example.com:465`). Разбирать хост, порт, шифрование
 * и учётные данные по четырём переменным незачем: URL это уже умеет.
 */
let cached: Transporter | null = null;

export function mailer(): Transporter | null {
  const url = process.env.SMTP_URL;
  if (!url) return null;
  cached ??= nodemailer.createTransport(url);
  return cached;
}

/**
 * Отправитель по умолчанию. Используется только когда у тенанта не задан свой:
 * адрес отправителя — свойство клиента, а не процесса, иначе второй клиент
 * получает письма от имени первого.
 */
export const defaultMailFrom = (): string =>
  process.env.MAIL_FROM ?? 'AssistWidget <no-reply@assistwidget.local>';

export interface Mail {
  /** Отправитель тенанта. Пусто — берётся платформенный по умолчанию. */
  from?: string | undefined;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Отправка. Отсутствие настроенного SMTP — не «тихо пропустить»: письмо о заявке
 * это единственный способ узнать о ней вовремя, и молчаливый пропуск здесь
 * ничем не лучше потерянной заявки. Бросаем, вызывающий записывает причину
 * в `leads.notify_error`, и панель показывает её директору.
 */
export async function send(mail: Mail): Promise<void> {
  const t = mailer();
  if (!t) throw new Error('SMTP_URL is not configured');
  const { from, ...rest } = mail;
  await t.sendMail({ from: from?.trim() || defaultMailFrom(), ...rest });
}
