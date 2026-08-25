'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PAID_TIERS, productById } from '@assistwidget/contract';
import { PricingCard, type Billing } from './PricingCard';
import { IndividualCard } from './IndividualCard';
import { BillingToggle } from './BillingToggle';

/**
 * Цена агента — на странице самого агента.
 *
 * Агент продаётся сам по себе, поэтому и цена стоит там, где человек про
 * него читает. Решение «беру» созревает в конце страницы агента;
 * отправлять за ценой куда-то ещё — значит терять его ровно в этот момент.
 *
 * Клиентский компонент из-за переключателя: режим оплаты живёт в состоянии.
 * Ниже него всё снова обычная разметка — состояние не протекает дальше
 * карточек, потому что больше никому не нужно.
 */
export function AgentPricing({ slug }: { slug: string }) {
  const t = useTranslations('agentPricing');
  const [billing, setBilling] = useState<Billing>('monthly');
  const product = productById(slug);

  /* Агент без посчитанных вилок цену не показывает: заведён, но не оценён.
     Само по себе законно — сборка следит лишь за тем, чтобы это не совпало
     со статусом «продаётся». */
  if (!product?.tiers) return null;

  return (
    <section className="px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-h2 font-medium">{t('title')}</h2>
            <p className="mt-4 max-w-xl text-body text-chalk-dim">{t('lead')}</p>
          </div>
          <BillingToggle value={billing} onChange={setBilling} />
        </div>

        <div className="reveal mt-12 grid divide-y divide-white/8 overflow-hidden rounded-card border border-white/8 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {PAID_TIERS.map((name) => (
            <PricingCard
              key={name}
              product={product}
              name={name}
              tier={product.tiers![name]}
              billing={billing}
            />
          ))}
          <IndividualCard />
        </div>
      </div>
    </section>
  );
}
