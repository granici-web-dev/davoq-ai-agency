import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { DemoButton } from '@/components/ui/DemoButton';
import { PLANS, SETUP_FEE } from '@/lib/pricing';

/**
 * Тарифы, кратко.
 *
 * Не карточки, а один блок, разделённый волосяными линиями на три колонки.
 * Три отдельные карточки читаются как три товара, между которыми выбирают;
 * одна разграфлённая таблица — как одна лестница, по которой поднимаются.
 * Второе ближе к правде: план меняют, а не покупают заново.
 *
 * Полное сравнение живёт на `/pricing`. Здесь ровно столько, чтобы человек
 * понял устройство — помесячно плюс разовая настройка — и не ушёл искать
 * цену по сайту.
 */
export function Pricing() {
  const t = useTranslations('home.pricing');
  const tPlans = useTranslations('home.pricing.plans');

  return (
    <section id="preturi" className="relative isolate px-6 py-section sm:px-8">
      <div className="aurora" aria-hidden />

      <div className="relative mx-auto max-w-7xl">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="mt-6 max-w-3xl text-h2 font-medium">{t('title')}</h2>
        <p className="mt-6 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>

        <div className="mt-14 grid divide-y divide-white/8 overflow-hidden rounded-card border border-white/8 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              /* Выделение заливкой, а не рамкой: рамка внутри уже
                 разграфлённого блока читается как сбой вёрстки. */
              className={`flex flex-col p-7 sm:p-8 ${plan.featured ? 'bg-white/4' : ''}`}
            >
              {/* Фиксированная высота строки: бейдж «Recomandat» выше
                  названия плана, и без неё колонка Pro опускала бы свою
                  цену на семь пикселей ниже двух соседних. Три цены,
                  стоящие не на одной линии, — первое, что видно в таблице
                  тарифов, и последнее, что о ней хочется думать. */}
              <div className="flex min-h-7 items-center justify-between gap-3">
                <h3 className="font-mono text-[11px] tracking-wider text-chalk-dim uppercase">
                  {tPlans(`${plan.id}.name`)}
                </h3>
                {plan.featured && (
                  <span className="rounded-pill border border-aurora-warm/30 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-chalk uppercase">
                    {t('recommended')}
                  </span>
                )}
              </div>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-h2 font-medium">
                  {plan.price ?? tPlans(`${plan.id}.priceOnRequest`)}
                </span>
                {plan.price && (
                  <span className="text-sm text-chalk-faint">{t('perMonth')}</span>
                )}
              </p>

              <p className="mt-4 text-sm leading-relaxed text-chalk-dim">
                {tPlans(`${plan.id}.for`)}
              </p>

              <ul className="mt-7 flex flex-col gap-3 border-t border-white/8 pt-6">
                {plan.features.map((key) => (
                  <li key={key} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
                    <CheckIcon />
                    {tPlans(`${plan.id}.features.${key}`)}
                  </li>
                ))}
              </ul>

              {/* mt-auto держит кнопки на одной линии: у планов разное
                  число строк, и без этого три кнопки встали бы лесенкой. */}
              <div className="mt-auto pt-8">
                <DemoButton
                  variant={plan.featured ? 'primary' : 'ghost'}
                  className="w-full"
                >
                  {tPlans(`${plan.id}.cta`)}
                </DemoButton>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-baseline lg:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-chalk-dim">
            {t('setupNote', { fee: SETUP_FEE })}
          </p>
          <Link
            href="/pricing"
            className="group shrink-0 font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
          >
            {t('compare')}{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="mt-1 shrink-0 text-chalk-faint"
    >
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
