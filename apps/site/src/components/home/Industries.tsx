import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { INDUSTRIES } from '@/lib/catalog';

/**
 * Индустрии.
 *
 * Строки во всю ширину, а не ещё одна сетка карточек. Витрина агентов выше
 * уже занята карточками, и повторить их здесь значило бы сказать «это то же
 * самое, только другими словами». Список во всю ширину читается как
 * справочник — чем он и является.
 *
 * У строки есть свободное место справа ровно под миниатюру 16:9. Если решение
 * по фотографиям окажется в пользу фотографий, кадр встанет туда, не трогая
 * ни разметку, ни ритм секции.
 *
 * Все три колонки заданы долями, ни одна не `auto`. С `auto` ширина третьей
 * колонки зависела бы от длины списка агентов — а он у каждой ниши свой, —
 * и начало средней колонки прыгало бы от строки к строке. Читается это как
 * неровный край, причину которого не видно.
 */
export function Industries() {
  const t = useTranslations('home.industries');
  const tIndustries = useTranslations('industries');
  const tAgents = useTranslations('agents');
  const tNav = useTranslations('nav');

  return (
    <section id="industrii" className="relative px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 className="mt-6 text-h2 font-medium">{t('title')}</h2>
            <p className="mt-5 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>
          </div>

          <Link
            href="/industries"
            className="shrink-0 font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
          >
            {tNav('allIndustries')} →
          </Link>
        </div>

        <ul className="mt-14 border-t border-white/8">
          {INDUSTRIES.map((industry) => (
            <li key={industry.slug}>
              <Link
                href={`/industries/${industry.slug}`}
                className="group relative isolate grid items-baseline gap-x-10 gap-y-2 border-b border-white/8 py-7 lg:grid-cols-[1.05fr_0.95fr_1fr]"
              >
                {/* Подсветка строки шире самой строки: заливка, обрывающаяся
                    ровно по колонке текста, читается как выделенная ячейка
                    таблицы, а не как наведение на пункт. */}
                <span
                  className="pointer-events-none absolute inset-y-0 -inset-x-6 -z-10 rounded-2xl bg-linear-to-r from-white/5 via-white/2 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden
                />

                <h3 className="text-h3 font-medium transition-transform duration-300 group-hover:translate-x-1">
                  {tIndustries(`${industry.slug}.name`)}
                </h3>

                <p className="text-sm leading-relaxed text-chalk-dim">
                  {tIndustries(`${industry.slug}.short`)}
                </p>

                {/* Агенты берутся из каталога: это и подсказка «с чего начать
                    в этой нише», и перелинковка между двумя разделами сайта,
                    которую иначе пришлось бы держать в голове. */}
                <p className="font-mono text-[10px] leading-relaxed tracking-wider text-chalk-faint uppercase lg:text-right">
                  {industry.agents.map((slug) => tAgents(`${slug}.name`)).join(' · ')}
                </p>
              </Link>
            </li>
          ))}

          {/* Последняя строка отвечает на вопрос, который возникает ровно
              здесь: человек дочитал шесть ниш и своей не нашёл. Витрина выше
              спрашивает про недостающего агента, эта — про недостающую нишу.
              Вопросы разные, и оба настоящие. */}
          <li>
            <Link
              href="/contact"
              className="group relative isolate grid items-baseline gap-x-10 gap-y-2 border-b border-white/8 py-7 lg:grid-cols-[1.05fr_0.95fr_1fr]"
            >
              <span
                className="pointer-events-none absolute inset-y-0 -inset-x-6 -z-10 rounded-2xl bg-linear-to-r from-white/5 via-white/2 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                aria-hidden
              />
              <h3 className="text-h3 font-medium text-chalk-dim transition-all duration-300 group-hover:translate-x-1 group-hover:text-chalk">
                {tIndustries('other.name')}
              </h3>
              <p className="text-sm leading-relaxed text-chalk-dim">{t('otherText')}</p>
              <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk lg:text-right">
                {t('otherCta')} →
              </p>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
