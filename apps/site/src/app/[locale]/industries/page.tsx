import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/agent/SectionHead';
import { INDUSTRIES } from '@/lib/catalog';
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
  const t = await getTranslations({ locale, namespace: 'industriesHub' });
  const path = '/industries';
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
 * Хаб индустрий.
 *
 * На главной ниши стоят вкладками: там показывают, что сценарий бывает
 * разный. Здесь другой вопрос — «а моя есть в списке, и если нет, то
 * работает ли это у меня». Поэтому все шесть открыты сразу, а под ними
 * стоит признак пригодности: не «пишите, обсудим», а три условия,
 * по которым человек проверит себя сам и уйдёт, если не подходит.
 *
 * Прогонять того, кому не подходит, дешевле для обеих сторон, чем
 * доводить его до демонстрации.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('industriesHub');
  const tIndustries = await getTranslations('industries');
  const tAgents = await getTranslations('agents');
  const tHome = await getTranslations('home.industries');
  const tNav = await getTranslations('nav');

  const signs = t.raw('signs') as string[];

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
            <Cta href="/agents" variant="ghost">
              {tNav('allAgents')}
            </Cta>
          </div>
        </div>
      </section>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={t('listEyebrow')} title={t('listTitle')} lead={t('listLead')} />

            <ul className="mt-14 grid gap-4 lg:grid-cols-2">
              {INDUSTRIES.map((industry) => (
                <li key={industry.slug}>
                  <Link
                    href={`/industries/${industry.slug}`}
                    className="card group flex h-full flex-col p-7 hover:-translate-y-0.5 sm:p-8"
                  >
                    <h3 className="text-h3 font-medium">{tIndustries(`${industry.slug}.name`)}</h3>
                    <p className="mt-4 leading-relaxed text-chalk-dim">
                      {tIndustries(`${industry.slug}.panel`)}
                    </p>

                    {/* Агенты — обычные метки, а не ссылки: карточка сама
                        ссылка, и ссылка внутри ссылки — невалидная
                        разметка, по которой клавиатура ходит вслепую. */}
                    <p className="mt-8 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                      {tHome('agentsLabel')}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {industry.agents.map((slug) => (
                        <li
                          key={slug}
                          className="rounded-pill border border-white/12 px-3 py-1.5 text-xs text-chalk-dim"
                        >
                          {tAgents(`${slug}.name`)}
                        </li>
                      ))}
                    </ul>

                    <span className="mt-auto pt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                      {tHome('view')}{' '}
                      <span className="inline-block transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={t('otherEyebrow')} title={t('otherTitle')} lead={t('otherLead')} />

            {/* Три условия пронумерованы, а не помечены галочками:
                галочка обещает, что всё уже так; цифра просит проверить. */}
            <ol className="mt-14 grid gap-px overflow-hidden rounded-card border border-white/8 bg-white/8 lg:grid-cols-3">
              {signs.map((sign, i) => (
                <li key={i} className="bg-ink-950 px-7 py-8">
                  <p className="font-mono text-[11px] text-chalk-faint tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <p className="mt-5 leading-relaxed text-chalk-dim">{sign}</p>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-6">
              <p className="max-w-xl text-sm leading-relaxed text-chalk-dim">{tHome('otherText')}</p>
              <Cta href="/contact" variant="ghost">
                {t('otherCta')}
              </Cta>
            </div>
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
              <Cta href="/pricing" variant="ghost">
                {tNav('pricing')}
              </Cta>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
