import type { FastifyInstance } from 'fastify';
import { withOwner } from '../db/pool.js';
import { interpret, verifyWebhook } from '../../platform/billing/stripe.js';

/**
 * Приём вебхуков платёжной системы.
 *
 * Единственный адрес в продукте, который меняет состояние подписки и при этом
 * открыт всему интернету. Поэтому три вещи здесь обязательны, и каждая
 * закрывает свой способ получить продукт бесплатно.
 *
 * 1. ПОДПИСЬ. Без неё «active навсегда» ставится одним curl.
 * 2. СЫРОЕ ТЕЛО. Подпись считается по байтам, которые прислали. Fastify по
 *    умолчанию разбирает JSON, и `JSON.stringify(request.body)` даёт ДРУГИЕ
 *    байты — другой порядок ключей, другие пробелы. Подпись перестала бы
 *    сходиться, и лечили бы это обычно отключением проверки.
 * 3. ПОВТОРЫ. Stripe шлёт одно событие несколько раз, пока не получит 200,
 *    и порядок не гарантирован. Обработка обязана быть идемпотентной.
 *
 * Пишется под владельцем базы: вебхук приходит без тенантного контекста,
 * а идентификатор клиента лежит в метаданных, которые положили мы сами.
 */
export function registerBilling(app: FastifyInstance): void {
  // Сырое тело только для этого пути. Глобально менять разбор нельзя —
  // весь остальной API работает с разобранным JSON.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      if (request.url.startsWith('/v1/billing/webhook')) {
        (request as { rawBody?: string }).rawBody = String(body);
      }
      try {
        done(null, body === '' ? {} : JSON.parse(String(body)));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post('/v1/billing/webhook', async (request, reply) => {
    const raw = (request as { rawBody?: string }).rawBody ?? '';
    const signature = request.headers['stripe-signature'];

    const checked = verifyWebhook(raw, Array.isArray(signature) ? signature[0] : signature);
    if (!checked.ok) {
      // 400, а не 401: для Stripe это «не повторяй, тут ничего не поправить».
      request.log.warn({ why: checked.why }, 'вебхук отвергнут');
      return reply.code(400).send({ error: 'invalid signature' });
    }

    const change = interpret(checked.event);
    if (!change) {
      // Событие не про нас. Отвечаем 200, иначе Stripe будет слать его сутки.
      return reply.code(200).send({ ignored: checked.event.type });
    }

    await withOwner(async (client) => {
      // Одна команда, идемпотентная по построению: повтор того же события
      // приводит к тому же состоянию. Поля подписки обновляются только когда
      // событие их принесло — иначе пришедшее не по порядку событие о продлении
      // стёрло бы идентификатор, поставленный оплатой.
      await client.query(
        `UPDATE tenants
            SET subscription_status = $2,
                subscription_id     = coalesce($3, subscription_id),
                billing_customer_id = coalesce($4, billing_customer_id),
                current_period_end  = coalesce($5, current_period_end),
                plan                = coalesce($6, plan),
                -- Дата отмены ставится при отмене и снимается при возврате.
                -- От неё отсчитывается срок хранения данных, поэтому непустое
                -- значение у действующего клиента — это тихий обратный отсчёт
                -- до удаления его переписок.
                canceled_at         = CASE WHEN $2 = 'canceled'
                                           THEN coalesce(canceled_at, now())
                                           ELSE NULL END
          WHERE id = $1`,
        [change.tenantId, change.status, change.subscriptionId ?? null,
         change.customerId ?? null, change.currentPeriodEnd ?? null, change.plan ?? null],
      );

      await client.query(
        `INSERT INTO billing_events (tenant_id, event_id, type, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_id) DO NOTHING`,
        [change.tenantId, checked.event.id, checked.event.type, change.status],
      );
    });

    request.log.info(
      { tenantId: change.tenantId, type: checked.event.type, status: change.status },
      'подписка обновлена вебхуком',
    );
    return reply.code(200).send({ ok: true });
  });
}
