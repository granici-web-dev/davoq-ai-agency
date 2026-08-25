import { useTranslations } from 'next-intl';
import { COMMERCE } from '@assistwidget/contract';

/**
 * Условия за несколько агентов и плата за заведение.
 *
 * Стоит под сеткой, а не над ней: скидка за объём — довод для того, кто уже
 * посмотрел цены и прикидывает второго агента. Сверху она читалась бы как
 * условие входа и заставляла считать раньше, чем человек понял, что берёт.
 *
 * Все числа из контракта. Проценты и суммы, переписанные в текст перевода,
 * пришлось бы править в четырёх местах — двух языках и двух блоках, — и
 * витрина обещала бы скидку, которой в расчёте нет.
 */
export function BundleTerms() {
  const t = useTranslations('agentPricing.bundle');
  const { setup, volume, annualDiscount } = COMMERCE;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="grid gap-px overflow-hidden rounded-card border border-white/8 bg-white/8 lg:grid-cols-2">
      <div className="bg-ink p-7 sm:p-9">
        <h3 className="font-mono text-[11px] tracking-wider text-chalk uppercase">
          {t('volumeTitle')}
        </h3>
        <ul className="mt-6 flex flex-col gap-3">
          {volume.map((step) => (
            <li key={step.agents} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-chalk-dim">
                {t('agentsFrom', { count: step.agents })}
              </span>
              <span className="font-medium text-aurora-warm">−{pct(step.discount)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-chalk-dim">{t('allAgents')}</span>
            <span className="font-medium text-chalk">{t('individualPrice')}</span>
          </li>
        </ul>
        {/* Складывается умножением, а не сложением долей: два агента на год
            — это 0,9 × 0,8, то есть минус 28 %, а не минус 30. Написано
            здесь, потому что «−10 % и −20 %» рядом сами просятся сложиться. */}
        <p className="mt-6 border-t border-white/8 pt-5 text-xs leading-relaxed text-chalk-faint">
          {t('stacking', {
            volume: pct(volume[0]?.discount ?? 0),
            annual: pct(annualDiscount),
            total: pct(1 - (1 - (volume[0]?.discount ?? 0)) * (1 - annualDiscount)),
          })}
        </p>
      </div>

      <div className="bg-ink p-7 sm:p-9">
        <h3 className="font-mono text-[11px] tracking-wider text-chalk uppercase">
          {t('setupTitle')}
        </h3>
        <ul className="mt-6 flex flex-col gap-3">
          <li className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-chalk-dim">{t('setupFirst')}</span>
            <span className="font-medium text-chalk">{setup.first} €</span>
          </li>
          <li className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-chalk-dim">{t('setupNext')}</span>
            <span className="font-medium text-chalk">{setup.next} €</span>
          </li>
          <li className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-chalk-dim">{t('setupPilot')}</span>
            <span className="font-medium text-aurora-warm">{setup.pilot} €</span>
          </li>
        </ul>
        <p className="mt-6 border-t border-white/8 pt-5 text-xs leading-relaxed text-chalk-faint">
          {t('setupNote')}
        </p>
      </div>
    </div>
  );
}
