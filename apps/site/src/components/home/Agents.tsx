import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AGENTS } from '@/lib/catalog';

/**
 * Витрина агентов.
 *
 * Каталог задаёт порядок и статусы, тексты живут в messages. Секция не знает
 * ни одного слага руками: седьмой агент появится здесь сам, стоит добавить
 * его в `catalog.ts`.
 *
 * Доступный агент занимает две колонки вместо одной. Это и есть главное
 * сообщение секции: один продукт продаётся сегодня, остальные пять — нет.
 * Сказать это планировкой честнее и быстрее, чем шестью одинаковыми
 * карточками с мелким бейджем, где разницу приходится вычитывать.
 */
export function Agents() {
  const t = useTranslations('home.agents');
  const tAgents = useTranslations('agents');
  const tIndustries = useTranslations('industries');
  const tStatus = useTranslations('status');
  const tNav = useTranslations('nav');

  return (
    <section id="agenti" className="relative isolate px-6 py-section sm:px-8">
      <div className="aurora" aria-hidden />

      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 className="mt-6 text-h2 font-medium">{t('title')}</h2>
            <p className="mt-5 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>
          </div>

          <Link
            href="/agents"
            className="shrink-0 font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
          >
            {tNav('allAgents')} →
          </Link>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent) => {
            const available = agent.status === 'available';
            return (
              <li key={agent.slug} className={available ? 'lg:col-span-2' : undefined}>
                <Link
                  href={`/agents/${agent.slug}`}
                  className="card group relative flex h-full flex-col overflow-hidden p-7 hover:-translate-y-0.5"
                >
                  {/* Тёплое пятно в углу — только у доступного агента.
                      Цветом не заливается ничего: свет остаётся светом. */}
                  {available && (
                    <span
                      className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-aurora-warm/12 blur-3xl"
                      aria-hidden
                    />
                  )}

                  <div className="relative flex items-start justify-between gap-4">
                    <h3 className={available ? 'text-h3 font-medium' : 'font-medium'}>
                      {tAgents(`${agent.slug}.name`)}
                    </h3>
                    <Status available={available}>
                      {available ? tStatus('available') : tStatus('soon')}
                    </Status>
                  </div>

                  <p
                    className={`relative mt-3 leading-relaxed text-chalk-dim ${
                      available ? 'max-w-md' : 'text-sm'
                    }`}
                  >
                    {tAgents(`${agent.slug}.short`)}
                  </p>

                  {/* Отрасли — только на большой карточке, где есть место.
                      Список берётся из каталога, а не пишется руками: он
                      отвечает на вопрос «а у меня это сработает?» прямо
                      здесь, не отправляя человека на страницу агента. */}
                  {available && (
                    <p className="relative mt-6 font-mono text-[10px] leading-relaxed tracking-wider text-chalk-faint uppercase">
                      {agent.industries
                        .map((slug) => tIndustries(`${slug}.name`))
                        .join(' · ')}
                    </p>
                  )}

                  <span className="relative mt-auto pt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                    {t('open')}{' '}
                    <span className="inline-block transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}

          {/* Седьмая плитка — не агент, а приглашение к разговору.
              Она закрывает вопрос «а если мне нужно другое» на месте,
              вместо того чтобы отпускать человека со страницы искать
              контакты.

              Ширина в две колонки не декоративная: шесть агентов дают
              семь колонок вместе с двухколоночным первым, и без этой
              плитки в нижнем ряду оставалась бы дыра. */}
          <li className="sm:col-span-2">
            <Link
              href="/contact"
              className="group flex h-full flex-col rounded-card border border-dashed border-white/12 p-7 transition-colors hover:border-white/25 hover:bg-white/2"
            >
              <h3 className="font-medium">{t('custom.title')}</h3>
              <p className="mt-3 text-sm leading-relaxed text-chalk-dim">{t('custom.text')}</p>
              <span className="mt-auto pt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                {t('custom.cta')}{' '}
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

/**
 * Метка состояния.
 *
 * У доступного — точка со свечением, у остальных её нет. Разница держится
 * на форме, а не только на оттенке серого: два серых бейджа рядом
 * различаются лишь тем, кто их сравнивает вплотную.
 */
function Status({ available, children }: { available: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-2 rounded-pill border px-3 py-1 font-mono text-[10px] tracking-wider uppercase ${
        available
          ? 'border-aurora-warm/30 text-chalk'
          : 'border-white/10 text-chalk-faint'
      }`}
    >
      {available && (
        <span
          className="size-1.5 rounded-full bg-aurora-warm shadow-[0_0_8px_var(--color-aurora-warm)]"
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
