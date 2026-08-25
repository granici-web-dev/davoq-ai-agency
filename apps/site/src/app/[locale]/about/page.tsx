import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/agent/SectionHead';
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
  const t = await getTranslations({ locale, namespace: 'aboutPage' });
  const path = '/about';
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

interface Principle {
  title: string;
  text: string;
  href: string;
}

/**
 * Страница «о нас».
 *
 * Обычная страница этого жанра держится на том, чего у нас нет: истории
 * основания, фотографий команды, числа клиентов, отзывов. Написать её
 * привычным способом можно было бы только выдумав всё перечисленное —
 * то есть нарушив единственное правило, на котором стоит весь сайт.
 *
 * Поэтому страница говорит не «кто мы», а «как мы работаем» — и главное,
 * не просит верить на слово. Пять правил, и у каждого ссылка на то место
 * сайта, где правило видно. Утверждение, которое проверяется одним
 * нажатием, стоит дороже абзаца про ценности.
 *
 * Отсутствие отзывов объяснено прямо и первым же разделом: человек уже
 * заметил, что их нет, и объяснение работает только до того, как он
 * сделает вывод сам.
 *
 * Раздел «где мы сейчас» написан в два столбца — что выигрываете и чем
 * рискуете. Второй столбец с янтарной подписью, как везде на сайте, где
 * стоит то, чего нельзя не заметить.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('aboutPage');
  const tNav = await getTranslations('nav');
  const principles = t.raw('principles') as Principle[];
  const gain = t.raw('gain') as string[];
  const risk = t.raw('risk') as string[];

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
        </div>
      </section>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={t('absenceEyebrow')} title={t('absenceTitle')} />

            {/* Средний абзац светлее двух соседних: в нём стоит причина,
                и он единственный, ради которого раздел написан. */}
            <div className="mt-14 max-w-2xl">
              <p className="leading-relaxed text-chalk-dim">{t('absenceLead')}</p>
              <p className="mt-6 text-lg leading-relaxed text-chalk">{t('absenceBody')}</p>
              <p className="mt-6 leading-relaxed text-chalk-dim">{t('absenceOutro')}</p>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={t('workEyebrow')} title={t('workTitle')} lead={t('workLead')} />

            {/* Каждое правило ведёт туда, где оно видно. Ссылка здесь не
                навигация, а доказательство: страница про принципы, на
                которой нечего открыть, — это страница про намерения. */}
            <ul className="mt-14">
              {principles.map((principle, i) => (
                <li key={principle.href} className="border-t border-white/8 last:border-b">
                  <Link
                    href={principle.href}
                    className="group grid gap-4 py-9 lg:grid-cols-[4rem_1fr_auto] lg:items-baseline lg:gap-12"
                  >
                    <span className="font-mono text-[11px] text-chalk-faint tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <div className="max-w-2xl">
                      <h3 className="text-h3 font-medium">{principle.title}</h3>
                      <p className="mt-3 leading-relaxed text-chalk-dim">{principle.text}</p>
                    </div>

                    <span className="font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                      {t('checkLabel')}{' '}
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
            <SectionHead eyebrow={t('nowEyebrow')} title={t('nowTitle')} lead={t('nowLead')} />

            <div className="mt-14 grid gap-4 lg:grid-cols-2">
              {[
                { title: t('gainTitle'), items: gain, warn: false },
                { title: t('riskTitle'), items: risk, warn: true },
              ].map(({ title, items, warn }) => (
                <div key={title} className="card p-7 sm:p-8">
                  {/* Янтарным подписан столбец с рисками — тем же цветом,
                      которым на всём сайте помечено то, чего нельзя не
                      заметить. Прятать его в серый значило бы написать
                      честный текст и тут же его приглушить. */}
                  <h3
                    className={`font-mono text-[11px] tracking-wider uppercase ${
                      warn ? 'text-aurora-warm' : 'text-chalk-dim'
                    }`}
                  >
                    {title}
                  </h3>
                  <ul className="mt-6 flex flex-col gap-4">
                    {items.map((item, i) => (
                      <li key={i} className="flex gap-3.5 leading-relaxed text-chalk-dim">
                        <span
                          className={`mt-2.5 size-1 shrink-0 rounded-full ${
                            warn ? 'bg-aurora-warm/70' : 'bg-chalk-faint'
                          }`}
                          aria-hidden
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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
              <Cta href="/contact" variant="ghost">
                {tNav('contact')}
              </Cta>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
