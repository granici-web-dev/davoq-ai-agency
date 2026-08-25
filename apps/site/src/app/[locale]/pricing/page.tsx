import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { AgentPriceGrid } from '@/components/pricing/AgentPriceGrid';
import { BundleTerms } from '@/components/pricing/BundleTerms';
import { FaqList } from '@/components/ui/FaqList';
import { Reveal } from '@/components/ui/Reveal';
import { DemoButton } from '@/components/ui/DemoButton';
import { Cta } from '@/components/ui/Cta';
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
  const t = await getTranslations({ locale, namespace: 'pricingPage' });
  const path = '/pricing';
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

  const t = await getTranslations('pricingPage');
  const tPricing = await getTranslations('agentPricing');
  const faqCount = (tPricing.raw('faq') as unknown[]).length;

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

          {/* Оговорка про «в curând» стоит в первом экране: она меняет
              решение о покупке и должна попасться на глаза до того, как
              человек начнёт листать шесть агентов. */}
          <p
            className="enter mt-8 max-w-2xl text-sm leading-relaxed text-chalk-dim"
            style={{ animationDelay: '460ms' }}
          >
            {t('soonNote')}
          </p>
        </div>
      </section>

      {/* Сетка отдельной секцией, а не в герое: её липкая шапка с навигацией
          и переключателем не должна уезжать вместе с заголовком страницы. */}
      <section className="px-6 pb-section sm:px-8">
        <AgentPriceGrid />
      </section>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-h2 font-medium">{t('bundleTitle')}</h2>
            <p className="mt-4 max-w-xl text-body text-chalk-dim">{t('bundleLead')}</p>
            <div className="mt-12">
              <BundleTerms />
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="eyebrow">{t('faqEyebrow')}</p>
              <h2 className="mt-6 text-h2 font-medium">{t('faqTitle')}</h2>
            </div>
            <FaqList namespace="agentPricing.faq" count={faqCount} />
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
              <DemoButton>{t('closingCta')}</DemoButton>
              <Cta href="/agents/chatbot" variant="ghost">
                {t('closingSecondary')}
              </Cta>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
