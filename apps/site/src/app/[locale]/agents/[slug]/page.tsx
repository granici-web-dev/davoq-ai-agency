import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { AgentPage } from '@/components/agent/AgentPage';
import { agentBySlug, AGENT_SLUGS } from '@/lib/catalog';
import { routing } from '@/i18n/routing';

/**
 * Страница агента.
 *
 * Шесть страниц из каталога, все статические. `dynamicParams = false`:
 * слаг, которого нет в каталоге, обязан давать 404 на сборке, а не
 * рендериться на лету — иначе опечатка в ссылке живёт годами и её видит
 * только поисковик.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    AGENT_SLUGS.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const agent = agentBySlug(slug);
  if (!agent) return {};

  const t = await getTranslations({ locale, namespace: 'agents' });

  /* Марка не дописывается: её добавляет шаблон заголовка из макета.
     Дописанная здесь ещё раз, она давала «… — AssistWidget · AssistWidget».

     Заголовок под поисковый запрос берётся у того, у кого написана
     страница, — а не у того, кто уже вышел. Это разные множества:
     конфигуратор ещё в разработке, но страница у него настоящая, и
     приводить на неё людей честно. У остальных — название из каталога:
     сочинять поисковый заголовок для одной строки описания значит
     звать людей на страницу-обещание. */
  let title = t(`${slug}.name`);
  let description = t(`${slug}.short`);

  if (agent.full) {
    const page = await getTranslations({ locale, namespace: `agentPage.${slug}` });
    title = page('metaTitle');
    description = page('metaDescription');
  }

  const path = `/agents/${slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: locale === routing.defaultLocale ? path : `/${locale}${path}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          l === routing.defaultLocale ? path : `/${l}${path}`,
        ]),
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

  const agent = agentBySlug(slug);
  if (!agent) notFound();

  return <AgentPage agent={agent} />;
}
