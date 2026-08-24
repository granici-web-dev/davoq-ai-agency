'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const STEPS = ['talk', 'materials', 'config', 'embed'] as const;
type Step = (typeof STEPS)[number];

/**
 * Как проходит подключение.
 *
 * Шаг переключается прокруткой: секция высотой в четыре экрана, внутри —
 * прилипшая панель. Человек скроллит как обычно, а панель под ним меняет
 * содержимое. Четыре одинаковые колонки, стоявшие здесь раньше,
 * показывали процесс списком; так он показан как процесс — за то время,
 * которое он занимает.
 *
 * Возражение, которое секция снимает, звучит не «дорого», а «у меня нет
 * времени на ИТ-проект». Поэтому у каждого шага подписано не сколько он
 * длится вообще, а сколько времени он отнимет у читателя. Про свои сроки
 * обещаний нет: они зависят от того, в каком виде придёт прайс.
 *
 * На узком экране прилипания нет вовсе. Прокрутка, которая на телефоне
 * управляет чем-то, кроме положения страницы, отбирает у человека
 * единственный жест, которому он доверяет. Там шаги просто идут подряд.
 */
export function Onboarding() {
  const t = useTranslations('home.onboarding');
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    if (!desktop.matches) return;

    const onScroll = () => {
      const el = track.current;
      if (!el) return;
      /* Доля пройденного по дорожке, где 0 — её верх поравнялся с верхом
         экрана, 1 — низ поравнялся с низом. Внутри дорожки ровно столько
         экранов, сколько шагов, поэтому доля прямо переводится в номер. */
      const rect = el.getBoundingClientRect();
      const scrolled = -rect.top;
      const distance = rect.height - window.innerHeight;
      if (distance <= 0) return;
      const progress = Math.min(Math.max(scrolled / distance, 0), 1);
      const index = Math.min(Math.floor(progress * STEPS.length), STEPS.length - 1);
      setActive(index);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section id="cum-incepe" className="relative px-6 sm:px-8">
      <div className="mx-auto max-w-7xl pt-section">
        <div className="flex items-center gap-3 border-b border-white/8 pb-5">
          <StepsIcon />
          <span className="eyebrow">{t('eyebrow')}</span>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-16">
          <h2 className="text-h1 font-medium">{t('title')}</h2>
          <p className="leading-relaxed text-chalk-dim lg:pt-3">{t('lead')}</p>
        </div>
      </div>

      {/* Дорожка. Её высота и есть время, которое читатель проводит
          в секции. Она короче четырёх полных экранов: на шаг остаётся
          около шестидесяти процентов экрана прокрутки — достаточно, чтобы
          заметить смену, и не столько, чтобы устать.

          Сцена внутри — высотой по содержимому, а не во весь экран.
          Блок во весь экран с центрированием давал по сто девяносто
          пикселей пустоты сверху и снизу, и первая из них зияла между
          заголовком и дорожкой. Центрирование при прокрутке даёт `top`:
          отступ считается от высоты экрана, но сам блок остаётся ровно
          такой высоты, какая нужна содержимому. `max(6rem, …)` не даёт
          сцене уехать под шапку на низких экранах. */}
      <div ref={track} className="mx-auto max-w-7xl lg:h-[340vh]">
        <div className="mt-4 lg:sticky lg:top-[max(6rem,calc((100dvh-34rem)/2))] lg:mt-14">
          <Rail active={active} />

          {/* Панели лежат друг на друге в одной ячейке сетки и переключаются
              прозрачностью. Показывать по одной значило бы менять высоту
              блока на каждом шаге — панель дёргалась бы под неподвижным
              взглядом. */}
          <div className="mt-8 grid lg:mt-8">
            {STEPS.map((key, i) => (
              <Panel key={key} step={key} index={i} active={i === active} />
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl pb-section">
        <div className="flex flex-col gap-4 border-t border-white/8 pt-8 lg:flex-row lg:items-baseline lg:justify-between">
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

/**
 * Дорожка с номерами. Активный отрезок подсвечен снизу — как в референсе.
 * На узком экране её нет: она показывает положение внутри процесса,
 * а на телефоне положение показывает сама прокрутка.
 */
function Rail({ active }: { active: number }) {
  const t = useTranslations('home.onboarding');

  return (
    <ol className="hidden border-t border-white/8 lg:grid lg:grid-cols-4">
      {STEPS.map((key, i) => (
        <li key={key} className="relative pt-5">
          <span
            className={`absolute -top-px left-0 h-px w-full origin-left bg-aurora-warm transition-transform duration-700 ${
              i <= active ? 'scale-x-100' : 'scale-x-0'
            }`}
            aria-hidden
          />
          <p
            className={`font-mono text-xs tracking-wider tabular-nums transition-colors duration-500 ${
              i === active ? 'text-chalk' : 'text-chalk-faint'
            }`}
          >
            {String(i + 1).padStart(2, '0')}.
          </p>
          <p
            className={`mt-2 text-sm transition-colors duration-500 ${
              i === active ? 'text-chalk' : 'text-chalk-faint'
            }`}
          >
            {t(`steps.${key}.title`)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Panel({ step, index, active }: { step: Step; index: number; active: boolean }) {
  const t = useTranslations('home.onboarding');

  return (
    <div
      /* col/row-start-1 кладёт все панели в одну ячейку. inert снимает
         скрытые с пути клавиатуры: без него Tab уводил бы в невидимое. */
      className={`card relative overflow-hidden p-7 transition-opacity duration-500 sm:p-9 lg:col-start-1 lg:row-start-1 lg:min-h-[26rem] ${
        active ? 'lg:opacity-100' : 'lg:pointer-events-none lg:opacity-0'
      } ${index > 0 ? 'mt-4 lg:mt-0' : ''}`}
      {...(!active ? { 'data-inactive': true } : {})}
    >
      <span
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="relative grid gap-8 lg:h-full lg:grid-cols-2 lg:items-center lg:gap-12">
        <div className="flex flex-col justify-center">
          <p className="font-mono text-[11px] tracking-wider text-chalk-faint uppercase lg:hidden">
            {String(index + 1).padStart(2, '0')}
          </p>
          <h3 className="mt-3 text-h3 font-medium lg:mt-0">{t(`steps.${step}.title`)}</h3>
          <p className="mt-4 max-w-md leading-relaxed text-chalk-dim">
            {t(`steps.${step}.text`)}
          </p>

          <p className="mt-7 flex items-center gap-2.5 border-t border-white/8 pt-5 text-sm text-chalk">
            <ClockIcon />
            <span className="sr-only">{t('timeLabel')}: </span>
            {t(`steps.${step}.time`)}
          </p>
        </div>

        <StepVisual step={step} />
      </div>
    </div>
  );
}

/**
 * Иллюстрация шага — вёрстка, а не картинка.
 *
 * Здесь есть текст: имена файлов, названия настроек, тег скрипта.
 * Сгенерированное изображение отдало бы всё это нечитаемыми буквами,
 * а тут оно на своём шрифте и переводится вместе с сайтом.
 */
function StepVisual({ step }: { step: Step }) {
  const t = useTranslations('home.onboarding.visuals');

  if (step === 'talk') {
    return (
      <Frame>
        <ul className="flex flex-col gap-3">
          {['a', 'b', 'c'].map((k) => (
            <li key={k} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-aurora-warm" aria-hidden />
              {t(`talk.${k}`)}
            </li>
          ))}
        </ul>
      </Frame>
    );
  }

  if (step === 'materials') {
    return (
      <Frame>
        <ul className="flex flex-col gap-2">
          {['xlsx', 'pdf', 'docx', 'zip'].map((ext) => (
            <li
              key={ext}
              className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/3 px-3 py-2.5"
            >
              <span className="rounded border border-white/12 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-chalk-faint uppercase">
                {ext}
              </span>
              <span className="min-w-0 truncate text-sm text-chalk-dim">
                {t(`materials.${ext}`)}
              </span>
            </li>
          ))}
        </ul>
      </Frame>
    );
  }

  if (step === 'config') {
    return (
      <Frame>
        <ul className="flex flex-col divide-y divide-white/8">
          {['tone', 'price', 'offer', 'language'].map((k, i) => (
            <li key={k} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-chalk-dim">{t(`config.${k}`)}</span>
              <span
                className={`flex h-5 w-9 shrink-0 items-center rounded-pill p-0.5 ${
                  i === 3 ? 'bg-white/10' : 'bg-aurora-warm/40'
                }`}
                aria-hidden
              >
                <span
                  className={`size-4 rounded-full bg-chalk transition-transform ${
                    i === 3 ? '' : 'translate-x-4'
                  }`}
                />
              </span>
            </li>
          ))}
        </ul>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
        {t('embed.label')}
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-white/8 bg-ink-950 p-4 font-mono text-[11px] leading-relaxed text-chalk-dim">
        <code>{'<script\n  src="https://cdn.…/widget.js"\n  data-site="…"\n  defer\n></script>'}</code>
      </pre>
      <p className="mt-3 text-xs leading-relaxed text-chalk-faint">{t('embed.note')}</p>
    </Frame>
  );
}

/**
 * Рамка иллюстрации.
 *
 * Тянется на всю высоту панели, содержимое внутри по центру. Иначе
 * на высокой сцене иллюстрация прижималась бы к верху, а под ней
 * оставалась бы пустая половина карточки.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-white/10 bg-ink-900/60 p-5 sm:p-6">
      {children}
    </div>
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

function StepsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-chalk-faint">
      <path d="M1.5 13.5h3v-4h3v-4h3v-4h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
