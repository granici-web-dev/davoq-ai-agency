import type pg from 'pg';
import { withTenant } from '../db/pool.js';
import { parseQuoteFields } from '../llm/quote.js';
import { contactKey } from './contact.js';
import { send } from './email.js';

interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  payload: Record<string, string> | null;
  created_at: string;
  notified_at: string | null;
  notified_contact: string | null;
}


interface TenantRow {
  name: string;
  lead_notify_email: string | null;
  lead_notify_from: string | null;
  quote_fields: unknown;
}

export type NotifyOutcome = 'sent' | 'sent-update' | 'no_recipient' | 'already_sent' | 'no_lead';

/**
 * Письмо о заявке уходит один раз на заявку — плюс одно на каждое исправление
 * контакта.
 *
 * Разговор продолжается и после того, как посетитель дал телефон: он уточняет
 * метраж, обивку, город, и каждое уточнение дополняет ту же заявку. Слать письмо
 * на каждое дополнение — четыре письма об одном человеке, и отдел продаж
 * перестанет их открывать. Поэтому детали писем не порождают: они лежат
 * по ссылке на разговор, которая всегда показывает текущее состояние.
 *
 * Исключение — сам контакт. «Извините, ошибся, правильный номер такой-то»
 * обесценивает уже отправленное письмо: с телефона нажимают на номер прямо
 * в письме, а не идут в панель. Такое исправление уходит вторым письмом,
 * помеченным как исправление.
 */
