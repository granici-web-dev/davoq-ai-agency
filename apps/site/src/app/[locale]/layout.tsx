import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import '../globals.css';

/**
 * Шрифты отдаются с нашего домена, а не с fonts.gstatic.com.
 *
 * `next/font` вшивает файлы в сборку: обращения браузера посетителя
 * к чужому CDN нет вовсе. Для сайта, который продаёт изоляцию данных,
 * это не мелочь.
 */
const sans = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-instrument',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-mono-face',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });

  return {
    title: { default: `${t('name')} — ${t('tagline')}`, template: `%s · ${t('name')}` },
    description: t('tagline'),
    // hreflang: у каждой страницы обе версии объявлены явно, иначе поиск
    // считает румынскую и английскую разными страницами и делит между ними вес.
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, l === routing.defaultLocale ? '/' : `/${l}`])),
    },
    openGraph: {
      type: 'website',
      locale: locale === 'ro' ? 'ro_RO' : 'en_US',
      siteName: t('name'),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Без этого страницы уходят в динамический рендер, а сайт — витрина:
  // всё, что можно, обязано быть статикой.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
