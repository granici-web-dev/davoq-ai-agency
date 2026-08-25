import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { FaqList } from '@/components/ui/FaqList';
import { Reveal } from '@/components/ui/Reveal';
import { AgentDay } from './AgentDay';
import { SectionHead } from '@/components/agent/SectionHead';
import { AGENTS, type Industry } from '@/lib/catalog';

interface Row {
  k: string;
  v: string;
}

/**
 * Страница индустрии.
 *
 * Посадочная страница под запрос «chatbot AI pentru [ниша]». Человек
 * пришёл из поиска и за секунду решает, про него это или нет, поэтому
 * первым идёт не рассказ о платформе, а его собственные вопросы —
 * те, что он слышит от клиентов каждый день.
 *
 * Порядок: узнавание → что спрашивают → кто из агентов это закрывает →
 * что в итоге получает продавец → возражения → призыв.
 */
export function IndustryPage({ industry }: { industry: Industry }) {
  const t = useTranslations(`industryPage.${industry.slug}`);
  const tPage = useTranslations('industryPage');
  const tIndustries = useTranslations('industries');
  const tAgents = useTranslations('agents');
  const tStatus = useTranslations('status');
  const tNav = useTranslations('nav');

  const full = industry.full === true;
  const questions = full ? (t.raw('questions') as { q: string; a: string }[]) : [];
  const rows = full ? (t.raw('leadCard.rows') as Row[]) : [];
  const faqCount = full ? (t.raw('faq') as unknown[]).length : 0;

  return (
    <>
      <section className="relative isolate overflow-hidden px-6 pt-40 pb-section sm:px-8">
        <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-20">
          <div>
            <Link
              href="/industries"
              className="enter font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
              style={{ animationDelay: '420ms' }}
            >
              ← {tPage('back')}
            </Link>

            <p className="enter eyebrow mt-8" style={{ animationDelay: '480ms' }}>
              {tPage('eyebrowIndustry')}
            </p>

            <h1 className="enter mt-6 max-w-3xl text-h1 font-medium" style={{ animationDelay: '560ms' }}>
              {full ? t('title') : tIndustries(`${industry.slug}.name`)}
            </h1>
            <p
              className="enter mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim"
              style={{ animationDelay: '700ms' }}
            >
              {full ? t('lead') : tIndustries(`${industry.slug}.panel`)}
            </p>

            <div className="enter mt-10 flex flex-wrap items-center gap-3" style={{ animationDelay: '840ms' }}>
              <DemoButton>{tNav('cta')}</DemoButton>
              <Cta href="/pricing" variant="ghost">
                {tNav('pricing')}
              </Cta>
            </div>
          </div>

          {/* Лента событий, а не окно одного агента: страница предлагает
              четверых, и картинка обязана показывать набор. Заодно она
              показывает часы — 08:40, 22:14, «vineri», — и этим говорит
              про круглосуточность раньше, чем про неё написано словами. */}
          {full && (
            <div className="enter lg:pl-4" style={{ animationDelay: '260ms' }}>
              <AgentDay namespace={`industryPage.${industry.slug}`} />
            </div>
          )}
        </div>
      </section>

      {full && (
        <>
          <Reveal>
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto max-w-7xl">
                <SectionHead eyebrow={tPage('questionsEyebrow')} title={t('questionsTitle')} />

                {/* Вопрос кавычками, ответ обычным текстом. Так видно,
                    где говорит клиент, а где мы, без единой подписи. */}
                <ul className="mt-14 border-t border-white/8">
                  {questions.map((item, i) => (
                    <li
                      key={i}
                      className="grid gap-x-16 gap-y-3 border-b border-white/8 py-8 lg:grid-cols-[1fr_1.2fr]"
                    >
                      <h3 className="text-h3 font-medium">{item.q}</h3>
                      <p className="leading-relaxed text-chalk-dim">{item.a}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section className="relative isolate px-6 py-section sm:px-8">
              <div className="aurora" aria-hidden />
              <div className="relative mx-auto max-w-7xl">
                <SectionHead
                  eyebrow={tPage('agentsEyebrow')}
                  title={tPage('agentsTitle')}
                  lead={tPage('agentsLead')}
                />

                <ul className="mt-14 grid gap-4 sm:grid-cols-2">
                  {AGENTS.filter((a) => industry.agents.includes(a.slug)).map((agent) => {
                    const available = agent.status === 'available';
                    return (
                      <li key={agent.slug}>
                        <Link
                          href={`/agents/${agent.slug}`}
                          className="card group flex h-full flex-col p-7 hover:-translate-y-0.5"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <h3 className="text-h3 font-medium">{tAgents(`${agent.slug}.name`)}</h3>
                            <span
                              className={`flex shrink-0 items-center gap-2 rounded-pill border px-3 py-1 font-mono text-[10px] tracking-wider uppercase ${
                                available
                                  ? 'border-aurora-warm/30 text-chalk'
                                  : 'border-white/10 text-chalk-faint'
                              }`}
                            >
                              {available && (
                                <span
                                  className="size-1.5 rounded-full bg-aurora-warm shadow-[0_0_8px_var(--color-aurora-warm)]"
                                  aria-hidden
                                />
                              )}
                              {available ? tStatus('available') : tStatus('soon')}
                            </span>
                          </div>

                          {/* Что агент делает ИМЕННО в этой нише, а не вообще.
                              Общее описание уже стоит на главной; здесь оно
                              не добавило бы ничего. */}
                          <p className="mt-4 leading-relaxed text-chalk-dim">
                            {t(`agents.${agent.slug}`)}
                          </p>

                          <span className="mt-auto pt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                            {tPage('openAgent')}{' '}
                            <span className="inline-block transition-transform group-hover:translate-x-1">
                              →
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto max-w-7xl">
                <SectionHead
                  eyebrow={tPage('leadEyebrow')}
                  title={t('leadTitle')}
                  lead={t('leadLead')}
                />

                {/* Фишка заявки — вёрстка, а не скриншот. Здесь сплошной
                    текст, и сгенерированная картинка отдала бы его
                    нечитаемыми буквами. */}
                <div className="mt-14 flex justify-center">
                  <div className="card w-full max-w-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
                      <span className="text-sm text-chalk">{t('leadCard.title')}</span>
                      <span className="font-mono text-[11px] tracking-wider text-chalk-faint tabular-nums">
                        {t('leadCard.number')}
                      </span>
                    </div>

                    <dl className="divide-y divide-white/8">
                      {rows.map((row) => (
                        <div
                          key={row.k}
                          className="grid grid-cols-[9rem_1fr] gap-4 px-6 py-3.5 sm:grid-cols-[11rem_1fr]"
                        >
                          <dt className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                            {row.k}
                          </dt>
                          <dd className="text-sm text-chalk">{row.v}</dd>
                        </div>
                      ))}
                    </dl>

                    <p className="border-t border-white/8 px-6 py-4 text-xs text-chalk-faint">
                      {t('leadCard.footer')}
                    </p>
                  </div>
                </div>
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
                <FaqList namespace={`industryPage.${industry.slug}.faq`} count={faqCount} />
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section className="relative isolate overflow-hidden px-6 py-section sm:px-8">
              <div className="aurora" aria-hidden />
              <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
                <h2 className="text-h1 font-medium">{t('closingTitle')}</h2>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim">
                  {t('closingLead')}
                </p>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                  <DemoButton>{tNav('cta')}</DemoButton>
                  <Cta href="/pricing" variant="ghost">
                    {tNav('pricing')}
                  </Cta>
                </div>
              </div>
            </section>
          </Reveal>
        </>
      )}
    </>
  );
}
