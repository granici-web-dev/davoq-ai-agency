import { useTranslations } from 'next-intl';

interface Stage {
  name: string;
  state: 'done' | 'current' | 'next';
}

/**
 * Страница заказа глазами клиента.
 *
 * Единственный из шести агентов, чья работа видна не продавцу, а
 * покупателю. Все остальные макеты на сайте показывают рабочее место
 * продавца — переписка, фишка, карточка, план возвратов. Показать здесь
 * седьмой продавцовый экран значило бы спрятать то, чем этот агент
 * отличается: клиент перестаёт звонить не потому, что кому-то удобнее,
 * а потому, что ему самому есть куда посмотреть.
 *
 * Дорожка горизонтальная — не из вкуса. Вертикальная уже занята планом
 * возвратов, и два вертикальных списка с точками на соседних страницах
 * читались бы как один и тот же агент.
 *
 * Собрано вёрсткой, как и остальные макеты интерфейса на сайте.
 */
export function OrderStatus({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.order`);
  const stages = t.raw('stages') as Stage[];

  return (
    <div className="relative mx-auto w-[24rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="text-sm text-chalk">
            {t('title')}{' '}
            <span className="font-mono tabular-nums text-chalk-dim">{t('number')}</span>
          </span>
        </div>

        <div className="border-b border-white/8 px-6 py-5">
          <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('etaLabel')}
          </p>
          <p className="mt-1 text-sm text-chalk">{t('eta')}</p>

          <ol className="mt-6 grid grid-cols-4">
            {stages.map((stage, i) => {
              /* Отрезок слева окрашен, если предыдущий этап пройден:
                 цвет линии — это и есть пройденный путь, отдельной
                 полосы прогресса тут не нужно. */
              const passed = stages[i - 1]?.state === 'done';
              return (
                <li key={stage.name} className="relative flex flex-col items-center">
                  {i > 0 && (
                    <span
                      className={`absolute top-[0.31rem] right-1/2 h-px w-full ${
                        passed ? 'bg-aurora-warm/60' : 'bg-white/12'
                      }`}
                      aria-hidden
                    />
                  )}

                  <span className="relative">
                    <StageDot state={stage.state} />
                  </span>

                  <span
                    className={`mt-3 text-center font-mono text-[9px] leading-tight tracking-wider uppercase ${
                      stage.state === 'current'
                        ? 'text-chalk'
                        : stage.state === 'done'
                          ? 'text-chalk-dim'
                          : 'text-chalk-faint'
                    }`}
                  >
                    {stage.name}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
              {t('currentLabel')}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-chalk-faint tabular-nums">
              {t('updated')}
            </p>
          </div>
          <p className="mt-2 text-sm text-chalk">{t('current')}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-chalk-dim">{t('text')}</p>
        </div>

        <p className="border-t border-white/8 px-6 py-4 text-xs text-chalk-faint">
          <span className="text-chalk-dim">{t('nextLabel')}: </span>
          {t('next')}
        </p>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}

/** Пройден — заполненная точка, идёт сейчас — точка в кольце, впереди — пустая. */
function StageDot({ state }: { state: Stage['state'] }) {
  if (state === 'current') {
    return (
      <span className="flex size-2.5 items-center justify-center rounded-full ring-4 ring-aurora-warm/20">
        <span className="size-2.5 rounded-full bg-aurora-warm shadow-[0_0_10px_var(--color-aurora-warm)]" />
      </span>
    );
  }

  if (state === 'done') {
    return <span className="block size-2.5 rounded-full bg-aurora-warm/70" />;
  }

  return <span className="block size-2.5 rounded-full border border-white/20 bg-ink-950" />;
}
