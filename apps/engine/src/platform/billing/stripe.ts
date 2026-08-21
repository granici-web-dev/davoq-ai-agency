import { createHmac, timingSafeEqual } from 'node:crypto';
import { PLANS, type PlanId } from '../../engine/plans.js';

/**
 * Stripe — и только он один в этом файле.
 *
 * Всё, что знает про платёжную систему, живёт здесь. Остальной код работает
 * с состоянием подписки в нашей базе и о существовании Stripe не подозревает:
 * путь сообщения не имеет права зависеть от чужого API, а замена провайдера
 * не должна означать переписывание портала.
 *
 * Граница проведена не из любви к абстракциям. Компания в Молдове, а Stripe
 * молдавские юрлица не принимает — проверьте на stripe.com/global перед тем,
 * как заводить аккаунт. Если окажется, что нельзя, менять придётся этот файл,
 * а не всё остальное. Paddle и Lemon Squeezy — продавцы записи: они принимают
 * продавцов из большего числа стран и берут на себя НДС, но и комиссия у них
 * выше, а деньги приходят с задержкой.
 *
 * ── Почему без официального пакета ──
 *
 * Нам нужны три вещи: создать ссылку на оплату, создать ссылку на управление
 * подпиской и проверить подпись вебхука. Это три HTTP-запроса и одна проверка
 * HMAC. Пакет `stripe` тянет за собой много того, чем мы не пользуемся, —
 * и его пришлось бы выкорчёвывать при переходе на другого провайдера.
 */

const API = 'https://api.stripe.com/v1';

const secretKey = (): string => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY не задан — оплата не настроена');
  return key;
};

/** Идентификаторы цен в Stripe: заводятся в их панели, сюда попадают строкой. */
export const priceIdFor = (plan: PlanId): string => {
  const id = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (!id) {
    throw new Error(
      `STRIPE_PRICE_${plan.toUpperCase()} не задан. Заведите цену «${PLANS[plan].name}» ` +
      `(€${PLANS[plan].priceEur}/мес) в панели Stripe и впишите её id.`,
    );
  }
  return id;
};

