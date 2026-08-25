import { useTranslations } from 'next-intl';
import type { Service } from '@/lib/services';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/agent/SectionHead';

/**
 * Страница услуги. Одна на все четыре.
 *
 * Услуги отличаются содержанием, а не устройством: у каждой одно и то же —
 * что делаем, что входит, как идёт работа, вопросы. Четыре страницы,
 * собранные порознь, разошлись бы по вёрстке на первой же правке, и
 * заметить это можно было бы, только открыв их подряд.
 *
 * Цены здесь нет намеренно, и это не упущение. Работа каждый раз другая:
 * сайт-визитка и магазин на тысячу товаров — разные месяцы. Названная
 * наугад цифра станет либо обманом, либо потолком, ниже которого нельзя
 * будет продать. Поэтому страница ведёт к разговору, а не к оплате.
 */
export function ServicePage({ service }: { service: Service }) {
  const t = useTranslations(`servicePage.${service.slug}`);
  const tPage = useTranslations('servicesPage');

  const includes = t.raw('includes') as { title: string; text: string }[];
  const steps = t.raw('steps') as { title: string; text: string }[];
  const faq = t.raw('faq') as { q: string; a: string }[];

  return (
    <>
      <section className="relative isolate overflow-hidden px-6 pt-40 pb-section sm:px-8">
        <div className="aurora" aria-hidden />
        <div className="relative mx-auto max-w-7xl">
          <p className="enter eyebrow" style={{ animationDelay: '120ms' }}>
            {tPage('eyebrow')}
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
          <div className="enter mt-10" style={{ animationDelay: '460ms' }}>
            <DemoButton>{tPage('cta')}</DemoButton>
          </div>
        </div>
      </section>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={tPage('includesEyebrow')} title={t('includesTitle')} />
            {/* Двумя колонками, а не тремя: у пунктов есть пояснения, и
                в трёх колонках они рвутся по три слова в строку. */}
            <div className="mt-14 grid gap-px overflow-hidden rounded-card border border-white/8 bg-white/8 sm:grid-cols-2">
              {includes.map((item) => (
                <div key={item.title} className="bg-ink p-7 sm:p-8">
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-chalk-dim">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead eyebrow={tPage('stepsEyebrow')} title={t('stepsTitle')} lead={t('stepsLead')} />
            <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title} className="flex flex-col">
                  {/* Номер моноширинным и приглушённым: он про порядок,
                      а не про важность, и не должен спорить с заголовком. */}
                  <span className="font-mono text-[11px] tracking-wider text-chalk-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-4 font-medium">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-chalk-dim">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="px-6 py-section sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="eyebrow">{tPage('faqEyebrow')}</p>
              <h2 className="mt-6 text-h2 font-medium">{t('faqTitle')}</h2>
            </div>
            <dl className="border-t border-white/8">
              {faq.map((item) => (
                <div key={item.q} className="border-b border-white/8 py-7">
                  <dt className="font-medium">{item.q}</dt>
                  <dd className="mt-3 leading-relaxed text-chalk-dim">{item.a}</dd>
                </div>
              ))}
            </dl>
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
              <DemoButton>{tPage('cta')}</DemoButton>
              <Cta href="/services" variant="ghost">
                {tPage('allServices')}
              </Cta>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
