import { useTranslations } from 'next-intl';
import { productById } from '@assistwidget/contract';
import { Link } from '@/i18n/routing';
import { AGENTS } from '@/lib/catalog';

/**
 * Компактный список: агент и цена, с которой он начинается.
 *
 * Для главной и для хаба агентов. Там не выбирают вилку — там понимают
 * порядок сумм и решают, идти ли дальше. Полная сетка на /pricing.
 *
 * Один компонент на два места намеренно: два списка цен разошлись бы
 * так же, как разошлось всё остальное, а цена — последнее, что можно
 * позволить себе показать по-разному на двух страницах одного сайта.
 */
export function AgentPriceList() {
  const t = useTranslations('agentPricing');
  const tAgents = useTranslations('agents');

  const rows = AGENTS.map((a) => ({ agent: a, product: productById(a.slug) })).filter(
    (r) => r.product?.tiers,
  );

  return (
    <ul className="grid divide-y divide-white/8 overflow-hidden rounded-card border border-white/8 sm:grid-cols-2 sm:divide-x sm:[&>li:nth-child(-n+2)]:border-b sm:[&>li:nth-child(2n)]:border-l-0 sm:[&>li]:border-white/8">
      {rows.map(({ agent, product }) => (
        <li key={agent.slug}>
          <Link
            href={`/agents/${agent.slug}`}
            className="group flex items-baseline justify-between gap-4 p-5 transition-colors hover:bg-white/3 sm:p-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-chalk transition-colors group-hover:text-chalk">
                {tAgents(`${agent.slug}.name`)}
              </span>
              {agent.status !== 'available' && (
                <span className="mt-1 block font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                  {t('soon')}
                </span>
              )}
            </span>
            {/* «От» обязательно: это цена Basic, и без предлога она читалась бы
                как единственная — а рядом стоит Pro вдвое дороже. */}
            <span className="shrink-0 text-sm text-chalk-dim">
              {t('priceFrom', { price: product!.tiers!.basic.price })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
