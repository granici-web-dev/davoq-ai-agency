import { useTranslations } from 'next-intl';
import { MATRIX, PLANS } from '@/lib/pricing';

/**
 * Матрица сравнения.
 *
 * Для тех, кто выбирает не по обещанию, а по строчкам. Карточки выше
 * отвечают на «что мне взять», матрица — на «а что именно я не получу,
 * если возьму дешевле».
 *
 * Настоящая `<table>`, а не сетка из блоков: скринридер объявляет, в
 * какой колонке находится ячейка, только если это таблица с заголовками.
 * В сетке человек услышит «Inclus» тринадцать раз подряд и не узнает,
 * к какому пакету это относится.
 *
 * Отсюда же и подписи `sr-only` внутри ячеек: галочка — картинка, и без
 * слова она не читается вслух ничем.
 */
export function Matrix() {
  const t = useTranslations('plans.matrix');
  const tPlans = useTranslations('plans');

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/12">
            <th scope="col" className="py-4 pr-6 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
              {t('feature')}
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={`w-[9rem] px-4 py-4 font-mono text-[11px] tracking-wider uppercase ${
                  plan.featured ? 'text-chalk' : 'text-chalk-dim'
                }`}
              >
                {tPlans(`${plan.id}.name`)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {MATRIX.map((row) => (
            <tr key={row.key} className="border-b border-white/8">
              <th scope="row" className="py-4 pr-6 text-sm font-normal text-chalk-dim">
                {t(`rows.${row.key}.label`)}
                {row.soon && (
                  <span className="ml-2 inline-block rounded-pill border border-white/12 px-2 py-0.5 align-middle font-mono text-[9px] tracking-wider text-chalk-faint uppercase">
                    {tPlans('soon')}
                  </span>
                )}
              </th>

              {PLANS.map((plan) => {
                const cell = row[plan.id];
                return (
                  <td
                    key={plan.id}
                    className={`px-4 py-4 text-sm ${plan.featured ? 'bg-white/4' : ''}`}
                  >
                    {cell === 'value' ? (
                      <span className="text-chalk">{t(`rows.${row.key}.${plan.id}`)}</span>
                    ) : cell ? (
                      <>
                        <span className="sr-only">{t('yes')}</span>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="text-aurora-warm">
                          <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </>
                    ) : (
                      <>
                        <span className="sr-only">{t('no')}</span>
                        <span className="block h-px w-3 bg-white/20" aria-hidden />
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
