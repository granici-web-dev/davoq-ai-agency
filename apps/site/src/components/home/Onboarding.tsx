import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const STEPS = ['request', 'checklist', 'portal', 'script'] as const;

/**
 * Как проходит подключение.
 *
 * Возражение, которое эта секция снимает, звучит не «а это дорого», а
 * «у меня нет времени на ИТ-проект». Поэтому у каждого шага подписано не
 * сколько он длится вообще, а сколько времени он отнимет у читателя.
 * Про свои сроки мы обещаний не даём: они зависят от того, в каком виде
 * придёт прайс, а это заранее не известно.
 *
 * Шаги описывают самообслуживание: клиент оставляет заявку, получает
 * чек-лист, грузит материалы, забирает скрипт из портала. Итоговая строка
 * при этом прямо оставляет за нами превращение прайса в правила расчёта.
 * Без неё страница противоречила бы плате за настройку: если клиент всё
 * загружает сам, за что он платит.
 *
 * Пятый визуальный тип на странице — линейка шагов. Ни свет, ни карточки,
 * ни вкладки, ни сводка: процесс читается как процесс, только если его
 * видно слева направо.
 */
export function Onboarding() {
  const t = useTranslations('home.onboarding');

  return (
    <section id="cum-incepe" className="relative px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="mt-6 max-w-3xl text-h2 font-medium">{t('title')}</h2>
        <p className="mt-6 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>

        <ol className="mt-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          {STEPS.map((key, i) => (
            <li key={key} className="relative flex flex-col">
              {/* Соединитель тянется от края кружка до края следующего.
                  Одной линией через всю сетку это не сделать: колонки
                  разделены зазором, и линия прошла бы сквозь него ровно
                  там, где шаг уже кончился, а следующий ещё не начался.
                  Поэтому отрезок принадлежит шагу, а не списку. */}
              {i < STEPS.length - 1 && (
                <span
                  className="absolute top-5 left-12 -right-8 hidden h-px bg-white/10 lg:block"
                  aria-hidden
                />
              )}

              <span className="relative flex size-10 items-center justify-center rounded-full border border-white/12 bg-ink-950 font-mono text-xs text-chalk-dim tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>

              <h3 className="mt-6 text-h3 font-medium">{t(`steps.${key}.title`)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-chalk-dim">
                {t(`steps.${key}.text`)}
              </p>

              {/* mt-auto прижимает подпись к низу колонки. Без него линейка
                  разделителей шла бы уступами вслед за длиной описаний —
                  четыре разные высоты в ряду, который должен читаться
                  как один. */}
              <p className="mt-auto flex items-center gap-2.5 border-t border-white/8 pt-4 pr-2 text-sm text-chalk">
                {/* Значок вместо повторённого в четвёртый раз слова
                    «ваше время». Одинаковая иконка в ряду читается как
                    единица измерения, одинаковое слово — как небрежность. */}
                <ClockIcon />
                <span className="sr-only">{t('timeLabel')}: </span>
                {t(`steps.${key}.time`)}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/8 pt-8 lg:flex-row lg:items-baseline lg:justify-between">
          <p className="max-w-xl leading-relaxed text-chalk-dim">{t('total')}</p>
          <Link
            href="/pricing"
            className="group shrink-0 font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
          >
            {t('priceLink')}{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-chalk-faint">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" />
      <path d="M8 4.75V8l2.25 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
