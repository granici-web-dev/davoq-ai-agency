import { withOwner } from '../db/pool.js';
import { planFor } from '../plans.js';
import { defaultMailFrom, send } from './email.js';

/**
 * Письма о конце пробного периода.
 *
 * Три ступени, и они разные не для красоты. «За три дня» — это напоминание,
 * на которое ещё можно спокойно ответить. «Сегодня последний день» — это
 * срочность. «Пробный период закончился» — это объяснение, почему бот замолчал,
 * и оно обязано прийти: молчащий бот без письма выглядит поломкой, а клиент
 * звонит нам, а не платит.
 *
 * Ступень записывается в базу. Планировщик ходит раз в час, и без отметки
 * напоминание уходило бы шесть дней подряд по двадцать четыре раза — письмо,
 * приходящее так часто, перестают читать раньше, чем оно становится важным.
 *
 * Кому: тем, у кого есть вход в панель. Адрес для заявок здесь не годится —
 * это отдел продаж клиента, а не тот, кто решает про оплату.
 */

export type Stage = 'soon' | 'last_day' | 'expired';

/** За сколько дней до конца предупреждать первый раз. */
const SOON_DAYS = Number(process.env.TRIAL_NOTICE_DAYS ?? 3);

interface Candidate {
  id: string;
  name: string;
  plan: string;
  trial_ends_at: Date;
  trial_notice: string | null;
  emails: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/** Какая ступень положена сейчас — и не отправляли ли её уже. */
function stageFor(endsAt: Date, sent: string | null, now: number): Stage | null {
  const left = Math.ceil((endsAt.getTime() - now) / DAY);

  const wanted: Stage | null =
    left <= 0 ? 'expired'
    : left <= 1 ? 'last_day'
    : left <= SOON_DAYS ? 'soon'
    : null;

  if (!wanted || wanted === sent) return null;

  // Ступени идут только вперёд. Иначе сдвинутая руками дата конца триала
  // отправила бы «осталось три дня» после «пробный период закончился».
  const order: Stage[] = ['soon', 'last_day', 'expired'];
  if (sent && order.indexOf(wanted) <= order.indexOf(sent as Stage)) return null;

  return wanted;
}

function letter(stage: Stage, tenantName: string, planName: string, priceEur: number): {
  subject: string; text: string;
} {
  // Письма по-румынски: их читает клиент, а не мы. Язык клиента здесь
  // не выбирается по настройке — пилот румынский, и переводить письма
  // раньше второго клиента значит переводить наугад.
  switch (stage) {
    case 'soon':
      return {
        subject: `Perioada de probă se încheie în curând — ${tenantName}`,
        text: [
          `Bună ziua,`,
          ``,
          `Perioada de probă pentru asistentul de pe site-ul dumneavoastră se încheie peste ${SOON_DAYS} zile.`,
          ``,
          `Pachetul curent: ${planName}, ${priceEur} € pe lună.`,
          ``,
          `După încheiere asistentul nu va mai răspunde vizitatorilor, dar formularul`,
          `de contact rămâne activ — cererile continuă să ajungă la dumneavoastră.`,
          ``,
          `Pentru a continua, deschideți secțiunea «Abonament» din panou.`,
        ].join('\n'),
      };
    case 'last_day':
      return {
        subject: `Astăzi este ultima zi din perioada de probă — ${tenantName}`,
        text: [
          `Bună ziua,`,
          ``,
          `Astăzi se încheie perioada de probă. De mâine asistentul nu va mai răspunde`,
          `vizitatorilor. Formularul de contact rămâne activ, așa că nu pierdeți cererile.`,
          ``,
          `Pachetul ${planName} costă ${priceEur} € pe lună. Plata se face din secțiunea`,
          `«Abonament» a panoului.`,
        ].join('\n'),
      };
    case 'expired':
      return {
        subject: `Perioada de probă s-a încheiat — ${tenantName}`,
        text: [
          `Bună ziua,`,
          ``,
          `Perioada de probă s-a încheiat. Asistentul nu mai răspunde vizitatorilor.`,
          ``,
          `Ce continuă să funcționeze: formularul de contact din widget. Vizitatorii`,
          `își lasă datele, iar dumneavoastră primiți cererile ca și până acum.`,
          ``,
          `Materialele, conversațiile și setările sunt păstrate — la reluare totul`,
          `funcționează din prima zi.`,
          ``,
          `Pentru a relua, deschideți secțiunea «Abonament» din panou.`,
        ].join('\n'),
      };
  }
}

/**
 * Один проход. Возвращает, сколько писем отправлено — планировщик пишет это
 * в журнал, чтобы молчащая рассылка была отличима от рассылки без адресатов.
 */
export async function sendTrialNotices(now = Date.now()): Promise<number> {
  const candidates = await withOwner(async (client) => {
    const { rows } = await client.query<Candidate>(
      `SELECT t.id, t.name, t.plan, t.trial_ends_at, t.trial_notice,
              coalesce(array_agg(u.email) FILTER (WHERE u.email IS NOT NULL), '{}') AS emails
         FROM tenants t
         LEFT JOIN admin_users u ON u.tenant_id = t.id
        WHERE t.subscription_status = 'trial'
          AND t.trial_ends_at IS NOT NULL
          AND t.status = 'active'
        GROUP BY t.id`,
    );
    return rows;
  });

  let sent = 0;
  for (const t of candidates) {
    const stage = stageFor(t.trial_ends_at, t.trial_notice, now);
    if (!stage) continue;

    if (t.emails.length === 0) {
      // Клиент без единого входа в панель — это наша недоработка при заведении.
      // Молчать о ней нельзя: письмо о конце триала некому получить.
      console.error(`триал ${t.name}: некому написать — нет ни одного пользователя панели`);
      continue;
    }

    const plan = planFor(t.plan);
    const mail = letter(stage, t.name, plan.name, plan.priceEur);

    try {
      for (const to of t.emails) {
        await send({
          from: defaultMailFrom(), to,
          subject: mail.subject, text: mail.text,
          html: `<pre style="font:14px/1.6 system-ui,sans-serif;white-space:pre-wrap">${
            mail.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
        });
      }
      // Отметка ставится ПОСЛЕ отправки: упавшая почта не должна выглядеть
      // как отправленное письмо, иначе следующая попытка не состоится.
      await withOwner((client) =>
        client.query('UPDATE tenants SET trial_notice = $2 WHERE id = $1', [t.id, stage]));
      sent++;
      console.log(`триал ${t.name}: отправлено «${stage}» на ${t.emails.join(', ')}`);
    } catch (err) {
      console.error(`триал ${t.name}: письмо не ушло — ${(err as Error).message}`);
    }
  }
  return sent;
}