export async function notifyLead(
  tenantId: string,
  conversationId: string,
): Promise<NotifyOutcome> {
  // Данные читаем в тенантном контексте и соединение закрываем ДО отправки:
  // SMTP отвечает секундами, а держать на это время соединение с базой
  // (их всего десять на процесс) — верный способ упереться в пул.
  const data = await withTenant(tenantId, async (client) => {
    const lead = await client.query<LeadRow>(
      `SELECT id, name, email, phone, note, payload, created_at,
              notified_at, notified_contact
         FROM leads WHERE conversation_id = $1`,
      [conversationId],
    );
    const tenant = await client.query<TenantRow>(
      `SELECT name, lead_notify_email, lead_notify_from, quote_fields
         FROM tenants WHERE id = $1`,
      [tenantId],
    );
    return { lead: lead.rows[0], tenant: tenant.rows[0] };
  });

  if (!data.lead || !data.tenant) return 'no_lead';

  const key = contactKey(data.lead);
  const isUpdate = data.lead.notified_at !== null;
  if (isUpdate && data.lead.notified_contact === key) return 'already_sent';

  const to = data.tenant.lead_notify_email?.trim();
  if (!to) return 'no_recipient';

  const mail = buildMail({
    from: data.tenant.lead_notify_from ?? undefined,
    to,
    lead: data.lead,
    companyName: data.tenant.name,
    fields: parseQuoteFields(data.tenant.quote_fields),
    conversationId,
    isUpdate,
  });

  try {
    await send(mail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await withTenant(tenantId, (client) =>
      client.query(`UPDATE leads SET notify_error = $2 WHERE id = $1`, [data.lead!.id, message]),
    );
    throw err;
  }

  await withTenant(tenantId, (client) =>
    client.query(
      `UPDATE leads SET notified_at = now(), notified_contact = $2, notify_error = NULL
        WHERE id = $1`,
      [data.lead!.id, key],
    ),
  );
  return isUpdate ? 'sent-update' : 'sent';
}

/** Ссылка на разговор. Без неё письмо — тупик: прочитал и всё равно иди искать руками. */
const conversationLink = (conversationId: string): string =>
  `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost:3779').replace(/\/+$/, '')}` +
  `/admin#chats/${conversationId}`;

function buildMail(a: {
  from: string | undefined;
  to: string;
  lead: LeadRow;
  companyName: string;
  fields: Array<{ key: string; label: string }>;
  conversationId: string;
  isUpdate: boolean;
}): { from: string | undefined; to: string; subject: string; text: string; html: string } {
  const { lead } = a;
  // В теме — то, по чему звонят. Директор видит список писем на телефоне и должен
  // понять, кому перезвонить, не открывая ни одного из них. У исправления тема
  // начинается со слова «исправление»: иначе два письма об одном человеке
  // выглядят как две заявки, и звонят по первому — то есть по неверному номеру.
  const who = lead.name ?? lead.phone ?? lead.email ?? 'vizitator';
  const subject = a.isUpdate
    ? `Date de contact corectate — ${who}`
    : `Cerere nouă de ofertă — ${who}`;

  const contact: Array<[string, string]> = [];
  if (lead.name) contact.push(['Nume', lead.name]);
  if (lead.phone) contact.push(['Telefon', lead.phone]);
  if (lead.email) contact.push(['Email', lead.email]);

  // Порядок полей — как у продавца в брифе, а не как их прислала модель.
  const details: Array<[string, string]> = [];
  const payload = lead.payload ?? {};
  for (const f of a.fields) {
    const v = payload[f.key];
    if (v) details.push([f.label, v]);
  }
  for (const [k, v] of Object.entries(payload)) {
    if (!a.fields.some((f) => f.key === k) && v) details.push([k, v]);
  }

  const link = conversationLink(a.conversationId);
  const when = new Date(lead.created_at).toLocaleString('ro-RO');

  const text = [
    a.isUpdate
      ? `ATENȚIE: vizitatorul a corectat datele de contact. Folosiți-le pe cele de mai jos.`
      : `Cerere nouă de ofertă de pe site — ${a.companyName}`,
    '',
    ...contact.map(([k, v]) => `${k}: ${v}`),
    '',
    details.length > 0 ? 'Ce își dorește:' : 'Vizitatorul nu a apucat să dea detalii.',
    ...details.map(([k, v]) => `  ${k}: ${v}`),
    ...(lead.note ? ['', `Notă: ${lead.note}`] : []),
    '',
    `Conversația completă: ${link}`,
    `Primită: ${when}`,
  ].join('\n');

  const rows = (pairs: Array<[string, string]>): string =>
    pairs
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
          `<td style="padding:4px 0;color:#0f172a">${esc(v)}</td></tr>`,
      )
      .join('');

  // Письмо читают с телефона в почтовом клиенте, который вырежет и <style>,
  // и внешние файлы. Поэтому таблица и атрибуты style — не небрежность, а
  // единственное, что переживает Gmail и Outlook одинаково.
  const html = [
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;max-width:560px">`,
    `<p style="margin:0 0 4px;font-size:13px;color:#64748b">${esc(a.companyName)} — asistentul de pe site</p>`,
    a.isUpdate
      ? `<h2 style="margin:0 0 4px;font-size:20px">Date de contact corectate</h2>` +
        `<p style="margin:0 0 16px;color:#b91c1c">Vizitatorul a corectat datele. ` +
        `Folosiți-le pe cele de mai jos, nu pe cele din mesajul anterior.</p>`
      : `<h2 style="margin:0 0 16px;font-size:20px">Cerere nouă de ofertă</h2>`,
    `<table style="border-collapse:collapse;margin-bottom:16px">${rows(contact)}</table>`,
    details.length > 0
      ? `<p style="margin:0 0 4px;font-weight:600">Ce își dorește</p>` +
        `<table style="border-collapse:collapse;margin-bottom:16px">${rows(details)}</table>`
      : `<p style="margin:0 0 16px;color:#64748b">Vizitatorul nu a apucat să dea detalii.</p>`,
    lead.note ? `<p style="margin:0 0 16px">${esc(lead.note)}</p>` : '',
    `<p style="margin:0 0 16px"><a href="${esc(link)}" style="background:#0f172a;color:#fff;` +
      `text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Vezi conversația</a></p>`,
    `<p style="margin:0;font-size:13px;color:#64748b">Primită: ${esc(when)}</p>`,
    `</div>`,
  ].join('');

  return { from: a.from, to: a.to, subject, text, html };
}

/**
 * Экранирование обязательно: имя, телефон и «что хочет» — это текст, который
 * написал посетитель. Он же может написать туда разметку.
 */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
