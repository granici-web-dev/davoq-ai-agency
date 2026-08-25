import { contactErrors, isBot, type ContactInput } from '@/lib/contact';

/**
 * Приём заявок.
 *
 * Единственный серверный обработчик на весь сайт. Заявка уходит письмом
 * и нигде не хранится: база ради одной формы — это резервные копии,
 * миграции и персональные данные, за которые кто-то должен отвечать.
 *
 * Письмо шлётся через Resend обычным `fetch`, без клиентской библиотеки:
 * один POST не стоит зависимости, которую потом придётся обновлять.
 */

export const runtime = 'nodejs';
/** Обработчик обязан быть динамическим: остальной сайт — статика. */
export const dynamic = 'force-dynamic';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'badRequest' }, 400);
  }

  const input = normalise(body);
  if (!input) return json({ ok: false, error: 'badRequest' }, 400);

  /* Боту отвечаем «принято» и ничего не делаем. Честный отказ научил бы
     его, что ловушка есть, и следующая попытка пришла бы без неё. */
  if (isBot(input)) return json({ ok: true });

  const errors = contactErrors(input);
  if (Object.keys(errors).length > 0) {
    return json({ ok: false, error: 'validation', fields: errors }, 400);
  }

  const to = process.env.CONTACT_TO;
  const from = process.env.CONTACT_FROM;
  const key = process.env.RESEND_API_KEY;

  if (!to || !from || !key) {
    /* В разработке письмо некуда слать, и это нормально: печатаем заявку
       в консоль, чтобы форму можно было проверить целиком.

       В production то же самое — отказ с пятисоткой. Заявка, тихо
       пропавшая из-за незаполненной переменной окружения, обнаружится
       через месяц по вопросу «почему нам никто не пишет». */
    if (process.env.NODE_ENV === 'production') {
      console.error('[contact] CONTACT_TO / CONTACT_FROM / RESEND_API_KEY не заданы');
      return json({ ok: false, error: 'unavailable' }, 500);
    }
    console.info('[contact] заявка (почта не настроена):', input);
    return json({ ok: true });
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      /* reply_to, а не подмена from: письмо с чужого адреса не пройдёт
         SPF и уедет в спам. Так «Ответить» открывает переписку с
         клиентом, а доставку обеспечивает наш домен. */
      reply_to: looksLikeEmail(input.contact) ? input.contact : undefined,
      subject: `Cerere de pe site — ${input.name.trim()}`,
      text: plain(input),
    }),
  }).catch(() => null);

  if (!response?.ok) {
    console.error('[contact] Resend вернул', response?.status, await response?.text().catch(() => ''));
    return json({ ok: false, error: 'unavailable' }, 502);
  }

  return json({ ok: true });
}

function normalise(body: unknown): ContactInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const field = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    name: field(b.name),
    contact: field(b.contact),
    site: field(b.site),
    message: field(b.message),
    company: field(b.company),
  };
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

function plain(input: ContactInput) {
  return [
    `Nume:    ${input.name.trim()}`,
    `Contact: ${input.contact.trim()}`,
    `Site:    ${input.site.trim() || '—'}`,
    '',
    input.message.trim() || '(fără mesaj)',
  ].join('\n');
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
