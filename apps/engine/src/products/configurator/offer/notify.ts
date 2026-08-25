import { send } from '../../../engine/notify/email.js';
import type { IssuedOffer } from './issue.js';
import type { OfferTemplate } from './schema.js';

/**
 * Письма об оферте.
 *
 * Два адресата и два разных письма. Покупателю — сам документ вложением,
 * с суммой и сроком действия. Продавцу — то же плюс контакт и конфигурация:
 * ему звонить, и он должен знать, о чём разговор, не открывая вложение.
 *
 * Письмо покупателю уходит, только если он дал email. Телефон без почты —
 * законный случай: тогда документ есть у продавца, и он перезванивает.
 *
 * Неудача письма НЕ откатывает оферту. Документ выпущен, номер занят, строка
 * в базе есть — продавец увидит заявку в панели и без письма. Обратный порядок
 * (не выпускать, раз почта легла) терял бы покупателя из-за чужого SMTP.
 */

export interface OfferMailContext {
  tenantName: string;
  /** Куда шлёт письма тенант. Пусто — платформенный отправитель. */
  from?: string | undefined;
  /** Адрес отдела продаж тенанта. Пусто — копия продавцу не уходит. */
  sellerEmail?: string | undefined;
  locale: string;
  contact: { name?: string; email?: string; phone?: string };
  /** Строки конфигурации: «Modelul: Canapea Life». */
  summary: string[];
  totalFormatted: string;
}

export interface MailOutcome { buyer: 'sent' | 'no_email' | 'failed'; seller: 'sent' | 'no_recipient' | 'failed' }

export async function notifyOffer(
  offer: IssuedOffer, template: OfferTemplate, ctx: OfferMailContext,
): Promise<MailOutcome> {
  const t = template.text[ctx.locale] ?? Object.values(template.text)[0];
  const company = t?.header?.company ?? ctx.tenantName;
  const filename = `oferta-${offer.number}.pdf`;
  const attachment = {
    filename, content: offer.pdf, contentType: 'application/pdf',
  };
  const valid = offer.validUntil.toISOString().slice(0, 10);

  const outcome: MailOutcome = { buyer: 'no_email', seller: 'no_recipient' };

  if (ctx.contact.email) {
    const text = [
      ctx.contact.name ? `${ctx.contact.name},` : '',
      `${t?.meta?.title ?? 'Ofertă'} ${offer.number} — ${ctx.totalFormatted}.`,
      `${t?.meta?.validUntil ?? 'Valabilă până la'}: ${valid}.`,
      '',
      ...ctx.summary,
      '',
      company,
    ].filter(Boolean).join('\n');

    outcome.buyer = await deliver({
      from: ctx.from, to: ctx.contact.email,
      subject: `${t?.meta?.title ?? 'Ofertă'} ${offer.number} — ${company}`,
      text, html: `<pre style="font:14px/1.5 system-ui">${escapeHtml(text)}</pre>`,
      attachments: [attachment],
    });
  }

  if (ctx.sellerEmail) {
    const text = [
      `Оферта ${offer.number} на ${ctx.totalFormatted}.`,
      `Контакт: ${[ctx.contact.name, ctx.contact.email, ctx.contact.phone].filter(Boolean).join(' · ') || '—'}`,
      `Действует до ${valid}.`,
      '',
      ...ctx.summary,
    ].join('\n');

    outcome.seller = await deliver({
      from: ctx.from, to: ctx.sellerEmail,
      subject: `Оферта ${offer.number} · ${ctx.contact.name ?? ctx.contact.phone ?? ctx.contact.email ?? ''}`,
      text, html: `<pre style="font:14px/1.5 system-ui">${escapeHtml(text)}</pre>`,
      attachments: [attachment],
    });
  }

  return outcome;
}

async function deliver(mail: Parameters<typeof send>[0]): Promise<'sent' | 'failed'> {
  try {
    await send(mail);
    return 'sent';
  } catch (err) {
    console.error(`письмо об оферте не ушло на ${mail.to}: ${(err as Error).message}`);
    return 'failed';
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
