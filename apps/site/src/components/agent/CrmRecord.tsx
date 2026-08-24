import { useTranslations } from 'next-intl';

interface Change {
  k: string;
  /** Что стояло в поле раньше. Пусто — поля не было заполнено вовсе. */
  from: string;
  to: string;
}

/**
 * Карточка клиента после письма.
 *
 * Показывать заполненную карточку было бы неверно: заполненную карточку
 * рисует и обычная форма. Работа этого агента — не «поля есть», а «поля
 * изменились сами», поэтому здесь не список значений, а список изменений:
 * что стояло, что стало.
 *
 * Пустое прежнее значение показано прочерком, а не пропущено. Строка
 * «Buget: — → 18 000 €» говорит то, чего не скажет строка «Buget:
 * 18 000 €»: до письма этого в CRM не было ни у кого.
 *
 * Внизу задача. Без неё карточка обещает порядок в данных и молчит про
 * то, ради чего порядок нужен, — про следующий шаг, который иначе
 * держится на памяти продавца.
 *
 * Собрано вёрсткой, как и остальные макеты интерфейса на сайте.
 */
export function CrmRecord({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.record`);
  const changes = t.raw('changes') as Change[];

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

        <p className="flex items-center gap-2.5 border-b border-white/8 px-6 py-3.5 text-xs text-chalk-dim">
          <MailIcon />
          {t('source')}
        </p>

        <ul className="divide-y divide-white/8">
          {changes.map((change) => (
            <li key={change.k} className="px-6 py-3.5">
              <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {change.k}
              </p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm">
                {/* Прежнее значение приглушено, новое — обычным цветом.
                    Одинаковым цветом строка читалась бы как «два поля». */}
                <span className="text-chalk-faint">{change.from || '—'}</span>
                <span className="text-chalk-faint" aria-hidden>
                  →
                </span>
                <span className="text-chalk">{change.to}</span>
              </p>
            </li>
          ))}
        </ul>

        <div className="border-t border-white/8 bg-aurora-warm/6 px-6 py-4">
          <p className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
            {t('taskLabel')}
          </p>
          <p className="mt-1.5 text-sm text-chalk">{t('task')}</p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-chalk-faint"
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M4 7l8 5.5L20 7" />
    </svg>
  );
}
