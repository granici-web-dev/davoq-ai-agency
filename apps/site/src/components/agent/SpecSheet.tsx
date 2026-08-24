import { useTranslations } from 'next-intl';

interface Row {
  k: string;
  v: string;
}

/**
 * Фишка заявки, собранная конфигуратором.
 *
 * У чат-бота в первом экране стоит разговор — там убеждает сам диалог.
 * У конфигуратора убеждает не разговор, а то, что из него осталось:
 * заполненные поля, по которым можно считать. Показывать здесь ещё одну
 * переписку значило бы показать работу соседнего агента.
 *
 * Последней строкой идёт то, чего агент НЕ узнал, и идёт она заметно —
 * янтарным, отдельным блоком. Карточка, где заполнено всё, обещает
 * агента, который никогда не упирается в незнание клиента; такого нет.
 * Помеченный пробел — единственная строка, ради которой продавец
 * вообще откроет фишку сразу, а не через день.
 *
 * Собрано вёрсткой, как и остальные макеты интерфейса на сайте:
 * в сгенерированной картинке текст выходит нечитаемым, а снимок экрана
 * пришлось бы переснимать на каждую правку и отдельно для английской
 * версии.
 */
export function SpecSheet({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.spec`);
  const rows = t.raw('rows') as Row[];

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

        <dl className="divide-y divide-white/8">
          {rows.map((row) => (
            <div key={row.k} className="grid grid-cols-[8.5rem_1fr] items-baseline gap-4 px-6 py-3">
              <dt className="flex items-baseline gap-2 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {/* Галочка у каждой заполненной строки — чтобы одна
                    строка без неё бросалась в глаза, а не терялась. */}
                <CheckIcon />
                {row.k}
              </dt>
              <dd className="text-sm text-chalk">{row.v}</dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-white/8 bg-aurora-warm/6 px-6 py-4">
          <p className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
            {t('pendingLabel')}
          </p>
          <p className="mt-1.5 text-sm text-chalk">{t('pending')}</p>
        </div>

        <p className="border-t border-white/8 px-6 py-4 text-xs text-chalk-faint">{t('footer')}</p>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 translate-y-px text-aurora-warm"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
