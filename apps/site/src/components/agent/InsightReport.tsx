import { useTranslations } from 'next-intl';

interface Finding {
  severity: 'high' | 'medium';
  title: string;
  text: string;
  loss: string;
  owner: string;
  due: string;
}

/**
 * Утренний разбор — то, что этот агент кладёт руководителю на стол.
 *
 * Остальные шесть макетов показывают работу с клиентом: переписку, фишку,
 * план возвратов, страницу заказа. Этот агент с клиентом не разговаривает
 * вовсе, и показать здесь ещё одну переписку значило бы соврать о том,
 * что покупают.
 *
 * Поэтому здесь документ, а не интерфейс: то, что человек читает утром
 * за кофе. И самое важное в нём — не заголовок проблемы, а два числа
 * рядом с ней: во сколько обходится и кто за неё берётся. Разбор без
 * суммы читается как мнение, разбор без ответственного — как жалоба.
 *
 * Сумма набрана моноширинным и выровнена по разряду: в списке из трёх
 * проблем взгляд сравнивает величины, а не читает слова.
 *
 * Цифры здесь показывают форму отчёта, а не чей-то результат — об этом
 * прямо сказано подписью снизу, как и у остальных макетов.
 */
export function InsightReport({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.report`);
  const findings = t.raw('findings') as Finding[];

  return (
    <div className="relative mx-auto w-[26rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-cool/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-baseline justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="text-sm text-chalk">{t('title')}</span>
          <span className="font-mono text-[10px] tracking-wider text-chalk-faint tabular-nums uppercase">
            {t('date')}
          </span>
        </div>

        <p className="border-b border-white/8 px-6 py-5 text-sm leading-relaxed text-chalk-dim">
          {t('summary')}
        </p>

        <ol className="divide-y divide-white/8">
          {findings.map((f) => (
            <li key={f.title} className="px-6 py-5">
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                    f.severity === 'high'
                      ? 'bg-aurora-warm shadow-[0_0_8px_var(--color-aurora-warm)]'
                      : 'bg-white/25'
                  }`}
                  aria-hidden
                />
                <h3 className="text-sm text-chalk">{f.title}</h3>
              </div>

              <p className="mt-2 pl-4 text-sm leading-relaxed text-chalk-dim">{f.text}</p>

              <div className="mt-3 flex items-baseline justify-between gap-4 pl-4">
                <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                  {t('lossLabel')}
                </span>
                <span className="font-mono text-sm text-chalk tabular-nums">{f.loss}</span>
              </div>

              {/* Ответственный и срок — в одной строке с задачей: разбор,
                  который никому не поручен, к утру следующего дня
                  превращается в ещё один непрочитанный отчёт. */}
              <p className="mt-2 pl-4 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {f.owner} · {f.due}
              </p>
            </li>
          ))}
        </ol>

        <p className="border-t border-white/8 px-6 py-4 text-xs text-chalk-faint">
          <span className="text-chalk-dim">{t('nextLabel')}: </span>
          {t('next')}
        </p>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}
