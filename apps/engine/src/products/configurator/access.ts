import { entitlementOf, type BillingState } from '../../engine/billing/entitlement.js';
import { hasFeature, offerCapFor } from '../../engine/plans.js';

/**
 * Право пользоваться конфигуратором.
 *
 * Отдельным именем, а не двумя строками в загрузчике: это правило, которое
 * читают и проверяют, а не деталь маршрута. Пока оно жило внутри `load()`,
 * его нельзя было ни назвать, ни покрыть тестом.
 *
 * Два условия складываются, и оба обязательны. Тариф отвечает на «куплено ли»,
 * подписка — на «оплачено ли сейчас». Разница видна на grace-периоде: тариф
 * тенант не терял, а автоматизацию теряет.
 */

export interface AccessState extends BillingState {
  plan: string | null | undefined;
}

export const configuratorAllowed = (tenant: AccessState, now = Date.now()): boolean =>
  hasFeature(tenant.plan, 'configurator') && entitlementOf(tenant, now).active;

/**
 * Осталось ли место в месячном пакете оферт.
 *
 * Считается ДО выпуска. Номер, выданный сверх квоты, пришлось бы либо
 * оставить — тогда квота ничего не значит, — либо отозвать, и тогда
 * в нумерации коммерческих документов появляется дыра.
 */
export const offerQuotaLeft = (
  plan: string | null | undefined, override: number | null, usedThisMonth: number,
): boolean => usedThisMonth < offerCapFor(plan, override);
