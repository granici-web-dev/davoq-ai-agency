import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { IndustryPage } from '@/components/industry/IndustryPage';
import { industryBySlug, INDUSTRY_SLUGS } from '@/lib/catalog';
import { routing } from '@/i18n/routing';

/**
 * Страница индустрии. Всё статикой; слаг вне каталога даёт 404 на сборке,
 * а не рендерится на лету — иначе опечатка в ссылке живёт годами.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    INDUSTRY_SLUGS.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const industry = industryBySlug(slug);
  if (!industry) return {};

  const t = await getTranslations({ locale, namespace: 'industries' });
  let title = t(`${slug}.name`);
  let description = t(`${slug}.short`);

  /* Оптимизированный под поиск заголовок принадлежит той нише, у которой
     написана страница. Признак берётся из каталога — того же места, что
     и у компонента: два списка «полных ниш» уже расходились однажды. */
  if (industry.full) {
    const page = await getTranslations({ locale, namespace: `industryPage.${slug}` });
    title = page('metaTitle');
    description = page('metaDescription');
  }

  const path = `/industries/${slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: locale === routing.defaultLocale ? path : `/${locale}${path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, l === routing.defaultLocale ? path : `/${l}${path}`]),
      ),
    },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const industry = industryBySlug(slug);
  if (!industry) notFound();

  return <IndustryPage industry={industry} />;
}
