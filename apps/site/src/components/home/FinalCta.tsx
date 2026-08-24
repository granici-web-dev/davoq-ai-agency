import { useTranslations } from 'next-intl';
import { Cta } from '@/components/ui/Cta';

/**
 * Последний экран.
 *
 * Свечение возвращается — единственная секция после героя, где оно стоит
 * во всю ширину. Тёмная страница, которая заканчивается той же чернотой,
 * с какой началась середина, читается как оборванная; свет в конце
 * закрывает её так же, как открыл.
 *
 * Текст по центру, хотя вся страница выровнена по левому краю. Это
 * единственное место, где центрирование уместно: здесь нет содержания,
 * которое читают, — есть одно предложение и два действия.
 */
export function FinalCta() {
  const t = useTranslations('home.finalCta');

  return (
    <section className="relative isolate overflow-hidden px-6 py-section sm:px-8">
      <div className="aurora" aria-hidden />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <h2 className="text-h1 font-medium">{t('title')}</h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim">{t('lead')}</p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Cta href="/contact">{t('primary')}</Cta>
          <Cta href="/pricing" variant="ghost">
            {t('secondary')}
          </Cta>
        </div>

        <p className="mt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase">
          {t('note')}
        </p>
      </div>
    </section>
  );
}
