import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Cta } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';
import { productById } from '@assistwidget/contract';
import { AgentPricing } from '@/components/pricing/AgentPricing';
import { FaqList } from '@/components/ui/FaqList';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from './SectionHead';
import { WidgetChat } from './WidgetChat';
import { SpecSheet } from './SpecSheet';
import { VoiceCall } from './VoiceCall';
import { FollowUpPlan } from './FollowUpPlan';
import { OrderStatus } from './OrderStatus';
import { ContentDraft } from './ContentDraft';
import { FeatureIcon } from './FeatureIcon';
import { INDUSTRIES, industriesForAgent, type Agent } from '@/lib/catalog';
import { PLAN_FOR_AGENT } from '@/lib/pricing';
import agentChatbot from '@/../public/images/agent-chatbot.webp';

/** Кадр есть пока только у доступного агента. Остальные ждут своей очереди. */
const VISUALS: Partial<Record<string, typeof agentChatbot>> = {
  chatbot: agentChatbot,
};

/**
 * Что стоит в первом экране у каждого агента.
 *
 * У чат-бота убеждает разговор, у конфигуратора — то, что от разговора
 * осталось: заполненная фишка. Один макет на всех показывал бы работу
 * одного агента шесть раз.
 */
const HERO_VISUAL: Partial<Record<string, (p: { namespace: string }) => React.ReactElement>> = {
  chatbot: WidgetChat,
  configurator: SpecSheet,
  'voice-assistant': VoiceCall,
  'follow-up': FollowUpPlan,
  'order-status': OrderStatus,
  'content-engine': ContentDraft,
};

/**
 * Страница агента.
 *
 * Один шаблон на всех шестерых. Содержание приходит из `messages` по слагу,
 * и когда следующий агент выйдет из разработки, у него появится страница
 * без единой строки нового кода — достаточно дописать тексты.
 *
 * Порядок разделов взят у продуктовых страниц, которые продают чат-ботов:
 * что делает → как это выглядит → из чего отвечает → куда ставится →
 * для кого → вопросы → призыв. Он не случайный: человек сначала хочет
 * понять, потом увидеть, потом убедиться, что это не выдумывает ответы,
 * и только потом — сколько это стоит.
 */
