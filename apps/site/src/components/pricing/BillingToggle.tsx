'use client';

import { useTranslations } from 'next-intl';
import { COMMERCE } from '@assistwidget/contract';
import type { Billing } from './PricingCard';

/**
 * Переключатель «месяц / год».
 *
 * Два состояния, а не выпадающий список: вариантов ровно два, и оба должны
 * быть видны сразу — иначе про годовую скидку узнают только те, кто полез
 * в список. Скидка написана прямо на второй кнопке по той же причине.
 *
 * По умолчанию месяц. Годовая как значение по умолчанию показывала бы цену
 * ниже той, по которой человек, скорее всего, начнёт, — и разница
 * обнаружилась бы в счёте.
 */
export function BillingToggle({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (next: Billing) => void;
}) {
  const t = useTranslations('agentPricing');
  const percent = Math.round(COMMERCE.annualDiscount * 100);

  return (
    <div
      role="radiogroup"
      aria-label={t('billingLabel')}
      className="inline-flex items-center gap-1 rounded-pill border border-white/10 bg-white/3 p-1"
    >
      {(['monthly', 'annual'] as const).map((mode) => {
        const on = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(mode)}
            className={`flex items-center gap-2 rounded-pill px-4 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors ${
              on ? 'bg-white/10 text-chalk' : 'text-chalk-faint hover:text-chalk-dim'
            }`}
          >
            {t(mode === 'monthly' ? 'billingMonthly' : 'billingAnnual')}
            {mode === 'annual' && (
              /* Скидка на самой кнопке, а не подписью рядом: подпись
                 читают после того, как выбрали, а это довод ДО выбора. */
              <span className="text-aurora-warm">−{percent}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
