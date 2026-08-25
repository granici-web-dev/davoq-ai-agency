import { useTranslations } from 'next-intl';
import { DemoButton } from '@/components/ui/DemoButton';
import { PLANS } from '@/lib/pricing';

/**
 * Три пакета.
 *
 * Не три карточки, а один блок, разграфлённый волосяными линиями. Три
 * карточки читаются как три товара, между которыми выбирают; одна таблица —
 * как лестница, по которой поднимаются. Второе ближе к правде: пакет
 * меняют, а не покупают заново.
 *
 * Один компонент на главную и на страницу цен: состав пакета, написанный
 * в двух местах, расходится на первой же правке.
 */
export function PlanCards() {
  const t = useTranslations('plans');

  return (
    <div className="grid divide-y divide-white/8 overflow-hidden rounded-card border border-white/8 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          /* Выделение заливкой, а не рамкой: рамка внутри уже
             разграфлённого блока читается как сбой вёрстки. */
          className={`flex flex-col p-7 sm:p-8 ${plan.featured ? 'bg-white/4' : ''}`}
        >
          {/* Фиксированная высота строки: бейдж выше названия, и без неё
              колонка Growth опускала бы цену ниже двух соседних. Три цены
              не на одной линии — первое, что видно в таблице тарифов. */}
          <div className="flex min-h-7 items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h3 className="font-mono text-[11px] tracking-wider text-chalk uppercase">
                {t(`${plan.id}.name`)}
              </h3>
              <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {t(`${plan.id}.subtitle`)}
              </span>
            </div>
            {plan.featured && (
              <span className="rounded-pill border border-aurora-warm/30 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-chalk uppercase">
                {t('recommended')}
              </span>
            )}
          </div>

          <p className="mt-6 flex items-baseline gap-1.5">
            {/* Слова кеглем цифр выглядят кричаще: «199 €» в этом размере
                читается как сумма, «Preț individual» — как заголовок.
                Ступень ниже возвращает третьей колонке её вес. */}
            <span className={plan.price === null ? 'text-h3 font-medium' : 'text-h2 font-medium'}>
              {plan.price === null ? t('priceOnRequest') : `${plan.price} €`}
            </span>
            {plan.price !== null && (
              <span className="text-sm text-chalk-faint">{t('perMonth')}</span>
            )}
          </p>

          {/* Разовая настройка стоит прямо под ценой и мельче: это вторая
              сумма в решении, и узнать о ней на созвоне — худший момент. */}
          <p className="mt-2 text-xs text-chalk-faint">
            {plan.setup === null ? t('setupCustom') : t('setup', { fee: plan.setup })}
          </p>

          <p className="mt-5 text-sm leading-relaxed text-chalk-dim">
            {t(`${plan.id}.tagline`)}
          </p>

          <ul className="mt-7 flex flex-col gap-3.5 border-t border-white/8 pt-6">
            {plan.features.map(({ key, soon }) => (
              <li key={key} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
                <CheckIcon />
                <span>
                  {t(`${plan.id}.features.${key}`)}
                  {soon && (
                    <span className="ml-2 inline-block rounded-pill border border-white/12 px-2 py-0.5 align-middle font-mono text-[9px] tracking-wider text-chalk-faint uppercase">
                      {t('soon')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* mt-auto держит кнопки на одной линии: у пакетов разное число
              строк, и без этого три кнопки встали бы лесенкой. */}
          <div className="mt-auto pt-8">
            <DemoButton variant={plan.featured ? 'primary' : 'ghost'} className="w-full">
              {t(`${plan.id}.cta`)}
            </DemoButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-1 shrink-0 text-chalk-faint">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