export function AgentPage({ agent }: { agent: Agent }) {
  const t = useTranslations(`agentPage.${agent.slug}`);
  const tPage = useTranslations('agentPage');
  const tAgents = useTranslations('agents');
  const tIndustries = useTranslations('industries');
  const tStatus = useTranslations('status');
  const tNav = useTranslations('nav');
  const tHomeIndustries = useTranslations('home.industries');
  const tPlans = useTranslations('plans');

  /* `available` решает, что написано на бейдже. `full` — есть ли у агента
     страница. Это разные вопросы: конфигуратор ещё не вышел, но входит
     в оплачиваемый сегодня пакет, и человек имеет право прочитать,
     что именно он покупает. */
  const available = agent.status === 'available';
  /* Есть ли у агента собственные вилки — то есть продаётся ли он поштучно. */
  const ownTiers = productById(agent.slug)?.tiers !== undefined;
  const full = agent.full === true;
  const visual = VISUALS[agent.slug];
  const Hero = HERO_VISUAL[agent.slug];

  const platforms = full ? (t.raw('platforms') as string[]) : [];
  const yes = full ? (t.raw('sourcesYes.items') as string[]) : [];
  const no = full ? (t.raw('sourcesNo.items') as string[]) : [];
  const faqCount = full ? (t.raw('faq') as unknown[]).length : 0;

  return (
    <>
      <section className="relative isolate overflow-hidden px-6 pt-40 pb-section sm:px-8">
        {visual && (
          /* Кадр стоит справа и не во всю ширину: у него сильная
             симметрия, и растянутый на весь экран он утаскивает взгляд
             в центр — ровно туда, где идёт заголовок. */
          <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full opacity-70 lg:w-3/5" aria-hidden>
            <Image src={visual} alt="" fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="enter-frame object-cover object-center" />
            <div className="absolute inset-0 bg-linear-to-r from-ink-950 via-ink-950/70 to-transparent lg:via-ink-950/40" />
            <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-transparent to-ink-950" />
          </div>
        )}

        <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-20">
          <div>
          {/* Вход по очереди, как на главной: сначала проступает кадр,
              следом виджет, потом текст сверху вниз. Задержки сужаются
              к концу — равный шаг читался бы как список, который
              подгружается по одному, а не как одно появление. */}
          <Link
            href="/agents"
            className="enter font-mono text-[11px] tracking-wider text-chalk-dim uppercase transition-colors hover:text-chalk"
            style={{ animationDelay: '420ms' }}
          >
            ← {tPage('backToAgents')}
          </Link>

          <div className="enter mt-8 flex items-center gap-3" style={{ animationDelay: '480ms' }}>
            <span
              className={`flex items-center gap-2 rounded-pill border px-3 py-1 font-mono text-[10px] tracking-wider uppercase ${
                available ? 'border-aurora-warm/30 text-chalk' : 'border-white/10 text-chalk-faint'
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

            {/* С какого пакета агент доступен. Стоит рядом со статусом,
                а не внизу страницы: «в разработке» без пакета звучит как
                «когда-нибудь», а с пакетом — как «уже оплачено, ждём».
             
                У агента со своей ценой метки нет. «Входит в Growth» над
                собственными 119 € противоречит само себе и уводит на
                страницу пакетов — то есть прочь от цены, которую человек
                как раз и пришёл узнать. Как только у агента появляются
                вилки, пакет перестаёт быть ответом на вопрос «сколько». */}
            {!ownTiers && (
              <Link
                href="/pricing"
                className="rounded-pill border border-white/12 px-3 py-1 font-mono text-[10px] tracking-wider text-chalk-dim uppercase transition-colors hover:border-white/25 hover:text-chalk"
              >
                {tPlans('includedIn', { plan: tPlans(`${PLAN_FOR_AGENT[agent.slug]}.name`) })}
              </Link>
            )}
          </div>

          <h1 className="enter mt-6 max-w-3xl text-h1 font-medium" style={{ animationDelay: '560ms' }}>
            {full ? t('title') : tAgents(`${agent.slug}.name`)}
          </h1>
          <p
            className="enter mt-6 max-w-xl text-lg leading-relaxed text-chalk-dim"
            style={{ animationDelay: '700ms' }}
          >
            {full ? t('lead') : tAgents(`${agent.slug}.short`)}
          </p>

          <div className="enter mt-10 flex flex-wrap items-center gap-3" style={{ animationDelay: '840ms' }}>
            <DemoButton>{tNav('cta')}</DemoButton>
            <Cta href="/pricing" variant="ghost">
              {tNav('pricing')}
            </Cta>
          </div>

          {/* «Не вышел, страницы нет» и «не вышел, но уже в пакете» —
              разные новости. Вторая обязана сказать, что читатель видит
              описание будущего, иначе страница продаёт как готовое то,
              что ещё пишется. */}
          {!available && (
            <div className="enter mt-14 max-w-xl border-l-2 border-white/12 pl-5" style={{ animationDelay: '960ms' }}>
              <h2 className="font-medium">{tPage(full ? 'soonInPlanTitle' : 'soonTitle')}</h2>
              <p className="mt-3 leading-relaxed text-chalk-dim">
                {tPage(full ? 'soonInPlanText' : 'soonText')}
              </p>
            </div>
          )}
          </div>

          {/* Разговор стоит в первом экране, а не отдельной секцией ниже.
              Это самое убедительное, что есть на странице: человек видит,
              что агент называет цену из прайса и спрашивает про размеры,
              раньше, чем читает про это словами.

              `min-w-0` обязателен: колонка грида по умолчанию не ужимается
              уже своего содержимого, а у макета задана ширина в 24rem —
              без этого на телефоне он вылезал за экран и обрезался
              секцией, у которой стоит overflow-hidden. */}
          {full && Hero && (
            <div className="enter min-w-0 lg:pl-4" style={{ animationDelay: '260ms' }}>
              <Hero namespace={`agentPage.${agent.slug}`} />
            </div>
          )}
        </div>
      </section>

      {full && (
        <>
          <Reveal>
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto max-w-7xl">
                <SectionHead eyebrow={tPage('featuresEyebrow')} title={t('featuresTitle')} />

                {/* Ключи берутся из текстов, а не перечислены руками:
                    у следующего агента возможности будут свои, и список
                    не должен требовать правки кода. */}
                <ul className="mt-14 grid gap-px overflow-hidden rounded-card border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.keys(t.raw('features') as Record<string, unknown>).map((key) => (
                    <li key={key} className="bg-ink-950 px-7 py-8">
                      <FeatureIcon name={key} />
                      <h3 className="mt-5 text-h3 font-medium">{t(`features.${key}.title`)}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-chalk-dim">
                        {t(`features.${key}.text`)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto max-w-7xl">
                <SectionHead
                  eyebrow={t.has('sourcesEyebrow') ? t('sourcesEyebrow') : tPage('sourcesEyebrow')}
                  title={t('sourcesTitle')}
                />

                {/* Два столбца: что делает и чего не делает. Второй важнее
                    первого — он и есть разница между этим агентом и
                    чат-ботом, который уверенно называет цену, взятую
                    из воздуха. */}
                <div className="mt-14 grid gap-4 lg:grid-cols-2">
                  {[
                    { key: 'sourcesYes', items: yes, tone: 'yes' as const },
                    { key: 'sourcesNo', items: no, tone: 'no' as const },
                  ].map(({ key, items, tone }) => (
                    <div key={key} className="card p-7 sm:p-8">
                      <h3 className="font-mono text-[11px] tracking-wider text-chalk-dim uppercase">
                        {t(`${key}.title`)}
                      </h3>
                      <ul className="mt-6 flex flex-col gap-4">
                        {items.map((item, i) => (
                          <li key={i} className="flex gap-3.5 leading-relaxed text-chalk-dim">
                            {tone === 'yes' ? <CheckIcon /> : <CrossIcon />}
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
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto max-w-7xl">
                <SectionHead
                  eyebrow={tPage('platformsEyebrow')}
                  title={t('platformsTitle')}
                  lead={t('platformsLead')}
                />

                <ul className="mt-12 flex flex-wrap gap-2.5">
                  {platforms.map((name) => (
                    <li
                      key={name}
                      className="rounded-pill border border-white/12 px-4 py-2.5 text-sm text-chalk-dim"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto max-w-7xl">
                <SectionHead
                  eyebrow={tPage('industriesEyebrow')}
                  title={tPage('industriesTitle')}
                  lead={tPage('industriesLead')}
                />

                <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {INDUSTRIES.filter((i) => industriesForAgent(agent.slug).includes(i.slug)).map((industry) => (
                    <li key={industry.slug}>
                      <Link
                        href={`/industries/${industry.slug}`}
                        className="card group flex h-full flex-col p-7 hover:-translate-y-0.5"
                      >
                        <h3 className="font-medium">{tIndustries(`${industry.slug}.name`)}</h3>
                        <p className="mt-3 text-sm leading-relaxed text-chalk-dim">
                          {tIndustries(`${industry.slug}.short`)}
                        </p>
                        <span className="mt-auto pt-8 font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors group-hover:text-chalk">
                          {tHomeIndustries('view')}{' '}
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

          {/* Цена стоит перед вопросами-ответами, а не после них.
              К этому месту страницы человек уже знает, что агент делает,
              и следующий его вопрос — «сколько». Вопросы-ответы после
              цены снимают возражения, которые она же и подняла; до неё
              им отвечать нечего. */}
          <Reveal>
            <AgentPricing slug={agent.slug} />
          </Reveal>

          <Reveal>
            <section className="px-6 py-section sm:px-8">
              <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="lg:sticky lg:top-32 lg:self-start">
                  <p className="eyebrow">{tPage('faqEyebrow')}</p>
                  <h2 className="mt-6 text-h2 font-medium">{t('faqTitle')}</h2>
                </div>
                <FaqList namespace={`agentPage.${agent.slug}.faq`} count={faqCount} />
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

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-1 shrink-0 text-aurora-warm">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-1 shrink-0 text-chalk-faint">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
