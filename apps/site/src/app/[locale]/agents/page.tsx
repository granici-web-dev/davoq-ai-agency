import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/agent/SectionHead';
import { AGENTS } from '@/lib/catalog';
import { PLAN_FOR_AGENT } from '@/lib/pricing';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agentsHub' });
  const path = '/agents';
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: locale === routing.defaultLocale ? path : `/${locale}${path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, l === routing.defaultLocale ? path : `/${l}${path}`]),
      ),
    },
    openGraph: { title: t('metaTitle'), description: t('metaDescription'), type: 'website' },
  };
}

/**
 * Хаб агентов.
 *
 * Витрина шести карточек здесь была бы третьей копией того, что уже стоит
 * на главной и в выпадающем меню. Хаб отвечает на другой вопрос — не «кто
 * есть», а «кто нужен мне», — и потому выстраивает агентов не сеткой,
 * а вдоль пути одного клиента: спросил, решился, замолчал, купил, ждёт.
 *
 * Порядок берётся из каталога и не задаётся здесь заново: он там уже
 * стоит в этом самом порядке, потому что каталог писался по тому же пути.
 * Шестой агент замыкает круг и приводит следующего человека к первому
 * вопросу — поэтому он последний, хотя работает раньше всех.
 *
 * Главное на странице — не описание агента, а строка «без него». Человек
 * узнаёт не продукт, а свою потерю, и уже по ней выбирает.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agentsHub');
  const tAgents = await getTranslations('agents');
  const tStatus = await getTranslations('status');
  const tPlans = await getTranslations('plans');
  const tHomeAgents = await getTranslations('home.agents');
  const tNav = await getTranslations('nav');

  return (
    <>
      <section className="relative isolate overflow-hidden px-6 pt-40 pb-section sm:px-8">
        <div className="aurora" aria-hidden />
        <div className="relative mx-auto max-w-7xl">
          <p className="enter eyebrow" style={{ animationDelay: '120ms' }}>
            {t('eyebrow')}
          </p>
          <h1 className="enter mt-6 max-w-3xl text-h1 font-medium" style={{ animationDelay: '220ms' }}>
            {t('title')}
          </h1>
          <p
            className="enter mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim"
            style={{ animationDelay: '360ms' }}
          >
            {t('lead')}
          </p>
          <div className="enter mt-10 flex flex-wrap items-center gap-3" style={{ animationDelay: '480ms' }}>
            <DemoButton>{tNav('cta')}</DemoButton>
            <Cta href="/pricing" variant="ghost">
              {tNav('pricing')}
            </Cta>
          </div>
        </div>
      </section>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={t('pathEyebrow')} title={t('pathTitle')} lead={t('pathLead')} />

            <ol className="mt-14">
              {AGENTS.map((agent, i) => {
                const available = agent.status === 'available';
                return (
                  <li key={agent.slug} className="border-t border-white/8 last:border-b">
                    {/* Ссылка на всю строку, а не только на стрелку:
                        строка и есть один выбор, и попадать в неё должно
                        быть так же легко, как в карточку. */}
                    <Link
                      href={`/agents/${agent.slug}`}
                      className="group grid gap-6 py-10 lg:grid-cols-[10rem_1fr_auto] lg:items-start lg:gap-12"
                    >
                      <div>
                        <p className="font-mono text-[11px] text-chalk-faint tabular-nums">
                          {String(i + 1).padStart(2, '0')}
                        </p>
                        <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-wider text-chalk-dim uppercase">
                          {t(`steps.${agent.slug}.stage`)}
                        </p>
                      </div>

                      <div className="max-w-2xl">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-h3 font-medium">{tAgents(`${agent.slug}.name`)}</h3>
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
                            {available ? tStatus('available') : tStatus('soon')}
                          </span>
                          <span className="rounded-pill border border-white/12 px-3 py-1 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                            {tPlans('includedIn', {
                              plan: tPlans(`${PLAN_FOR_AGENT[agent.slug]}.name`),
                            })}
                          </span>
                        </div>

                        <p className="mt-4 leading-relaxed text-chalk-dim">
                          {tAgents(`${agent.slug}.short`)}
                        </p>

                        {/* Ради этой строки страница и существует: она
                            называет потерю, а не возможность. Янтарная
                            черта — единственный акцент в строке, и стоит
                            он там, где человек узнаёт себя. */}
                        <p className="mt-6 border-l-2 border-aurora-warm/40 pl-4 text-sm leading-relaxed text-chalk-dim">
                          <span className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
                            {t('withoutLabel')}
                          </span>
                          <br />
                          {t(`steps.${agent.slug}.without`)}
                        </p>
                      </div>

                      <span className="font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk lg:pt-2">
                        {t('open')}{' '}
                        <span className="inline-block transition-transform group-hover:translate-x-1">
                          →
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={t('plansEyebrow')} title={t('plansTitle')} lead={t('plansLead')} />

            {/* Состав пакетов считается из той же таблицы, что и бейджи
                выше: два списка, написанные руками, разойдутся с ней на
                первой же перестановке агента между пакетами.

                Двумя карточками это не встаёт: в Start агент ровно один,
                и рядом с пятью в Growth его карточка выглядела пустой —
                хотя Start пустым не является, просто остальное в нём
                не агенты. Две строки не врут ни про одну из ступеней. */}
            <div className="mt-14 overflow-hidden rounded-card border border-white/8">
              {(['start', 'growth'] as const).map((plan) => {
                const inPlan = AGENTS.filter((a) => PLAN_FOR_AGENT[a.slug] === plan);
                /* Когда вся ступень ещё впереди, метка «в курând» стоит
                   одна у названия пакета, а не пять раз подряд у каждого
                   агента. Пять одинаковых подписей в строке читаются как
                   шум и прячут ровно то, что должны сказать. Как только
                   первый агент ступени выйдет, метки вернутся к строкам —
                   потому что тогда они начнут различать. */
                const allSoon = inPlan.every((a) => a.status !== 'available');
                return (
                  <div
                    key={plan}
                    className="grid gap-4 border-b border-white/8 px-7 py-7 sm:px-8 lg:grid-cols-[10rem_1fr] lg:gap-12"
                  >
                    <div>
                      <h3 className="text-h3 font-medium">{tPlans(`${plan}.name`)}</h3>
                      <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                        {t(plan === 'start' ? 'startLabel' : 'growthLabel')}
                        {allSoon && (
                          <span className="rounded-pill border border-white/10 px-2 py-0.5">
                            {tStatus('soon')}
                          </span>
                        )}
                      </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:pt-1">
                      {inPlan.map((agent) => (
                        <li key={agent.slug} className="flex items-center gap-2.5 text-chalk-dim">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              agent.status === 'available'
                                ? 'bg-aurora-warm shadow-[0_0_8px_var(--color-aurora-warm)]'
                                : 'bg-white/25'
                            }`}
                            aria-hidden
                          />
                          {tAgents(`${agent.slug}.name`)}
                          {!allSoon && agent.status !== 'available' && (
                            <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                              {tStatus('soon')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {/* Оговорка обязательна: список выше — только агенты, а
                  ступени состоят не из них одних. Без неё Start читается
                  как «один чат-бот за те же деньги». */}
              <div className="flex flex-col gap-4 px-7 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <p className="max-w-2xl text-sm leading-relaxed text-chalk-dim">{t('plansNote')}</p>
                <Link
                  href="/pricing"
                  className="group shrink-0 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors hover:text-chalk"
                >
                  {t('plansLink')}{' '}
                  <span className="inline-block transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </div>
            </div>

            {/* Седьмая плитка — не агент, а разговор. Тексты те же, что
                на главной: два разных обещания «сделаем под вас» на одном
                сайте разъехались бы уже на второй правке. */}
            <Link
              href="/contact"
              className="group mt-4 flex flex-col rounded-card border border-dashed border-white/12 p-7 transition-colors hover:border-white/25 hover:bg-white/2 sm:p-8"
            >
              <h3 className="font-medium">{tHomeAgents('custom.title')}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-chalk-dim">
                {tHomeAgents('custom.text')}
              </p>
              <span className="mt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                {tHomeAgents('custom.cta')}{' '}
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="relative isolate overflow-hidden px-6 py-section sm:px-8">
          <div className="aurora" aria-hidden />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <h2 className="text-h1 font-medium">{t('closingTitle')}</h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim">{t('closingLead')}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <DemoButton>{tNav('cta')}</DemoButton>
              <Cta href="/industries" variant="ghost">
                {tNav('allIndustries')}
              </Cta>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
