import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

/** Порядок — от «сколько ждать» к «почему у вас нет отзывов». */
const QUESTIONS = [
  'timeline',
  'unknown',
  'data',
  'site',
  'language',
  'priceChange',
  'cancel',
  'reviews',
] as const;

/**
 * Вопросы и ответы.
 *
 * Собран на `<details>`, а не на состоянии React. Браузер уже умеет
 * раскрывать и закрывать такие блоки, водить по ним клавиатурой и объявлять
 * скринридеру, раскрыт ли текущий, — а ответы при этом лежат в разметке
 * всегда, и поисковик видит их без выполнения скриптов. Ради анимации
 * стрелки писать всё это заново незачем.
 *
 * Последний вопрос — «почему у вас нет отзывов». Он отвечает на возражение,
 * которого не избежать, и отвечает прямо. В разделе с вопросами прямота
 * читается как прямота; отдельной секцией посреди страницы то же самое
 * читалось бы как оправдание.
 */
export function Faq() {
  const t = useTranslations('home.faq');

  return (
    <section id="intrebari" className="relative px-6 py-section sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 className="mt-6 text-h2 font-medium">{t('title')}</h2>
          <p className="mt-5 max-w-sm leading-relaxed text-chalk-dim">
            {t('lead')}{' '}
            <Link href="/contact" className="text-chalk underline underline-offset-4 hover:no-underline">
              {t('leadLink')}
            </Link>
          </p>
        </div>

        <div className="border-t border-white/8">
          {QUESTIONS.map((key) => (
            <details key={key} className="group border-b border-white/8">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 text-chalk transition-colors hover:text-chalk-dim [&::-webkit-details-marker]:hidden">
                <span className="text-h3 font-medium">{t(`items.${key}.q`)}</span>
                {/* Плюс, который поворачивается в минус. Стрелка на тёмном
                    в мелком кегле теряется, а перекрестье видно всегда. */}
                <span className="relative mt-2 size-3.5 shrink-0 text-chalk-faint">
                  <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-current" />
                  <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
                </span>
              </summary>
              <p className="max-w-2xl pb-7 leading-relaxed text-chalk-dim">
                {t(`items.${key}.a`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
