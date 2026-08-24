import { useTranslations } from 'next-intl';

interface Step {
  day: string;
  text: string;
  /** `origin` — с чего всё началось, `done` — отправлено, `stopped` — отменено. */
  state: 'origin' | 'done' | 'stopped';
}

/**
 * План возвратов к одному лиду.
 *
 * Возражение, ради которого этот макет существует, звучит не «а будет ли
 * толк», а «а не превратится ли это в спам». Поэтому главное здесь —
 * не то, что агент пишет, а то, что он перестаёт: последняя строка
 * зачёркнута, и под ней написано, почему.
 *
 * Поэтому же выбрана дорожка со временем, а не список сообщений. Список
 * показал бы, сколько писем ушло; дорожка показывает интервалы — второй
 * день, шестой, двенадцатый, — и по ним видно, что это не рассылка.
 *
 * Собрано вёрсткой, как и остальные макеты интерфейса на сайте.
 */
export function FollowUpPlan({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.plan`);
  const steps = t.raw('steps') as Step[];

  return (
    <div className="relative mx-auto w-[24rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="text-sm text-chalk">{t('title')}</span>
          <span className="font-mono text-[11px] tracking-wider text-chalk-faint tabular-nums">
            {t('number')}
          </span>
        </div>

        <ol className="px-6 py-5">
          {steps.map((step, i) => {
            const last = i === steps.length - 1;
            return (
              <li key={i} className="relative grid grid-cols-[1.25rem_1fr] gap-x-4">
                {/* Отрезок дорожки. У последнего шага его нет: линия,
                    уходящая в пустоту, читалась бы как «продолжение
                    следует» — ровно то, чего агент не делает. */}
                {!last && (
                  <span
                    className="absolute top-5 bottom-0 left-[0.59rem] w-px bg-white/10"
                    aria-hidden
                  />
                )}

                <span className="flex h-5 items-center justify-center">
                  <Marker state={step.state} />
                </span>

                <div className={last ? 'pb-0' : 'pb-6'}>
                  <p
                    className={`font-mono text-[10px] tracking-wider uppercase ${
                      step.state === 'stopped' ? 'text-chalk-faint' : 'text-chalk-dim'
                    }`}
                  >
                    {step.day}
                  </p>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      step.state === 'stopped'
                        ? 'text-chalk-faint line-through decoration-white/25'
                        : 'text-chalk'
                    }`}
                  >
                    {step.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-white/8 bg-aurora-warm/6 px-6 py-4">
          <p className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
            {t('stopLabel')}
          </p>
          <p className="mt-1.5 text-sm text-chalk">{t('stop')}</p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}

/** Отправлено — заполненная точка, отменено — крестик, начало — кольцо. */
function Marker({ state }: { state: Step['state'] }) {
  if (state === 'stopped') {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden className="text-chalk-faint">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (state === 'origin') {
    return <span className="size-2.5 rounded-full border border-white/25" />;
  }

  return (
    <span className="size-2.5 rounded-full bg-aurora-warm shadow-[0_0_10px_var(--color-aurora-warm)]" />
  );
}