async function call(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey()}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    throw new Error(`Stripe ${res.status}: ${err?.message ?? JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

/**
 * Ссылка на оплату.
 *
 * Создаётся только тогда, когда действующей подписки НЕТ. У кого она есть,
 * тариф меняется через `changePlan`: вторая сессия оплаты завела бы вторую
 * подписку и списала бы дважды.
 *
 * `tenantId` уезжает в метаданные и возвращается в вебхуке. Искать клиента
 * по email нельзя: он может отличаться от того, которым человек платит.
 */
export async function createCheckout(args: {
  tenantId: string;
  plan: PlanId;
  email?: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}): Promise<{ url: string }> {
  const form: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': priceIdFor(args.plan),
    'line_items[0][quantity]': '1',
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    'metadata[tenant_id]': args.tenantId,
    // Метаданные нужны и на самой подписке: в вебхуках о продлении и о неудачном
    // платеже сессии оплаты уже нет, а подписка есть.
    'subscription_data[metadata][tenant_id]': args.tenantId,
    'subscription_data[metadata][plan]': args.plan,
  };
  if (args.email) form.customer_email = args.email;
  if (args.trialDays && args.trialDays > 0) {
    form['subscription_data[trial_period_days]'] = String(args.trialDays);
  }
  const session = await call('/checkout/sessions', form);
  return { url: String(session.url) };
}

/**
 * Ссылка на управление подпиской: карта, счета, отмена.
 *
 * Отмена подписки живёт там же. Своей кнопки «отменить» мы не делаем: у Stripe
 * этот путь уже описан по-человечески и по закону, и повторять его своими
 * словами — брать на себя ответственность за формулировки.
 */
export async function createPortalLink(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const session = await call('/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: String(session.url) };
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${secretKey()}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    throw new Error(`Stripe ${res.status}: ${err?.message ?? 'ошибка'}`);
  }
  return body;
}

/**
 * Смена тарифа у ДЕЙСТВУЮЩЕЙ подписки.
 *
 * Не вторая оплата. Это важно до денег: создать вторую сессию оплаты клиенту,
 * у которого подписка уже есть, — значит завести ВТОРУЮ подписку и списать
 * дважды. Он заметит это на выписке, а не в панели, и разбираться будет
 * с банком, а не с нами.
 *
 * Правильный путь — заменить позицию в существующей подписке. Stripe сам
 * посчитает разницу за остаток периода: при повышении спишет доплату,
 * при понижении оставит остаток на счету.
 */
export async function changePlan(subscriptionId: string, plan: PlanId): Promise<void> {
  const sub = await get(`/subscriptions/${subscriptionId}`);
  const items = (sub.items as { data?: Array<{ id?: string }> } | undefined)?.data ?? [];
  const itemId = items[0]?.id;
  if (!itemId) throw new Error(`у подписки ${subscriptionId} нет позиций — менять нечего`);

  await call(`/subscriptions/${subscriptionId}`, {
    'items[0][id]': itemId,
    'items[0][price]': priceIdFor(plan),
    // Разница за остаток периода считается сразу: иначе повышение тарифа
    // вступало бы в силу бесплатно до конца месяца.
    proration_behavior: 'create_prorations',
    'metadata[plan]': plan,
  });
}

/**
 * Проверка подписи вебхука.
 *
 * Вебхук — это адрес, который меняет состояние подписки, и он открыт всему
 * интернету. Без проверки подписи любой желающий переводит себе `active`
 * навсегда одним curl. Поэтому проверка обязательна и здесь, а не «когда-нибудь
 * потом»: продукт, который выдаёт себя по поддельному вебхуку, платный только
 * для честных.
 *
 * Проверяется и отметка времени. Подпись без неё остаётся действительной вечно:
 * перехваченный однажды вебхук об оплате можно было бы повторять хоть год.
 */
const TOLERANCE_SECONDS = Number(process.env.STRIPE_WEBHOOK_TOLERANCE ?? 300);

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret = process.env.STRIPE_WEBHOOK_SECRET,
  now = Date.now(),
): { ok: true; event: StripeEvent } | { ok: false; why: string } {
  if (!secret) return { ok: false, why: 'STRIPE_WEBHOOK_SECRET не задан' };
  if (!signatureHeader) return { ok: false, why: 'нет заголовка подписи' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k?.trim() ?? '', rest.join('=')];
    }),
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return { ok: false, why: 'подпись неразборчива' };

  const age = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, why: `отметка времени старше ${TOLERANCE_SECONDS} с` };
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  // Сравнение постоянного времени: обычное сравнение строк выдаёт длину общего
  // префикса задержкой и позволяет подобрать подпись по знаку.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, why: 'подпись не совпадает' };
  }

  try {
    return { ok: true, event: JSON.parse(rawBody) as StripeEvent };
  } catch {
    return { ok: false, why: 'тело не разбирается как JSON' };
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Что вебхук означает для нашего состояния подписки. */
export interface SubscriptionChange {
  tenantId: string;
  status: 'active' | 'past_due' | 'canceled';
  subscriptionId?: string;
  customerId?: string;
  currentPeriodEnd?: Date;
  plan?: PlanId;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Событие → изменение состояния. Возвращает null для событий, которые нас
 * не касаются, — а их большинство: Stripe шлёт десятки видов.
 *
 * Идентификатор клиента берётся ТОЛЬКО из метаданных, которые положили мы.
 * Доверять email или порядку событий нельзя: вебхуки приходят не по порядку
 * и могут повторяться.
 */
export function interpret(event: StripeEvent): SubscriptionChange | null {
  const o = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const meta = (o.metadata ?? {}) as Record<string, string>;
      const tenantId = str(meta.tenant_id);
      if (!tenantId) return null;
      return {
        tenantId,
        status: 'active',
        ...(str(o.subscription) ? { subscriptionId: str(o.subscription)! } : {}),
        ...(str(o.customer) ? { customerId: str(o.customer)! } : {}),
      };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const meta = (o.metadata ?? {}) as Record<string, string>;
      const tenantId = str(meta.tenant_id);
      if (!tenantId) return null;

      const stripeStatus = String(o.status ?? '');
      // Пробный период у Stripe — это тоже активная подписка: карта привязана,
      // деньги спишутся сами. Наш собственный `trial` — другое: он до оплаты.
      const status: SubscriptionChange['status'] =
        event.type === 'customer.subscription.deleted' ? 'canceled'
        : ['active', 'trialing'].includes(stripeStatus) ? 'active'
        : ['past_due', 'unpaid', 'incomplete'].includes(stripeStatus) ? 'past_due'
        : 'canceled';

      const periodEnd = Number(o.current_period_end);
      const planId = str(meta.plan);

      return {
        tenantId,
        status,
        ...(str(o.id) ? { subscriptionId: str(o.id)! } : {}),
        ...(str(o.customer) ? { customerId: str(o.customer)! } : {}),
        ...(Number.isFinite(periodEnd) ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
        ...(planId && planId in PLANS ? { plan: planId as PlanId } : {}),
      };
    }

    default:
      return null;
  }
}
