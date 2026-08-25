'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PAID_TIERS, PRODUCTS, productById } from '@assistwidget/contract';
import { AGENTS } from '@/lib/catalog';
import { Link } from '@/i18n/routing';
import { ctaClasses } from '@/components/ui/Cta';
import { PricingCard, type Billing } from './PricingCard';
import { BillingToggle } from './BillingToggle';

/**
 * Сетка цен: агенты, у каждого две вилки.

 * Агент без вилок сюда тоже попадает — отдельным блоком в конце. Раньше
 * он просто отфильтровывался, и получался тупик: со своей страницы он
 * звал «посмотрите цены», а на странице цен его не было. Человек делал
 * из этого единственный доступный вывод — что цену от него прячут.
 *
 * Порядок агентов берётся из каталога сайта, а не из контракта. В контракте
 * они отсортированы по имени — это порядок машины; здесь нужен порядок,
 * в котором их продают: сперва тот, с которого начинают все.
 *
 * Переключатель месяц/год один на всю страницу. По вилке на каждого агента
 * он превратился бы в шесть независимых состояний, и человек, переключивший
 * год у чатбота, увидел бы месяц у конфигуратора двумя экранами ниже.
 */
export function AgentPriceGrid() {
  const t = useTranslations('agentPricing');
  const tAgents = useTranslations('agents');
  const [billing, setBilling] = useState<Billing>('monthly');

  const all = AGENTS.map((a) => productById(a.slug)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );
  const agents = all.filter((p) => p.tiers);
  /* Цены ещё нет — не потому, что она секретная, а потому, что продукт
     не запущен. Так и написано в карточке. */
  const unpriced = all.filter((p) => !p.tiers);

  return (
    <>
      {/* Навигация и переключатель стоят вместе и липнут к верху: на шести
          агентах сетка длинная, и к четвёртому человек уже не помнит, что
          режим оплаты вообще переключается. */}
      <div className="sticky top-20 z-20 -mx-6 mb-16 border-y border-white/8 bg-ink/85 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <nav aria-label={t('navLabel')} className="flex flex-wrap gap-x-5 gap-y-2">
            {all.map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                className="font-mono text-[11px] tracking-wider text-chalk-faint uppercase transition-colors hover:text-chalk"
              >
                {tAgents(`${p.id}.name`)}
              </a>
            ))}
          </nav>
          <BillingToggle value={billing} onChange={setBilling} />
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-20">
        {agents.map((product) => (
          <section key={product.id} id={product.id} className="scroll-mt-44">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="text-h3 font-medium">{tAgents(`${product.id}.name`)}</h2>
              {product.status !== 'shipped' && (
                <span className="rounded-pill border border-white/10 px-3 py-1 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                  {t('soon')}
                </span>
              )}
            </div>
            <p className="mt-3 max-w-2xl text-body text-chalk-dim">
              {tAgents(`${product.id}.short`)}
            </p>

            <div className="mt-8 grid divide-y divide-white/8 overflow-hidden rounded-card border border-white/8 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              {PAID_TIERS.map((name) => (
                <PricingCard
                  key={name}
                  product={product}
                  name={name}
                  tier={product.tiers![name]}
                  billing={billing}
                />
              ))}
            </div>
          </section>
        ))}

        {unpriced.map((product) => (
          <section key={product.id} id={product.id} className="scroll-mt-44">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="text-h3 font-medium">{tAgents(`${product.id}.name`)}</h2>
              <span className="rounded-pill border border-white/10 px-3 py-1 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {t('soon')}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-body text-chalk-dim">
              {tAgents(`${product.id}.short`)}
            </p>

            {/* Одна карточка во всю ширину, а не две пустые: две колонки
                здесь читались бы как вилки, у которых почему-то стёрли
                цифры. */}
            <div className="mt-8 overflow-hidden rounded-card border border-white/8 p-7 sm:p-9">
              <p className="text-h3 font-medium">{t('priceAtLaunch')}</p>
              <p className="mt-4 max-w-2xl leading-relaxed text-chalk-dim">
                {t('priceAtLaunchNote')}
              </p>
              <div className="mt-8 sm:max-w-xs">
                <Link
                  href={{ pathname: '/contact', query: { agent: product.id } }}
                  className={`${ctaClasses('ghost')} w-full`}
                >
                  {t('reserveLaunchPrice')}
                </Link>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** Сколько агентов вообще продаётся — для проверки, что сетка не опустела. */
export const sellableCount = () => PRODUCTS.filter((p) => p.tiers).length;
