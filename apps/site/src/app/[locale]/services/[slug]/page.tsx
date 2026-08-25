import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ServicePage } from '@/components/service/ServicePage';
import { SERVICE_SLUGS, serviceBySlug } from '@/lib/services';
import { routing } from '@/i18n/routing';

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => SERVICE_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!serviceBySlug(slug)) return {};
  const t = await getTranslations({ locale, namespace: `servicePage.${slug}` });
  const path = `/services/${slug}`;
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

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const service = serviceBySlug(slug);
  if (!service) notFound();
  return <ServicePage service={service} />;
}
