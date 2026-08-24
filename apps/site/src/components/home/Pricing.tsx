import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { PlanCards } from '@/components/pricing/PlanCards';
import { DemoButton } from '@/components/ui/DemoButton';

/**
 * Тарифы на главной.
 *
 * Те же три пакета, что на `/pricing`, из одного компонента: состав,
 * написанный в двух местах, расходится на первой же правке цены.
 * Здесь нет только матрицы сравнения — она для тех, кто уже выбирает
 * между пакетами, а на главной человек ещё выбирает, нужен ли ему
 * вообще агент.
 */
export function Pricing() {
  const t = useTranslations('home.pricing');
  const tPlans = useTranslations('plans');

  return (
    <section id="preturi" className="relative isolate px-6 py-section sm:px-8">
      <div className="aurora" aria-hidden />

      <div className="relative mx-auto max-w-7xl">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="mt-6 max-w-3xl text-h2 font-medium">{t('title')}</h2>
        <p className="mt-6 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>

        <div className="mt-14">
          <PlanCards />
        </div>

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-aurora-warm/25 bg-aurora-warm/4 px-5 py-4 text-sm text-chalk">
            {tPlans('pilot.text')}
            <DemoButton variant="ghost" size="sm">
              {tPlans('pilot.cta')}
            </DemoButton>
          </p>

          <Link
            href="/pricing"
            className="group shrink-0 self-start font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk lg:self-center"
          >
            {t('compare')}{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
