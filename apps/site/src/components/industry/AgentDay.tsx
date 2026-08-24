import { useTranslations } from 'next-intl';

interface Entry {
  time: string;
  agent: string;
  text: string;
}

/**
 * День в мастерской.
 *
 * Виджет чат-бота, стоявший здесь раньше, сужал страницу до одного агента,
 * хотя ниже она предлагает четырёх. Лента событий показывает набор:
 * разные агенты, разное время суток, разная работа.
 *
 * Время в первой колонке — не украшение. Оно и есть аргумент: 08:40,
 * 22:14, «vineri». Человек видит, что это происходит тогда, когда его
 * в мастерской нет, раньше, чем читает про 24/7 словами.
 *
 * Под лентой одна честная строка: так выглядит день, когда работают все,
 * а сегодня доступен один. Помечать каждую строку бейджем «в разработке»
 * было бы точнее и совершенно нечитаемо.
 */
export function AgentDay({ namespace }: { namespace: string }) {
  const t = useTranslations(namespace);
  const entries = t.raw('day.entries') as Entry[];

  return (
    <div className="relative mx-auto w-[24rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="text-sm text-chalk">{t('day.title')}</span>
          <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('day.label')}
          </span>
        </div>

        <ol className="divide-y divide-white/8">
          {entries.map((entry, i) => (
            <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-4 px-6 py-4">
              <span className="pt-0.5 font-mono text-[11px] text-chalk-faint tabular-nums">
                {entry.time}
              </span>
              <span>
                <span className="block font-mono text-[10px] tracking-wider text-chalk-dim uppercase">
                  {entry.agent}
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed text-chalk">
                  {entry.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('day.note')}</p>
    </div>
  );
}
