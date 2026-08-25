import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { SERVICES } from '@/lib/services';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { Reveal } from '@/components/ui/Reveal';
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
  const t = await getTranslations({ locale, namespace: 'servicesPage' });
  const path = '/services';
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

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('servicesPage');
  const tServices = await getTranslations('services');

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
            className="enter mt-6 max-w-2xl text-lg leading-relaxed text-chalk-dim"
            style={{ animationDelay: '360ms' }}
          >
            {t('lead')}
          </p>
        </div>
      </section>

      <Reveal>
        <section className="px-6 pb-section sm:px-8">
          {/* Список, а не сетка плиток: услуг четыре, и у каждой есть что
              сказать строкой. Плитки заставили бы резать пояснение до трёх
              слов, а без пояснения «Marketing digital» не значит ничего. */}
          <div className="mx-auto grid max-w-7xl divide-y divide-white/8 overflow-hidden rounded-card border border-white/8">
            {SERVICES.map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="group flex flex-col gap-4 p-7 transition-colors hover:bg-white/3 sm:flex-row sm:items-baseline sm:gap-10 sm:p-9"
              >
                <h2 className="min-w-0 shrink-0 text-h3 font-medium sm:w-72">
                  {tServices(`${service.slug}.name`)}
                </h2>
                <p className="min-w-0 flex-1 leading-relaxed text-chalk-dim">
                  {tServices(`${service.slug}.short`)}
                </p>
                <span className="shrink-0 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                  {t('open')}{' '}
                  <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </span>
              </Link>
            ))}
          </div>

          {/* Оговорка про цену стоит сразу под списком: это первый вопрос,
              который возникает, и узнать ответ на созвоне — худший момент. */}
          <p className="mx-auto mt-8 max-w-3xl text-sm leading-relaxed text-chalk-dim">
            {t('priceNote')}
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="relative isolate overflow-hidden px-6 py-section sm:px-8">
          <div className="aurora" aria-hidden />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <h2 className="text-h1 font-medium">{t('closingTitle')}</h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim">{t('closingLead')}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <DemoButton>{t('cta')}</DemoButton>
              <Cta href="/agents" variant="ghost">
                {t('closingSecondary')}
              </Cta>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
