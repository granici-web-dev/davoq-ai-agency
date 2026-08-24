import { getTranslations, setRequestLocale } from 'next-intl/server';

/**
 * Главная. Пока каркас: содержимое приходит на этапе 3, после утверждения
 * направления. Здесь стоит ровно столько, сколько нужно, чтобы увидеть
 * шапку, подвал и токены живьём.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('brand');

  return (
    <section className="relative isolate flex min-h-dvh items-center px-6 pt-32 sm:px-8">
      <div className="aurora" aria-hidden />
      <div className="relative mx-auto w-full max-w-7xl">
        <p className="eyebrow">Schelet · Etapa 1</p>
        <h1 className="mt-6 max-w-4xl text-display font-medium">{t('tagline')}</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim">
          Tokens, layout, navigație și footer. Conținutul paginii principale vine în etapa 3.
        </p>
      </div>
    </section>
  );
}
