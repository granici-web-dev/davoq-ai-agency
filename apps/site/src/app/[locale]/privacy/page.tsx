import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
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
  const t = await getTranslations({ locale, namespace: 'privacyPage' });
  const path = '/privacy';
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: locale === routing.defaultLocale ? path : `/${locale}${path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, l === routing.defaultLocale ? path : `/${l}${path}`]),
      ),
    },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage namespace="privacyPage" />;
}
