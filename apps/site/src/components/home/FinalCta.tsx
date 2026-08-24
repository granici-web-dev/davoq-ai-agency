import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ContactForm } from '@/components/contact/ContactForm';

/**
 * Последний экран: обещание слева, форма справа.
 *
 * Отдельная секция «оставьте заявку» под финальным призывом была бы вторым
 * призывом подряд — человек дважды слышит «действуйте» и не делает ничего.
 * Здесь предложение и способ им воспользоваться стоят рядом: дочитал строку
 * и попал в первое поле, не нажимая ничего.
 *
 * Свечение возвращается во всю ширину — единственный раз после героя.
 * Тёмная страница, заканчивающаяся той же чернотой, что и середина,
 * читается как оборванная; свет в конце закрывает её так же, как открыл.
 */
export function FinalCta() {
  const t = useTranslations('home.finalCta');

  return (
    <section id="contact" className="relative isolate overflow-hidden px-6 py-section sm:px-8">
      <div className="aurora" aria-hidden />

      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_28rem] lg:gap-16">
        <div className="lg:pt-6">
          <h2 className="max-w-2xl text-h1 font-medium">{t('title')}</h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-chalk-dim">{t('lead')}</p>

          <p className="mt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase">
            {t('note')}
          </p>

          <p className="mt-10 text-sm text-chalk-dim">
            {t('pricingHint')}{' '}
            <Link href="/pricing" className="text-chalk underline underline-offset-4 hover:no-underline">
              {t('pricingLink')}
            </Link>
          </p>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
