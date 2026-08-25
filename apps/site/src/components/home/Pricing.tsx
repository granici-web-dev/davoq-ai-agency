import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AgentPriceList } from '@/components/pricing/AgentPriceList';

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
  const tPricing = useTranslations('agentPricing');

  return (
    <section id="preturi" className="relative isolate px-6 py-section sm:px-8">
      <div className="aurora" aria-hidden />

      <div className="relative mx-auto max-w-7xl">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="mt-6 max-w-3xl text-h2 font-medium">{t('title')}</h2>
        <p className="mt-6 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>

        <div className="mt-14">
          <AgentPriceList />
        </div>

        {/* Оговорка про «в курând» и ссылка на полное сравнение. На
            главной человек ещё решает, нужен ли ему агент, поэтому
            матрицы здесь нет — только дверь к ней. */}
        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-chalk-dim">{tPricing('homeNote')}</p>

          <Link
            href="/pricing"
            className="group shrink-0 self-start font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
          >
            {t('compare')}{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
