'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { INDUSTRIES, type IndustrySlug } from '@/lib/catalog';

interface DialogLine {
  role: 'agent' | 'client';
  text: string;
}

/**
 * Индустрии.
 *
 * Вертикальные вкладки слева, крупная панель справа — по структуре референса.
 *
 * Панель показывает не описание ниши, а три реплики разговора: вопрос агента,
 * ответ человека, следующий вопрос. Секция утверждает «тот же агент, другой
 * сценарий», и разговор это доказывает, тогда как ещё один абзац про
 * конфигурацию только повторил бы утверждение. Реплики — обычная вёрстка
 * на своём шрифте, не сгенерированная картинка интерфейса: текст в кадре
 * выходит с артефактами.
 *
 * Все шесть панелей есть в разметке всегда, неактивные скрыты атрибутом
 * `hidden`. Иначе ссылки на пять из шести страниц ниш пропали бы из HTML,
 * и поисковик увидел бы только ту, что открыта по умолчанию.
 */
export function Industries() {
  const t = useTranslations('home.industries');
  const tIndustries = useTranslations('industries');
  const tAgents = useTranslations('agents');
  const tNav = useTranslations('nav');

  const [active, setActive] = useState<IndustrySlug>(INDUSTRIES[0].slug);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Стрелки переключают вкладки, Home и End прыгают к краям.
   * Без этого до пятой ниши с клавиатуры пришлось бы идти табом через
   * всё содержимое четырёх предыдущих панелей.
   */
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const last = INDUSTRIES.length - 1;
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(INDUSTRIES[next].slug);
    tabs.current[next]?.focus();
  };

  return (
    <section id="industrii" className="relative px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center gap-3 border-b border-white/8 pb-5">
          <LayersIcon />
          <span className="eyebrow">{t('eyebrow')}</span>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-16">
          <h2 className="text-h1 font-medium">{t('title')}</h2>
          <p className="leading-relaxed text-chalk-dim lg:pt-3">{t('lead')}</p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-[minmax(13rem,17rem)_1fr] lg:gap-12">
          <div role="tablist" aria-label={t('eyebrow')} aria-orientation="vertical">
            {INDUSTRIES.map((industry, i) => {
              const selected = industry.slug === active;
              return (
                <button
                  key={industry.slug}
                  ref={(el) => { tabs.current[i] = el; }}
                  type="button"
                  role="tab"
                  id={`tab-${industry.slug}`}
                  aria-selected={selected}
                  aria-controls={`panel-${industry.slug}`}
                  /* Единственная вкладка в порядке табуляции — активная.
                     Так устроены вкладки везде: Tab выводит из списка
                     в содержимое, а не перебирает шесть кнопок подряд. */
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(industry.slug)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={`w-full border-b border-l-2 border-b-white/8 py-4 pr-3 pl-5 text-left text-sm transition-colors ${
                    selected
                      ? 'border-l-aurora-warm text-chalk'
                      : 'border-l-transparent text-chalk-dim hover:text-chalk'
                  }`}
                >
                  {tIndustries(`${industry.slug}.name`)}
                </button>
              );
            })}
          </div>

          {INDUSTRIES.map((industry) => {
            const dialog = tIndustries.raw(`${industry.slug}.dialog`) as DialogLine[];
            return (
              <div
                key={industry.slug}
                role="tabpanel"
                id={`panel-${industry.slug}`}
                aria-labelledby={`tab-${industry.slug}`}
                hidden={industry.slug !== active}
                /* Панели лежат в той же ячейке сетки: без этого скрытая
                   панель всё равно занимала бы свою строку и растягивала
                   секцию на шесть высот. */
                /* Минимальная высота — не эстетика. У ниш разное число
                   агентов, чипы у одних умещаются в строку, у других в две,
                   и без неё вся секция подпрыгивала бы при каждом
                   переключении вкладки. */
                className="card relative overflow-hidden p-7 sm:p-9 lg:col-start-2 lg:row-start-1 lg:min-h-96"
              >
                <span
                  className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-aurora-warm/10 blur-3xl"
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute -right-16 -bottom-32 size-96 rounded-full bg-aurora-cool/10 blur-3xl"
                  aria-hidden
                />

                <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-12">
                  <div className="flex flex-col">
                    <h3 className="text-h3 font-medium">
                      {tIndustries(`${industry.slug}.name`)}
                    </h3>
                    <p className="mt-4 leading-relaxed text-chalk-dim">
                      {tIndustries(`${industry.slug}.panel`)}
                    </p>

                    <p className="mt-8 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                      {t('agentsLabel')}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {industry.agents.map((slug) => (
                        <li key={slug}>
                          <Link
                            href={`/agents/${slug}`}
                            className="inline-flex rounded-pill border border-white/12 px-3 py-1.5 text-xs text-chalk-dim transition-colors hover:border-white/25 hover:text-chalk"
                          >
                            {tAgents(`${slug}.name`)}
                          </Link>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/industries/${industry.slug}`}
                      className="group mt-auto inline-flex items-center gap-2 pt-10 font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
                    >
                      {t('view')}
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </Link>
                  </div>

                  <ul className="flex flex-col gap-3">
                    {dialog.map((line, i) => (
                      <li
                        key={i}
                        className={line.role === 'agent' ? 'mr-6' : 'ml-6 flex justify-end'}
                      >
                        <p
                          className={
                            line.role === 'agent'
                              ? 'rounded-2xl rounded-bl-sm border border-white/10 bg-white/6 px-4 py-3 text-sm leading-relaxed text-chalk'
                              : 'rounded-2xl rounded-br-sm bg-chalk px-4 py-3 text-sm leading-relaxed text-ink-950'
                          }
                        >
                          {line.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-6">
          <p className="max-w-xl text-sm leading-relaxed text-chalk-dim">{t('otherText')}</p>
          <Link
            href="/industries"
            className="font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
          >
            {tNav('allIndustries')} →
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Значок над лейблом секции — как в референсе: метка, а не украшение. */
function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-chalk-faint">
      <rect x="1.5" y="1.5" width="13" height="7" rx="1.5" stroke="currentColor" />
      <path d="M1.5 11.5h13M4.5 14.5h7" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}
