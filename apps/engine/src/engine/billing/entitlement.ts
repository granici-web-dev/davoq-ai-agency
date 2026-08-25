/**
 * Право пользоваться продуктом.
 *
 * Отвечает на один вопрос: должен ли бот отвечать посетителям этого клиента
 * прямо сейчас. Живёт в движке, а не в платёжном слое, намеренно: путь
 * сообщения не имеет права зависеть от доступности чужого API. Состояние
 * подписки хранится у нас и обновляется вебхуком; отстать на минуты оно может,
 * а отказать посетителю из-за недоступного Stripe — нет.
 *
 * ── Что значит «не оплачено» ──
 *
 * Не «виджет выключен». Выключенный виджет — это потерянные обращения
 * у клиента, который, возможно, просто не увидел письмо о просроченной карте.
 * Он звонит и ругается, а мы в этот момент выглядим сломанными, а не строгими.
 *
 * Поэтому бот перестаёт ОТВЕЧАТЬ, но форма контакта остаётся: посетитель
 * оставляет телефон, менеджер перезванивает. Клиент теряет автоматизацию,
 * а не обращения. Тот же путь, что и при исчерпанном месячном потолке, —
 * он уже есть и уже проверен.
 */

/** Сколько длится пробный период. */
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 14);

/**
 * Отсрочка после неудачного платежа.
 *
 * Карта истекает у всех, и обычно это решается за день. Выключать продукт
 * в ту же минуту — значит наказывать за то, что банк прислал новую карту.
 */
export const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS ?? 7);

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled';

export interface BillingState {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

export interface Entitlement {
  /** Бот отвечает? */
  active: boolean;
  /** Почему нет — для журнала и для панели, не для посетителя. */
  reason: 'trial' | 'paid' | 'grace' | 'trial_expired' | 'unpaid' | 'canceled';
  /** Сколько дней осталось. Отрицательное — столько дней как истекло. */
  daysLeft: number | null;
}

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: number, to: number): number => Math.ceil((to - from) / DAY);

export function entitlementOf(state: BillingState, now = Date.now()): Entitlement {
  switch (state.subscriptionStatus) {
    case 'active':
      return { active: true, reason: 'paid', daysLeft: null };

    case 'trial': {
      // Отсутствующая дата конца триала трактуется в пользу клиента: это наша
      // недоработка при заведении, а не его неоплата, и выключать за неё нельзя.
      if (!state.trialEndsAt) return { active: true, reason: 'trial', daysLeft: null };
      const left = daysBetween(now, state.trialEndsAt.getTime());
      return left > 0
        ? { active: true, reason: 'trial', daysLeft: left }
        : { active: false, reason: 'trial_expired', daysLeft: left };
    }

    case 'past_due': {
      // Отсчёт от конца оплаченного периода, а не от момента отказа карты:
      // клиент оплатил месяц вперёд и вправе его дожить.
      const from = state.currentPeriodEnd?.getTime() ?? now;
      const left = daysBetween(now, from + GRACE_DAYS * DAY);
      return left > 0
        ? { active: true, reason: 'grace', daysLeft: left }
        : { active: false, reason: 'unpaid', daysLeft: left };
    }

    case 'canceled':
    default:
      return { active: false, reason: 'canceled', daysLeft: null };
  }
}

/** Дата окончания триала для нового клиента. */
export const trialEndsAt = (from = new Date()): Date =>
  new Date(from.getTime() + TRIAL_DAYS * DAY);
