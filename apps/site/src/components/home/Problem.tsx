import { useTranslations } from 'next-intl';

/** Порядок фиксирован здесь: он и есть порядок событий в реальной сделке. */
const POINTS = ['afterHours', 'everyRequestDiffers', 'sameAnswers'] as const;

/**
 * Секция «Проблема».
 *
 * Идёт сразу за героем и делает одну работу: называет положение дел словами
 * человека, который в нём живёт. Пока посетитель не узнал в тексте свой
 * вторник, витрина агентов ниже — просто список функций.
 *
 * Здесь намеренно нет ни карточек, ни свечения, ни картинки. После
 * освещённого героя чистая чернота и типографика — это пауза, а страница
 * без пауз читается как один непрерывный крик. Карточки начнутся ниже,
 * где пойдёт каталог, и там они будут значить «отдельный продукт».
 */
export function Problem() {
  const t = useTranslations('home.problem');

  return (
    <section className="relative px-6 py-section sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 className="mt-6 text-h2 font-medium">{t('title')}</h2>
        </div>

        <ul>
          {POINTS.map((key, i) => (
            <li
              key={key}
              /* Волосяная линия сверху у каждого пункта, а не рамка вокруг:
                 три рамки на тёмном читаются как три кнопки. */
              className="grid grid-cols-[auto_1fr] gap-x-6 border-t border-white/8 py-8 first:border-t-0 first:pt-0"
            >
              <span className="pt-1 font-mono text-xs tracking-wider text-chalk-faint tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-h3 font-medium">{t(`${key}.title`)}</h3>
                <p className="mt-3 leading-relaxed text-chalk-dim">{t(`${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
