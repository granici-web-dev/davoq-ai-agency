import type { Configurator } from '../load.js';
import type { ResolvedSelections, Selections } from '../flow/select.js';
import { resolveSelections } from '../flow/select.js';
import { priceOf, type PriceResult } from '../pricing/engine.js';
import { applicablePromotions, bestPromotion } from './store.js';
import type { Promotion } from './schema.js';

/**
 * Цена с учётом подтверждённой акции.
 *
 * Порядок важен: сначала считаем цену БЕЗ скидки, потом по ней выбираем
 * наибольшую из применимых, потом считаем заново. Иначе нечем сравнивать
 * «10%» с «500 лей» — какая из них больше, зависит от самой цены.
 *
 * Срок действия проверяется запросом к базе в момент расчёта, а не в момент
 * подтверждения: акция, подтверждённая в июле и кончившаяся в августе,
 * обязана перестать применяться сама.
 */

export interface PricedOffer {
  price: PriceResult;
  resolved: ResolvedSelections;
  promo?: Promotion | undefined;
}

export async function priceWithPromotion(
  tenantId: string, cfg: Configurator, selections: Selections, where = 'расчёт',
): Promise<PricedOffer> {
  const resolved = resolveSelections(cfg.flow, selections, where);
  const bare = priceOf(cfg.flow, cfg.pricing, selections, undefined, where);

  const promos = await applicablePromotions(tenantId, modelOf(resolved));
  const best = bestPromotion(promos, bare.listPriceBani);
  if (!best) return { price: bare, resolved };

  return {
    price: priceOf(cfg.flow, cfg.pricing, selections, best.discount, where),
    resolved,
    promo: best.promo,
  };
}

/**
 * Что считается «моделью» для выборочной акции — вариант, задающий базовую
 * цену. Это же правило решает, что печатать заголовком позиции в оферте:
 * два разных ответа на вопрос «что именно покупают» разошлись бы через месяц.
 */
export const modelOf = (resolved: ResolvedSelections): string | undefined =>
  resolved.picks.find((p) => p.option.priceEffect?.kind === 'base')?.option.id;
