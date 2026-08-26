/**
 * Какие агенты есть у клиента — и что показать на месте тех, которых нет.
 *
 * Портал один на всех агентов. Человек заходит и видит семь разделов: те,
 * что оплачены, открыты, остальные заперты и предлагают оплату. Отдельного
 * кабинета на агента не существует и заводить его не нужно.
 *
 * Это второй слой прав, не замена первому. `entitlement.ts` отвечает на
 * вопрос «жива ли подписка вообще» и работает на пути сообщения, где чужой
 * API недоступен. Здесь вопрос другой: «что именно куплено». Оба нужны,
 * и порядок между ними один — мёртвая подписка закрывает всё, живая
 * открывает только купленное.
 *
 * Цены сюда не переписываются. Их знает контракт, собранный из манифестов
 * продуктов, и он же знает, продаётся ли агент вообще. Копия цены в движке
 * разошлась бы с витриной ровно так, как уже расходились тариф «Start»
 * за 79 € в движке и за 199 € на сайте.
 */
import type pg from 'pg';
import { PRODUCTS, type Product, type TierName } from '@assistwidget/contract';
import { hasFeature, type Feature } from '../plans.js';

/** Строка таблицы `tenant_agents` как она есть в базе. */
export interface AgentGrant {
  agentId: string;
  /** NULL у прав, доставшихся от старой тарифной лестницы. */
  tier: TierName | null;
  source: 'plan' | 'subscription';
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  expiresAt: Date | null;
}

/**
 * Состояние раздела в портале.
 *
 * `locked` и `unavailable` — разные вещи, и путать их нельзя. Первое значит
 * «можно купить прямо сейчас», второе — «агента ещё нет в продаже». Кнопка
 * оплаты на непостроенном агенте берёт деньги за обещание.
 */
export type AgentAccess = 'unlocked' | 'expiring' | 'locked' | 'unavailable';

export interface PortalAgent {
  id: string;
  access: AgentAccess;
  tier: TierName | null;
  /** Сколько стоит открыть. null — у агента нет цены (ещё не продаётся). */
  priceFrom: number | null;
  /** Дней до конца оплаченного периода. null — бессрочно либо не куплен. */
  daysLeft: number | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Какому агенту какая фича тарифа соответствует.
 *
 * Обратная сторона таблицы из миграции 040: там соответствие записано на
 * SQL, потому что миграция обязана применяться без приложения. Здесь то же
 * самое для работающего кода, и разъехаться им нельзя — при следующем
 * изменении лестницы правятся оба.
 *
 * `drive` и `connectors` сюда не попадают: это возможности платформы,
 * а не агенты. `analytics` попадает и всегда даёт `false` — аналитик этим
 * движком не запускается. Строка оставлена намеренно: молчаливое отсутствие
 * читалось бы как забывчивость.
 */
const AGENT_FEATURE: Record<string, Feature> = {
  'chatbot': 'chatbot',
  'configurator': 'configurator',
  'follow-up': 'followup',
  'order-status': 'productionUpdates',
  'content-engine': 'social',
  'voice-assistant': 'voice',
  'data-analyst': 'analytics',
};

/** Каких агентов даёт тариф. */
export const agentsInPlan = (planId: string | null | undefined): string[] =>
  Object.entries(AGENT_FEATURE)
    .filter(([, feature]) => hasFeature(planId, feature))
    .map(([agentId]) => agentId);

/**
 * Привести права, доставшиеся от тарифа, в соответствие с тарифом.
 *
 * Зачем это отдельно. Миграция 040 перенесла права ОДИН РАЗ, снимком. Тариф
 * же пишется в трёх местах — заведение через бланк, заведение через CLI и
 * смена тарифа, — и ни одно из них прав не трогало. Клиент, заведённый после
 * миграции, получал ноль строк в `tenant_agents`, то есть видел в портале
 * замок на чат-боте, за который платит. Найдено запуском, а не чтением:
 * в коде каждое из трёх мест выглядит законченным.
 *
 * Права, купленные поштучно (`source = 'subscription'`), не трогаются вовсе:
 * тариф о них ничего не знает, и снимать их сменой тарифа значило бы отбирать
 * оплаченное.
 */
export async function syncPlanGrants(
  client: pg.PoolClient,
  tenantId: string,
  planId: string | null | undefined,
): Promise<void> {
  const agents = agentsInPlan(planId);

  // Лишнее снимаем первым: иначе понижение тарифа оставило бы права от
  // прежнего рядом с правами от нового.
  await client.query(
    `DELETE FROM tenant_agents
      WHERE tenant_id = $1 AND source = 'plan' AND agent_id <> ALL($2::text[])`,
    [tenantId, agents],
  );

  if (agents.length === 0) return;

  // ON CONFLICT DO NOTHING, а не UPDATE: если агент уже куплен поштучно,
  // тариф не должен переписывать его вилку и источник.
  await client.query(
    `INSERT INTO tenant_agents (tenant_id, agent_id, source, status)
     SELECT $1, agent_id, 'plan', 'active' FROM unnest($2::text[]) AS agent_id
     ON CONFLICT (tenant_id, agent_id) DO NOTHING`,
    [tenantId, agents],
  );
}

/**
 * Право живо? Отменённая подписка доживает оплаченный период.
 *
 * `past_due` здесь трактуется как живое намеренно: отсрочку после отказа
 * карты считает `entitlement.ts` на уровне клиента, и удваивать эту логику
 * поагентно значило бы завести второй набор правил, который разойдётся
 * с первым.
 */
function grantIsLive(grant: AgentGrant, now: number): boolean {
  if (grant.status === 'canceled' && !grant.expiresAt) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now) return false;
  return true;
}

export function accessOf(
  product: Product,
  grant: AgentGrant | undefined,
  now = Date.now(),
): PortalAgent {
  const priceFrom = product.tiers?.basic.price ?? null;
  const sellable = product.status === 'shipped' && priceFrom !== null;

  if (!grant || !grantIsLive(grant, now)) {
    return {
      id: product.id,
      access: sellable ? 'locked' : 'unavailable',
      tier: null,
      priceFrom,
      daysLeft: null,
    };
  }

  const daysLeft = grant.expiresAt
    ? Math.ceil((grant.expiresAt.getTime() - now) / DAY)
    : null;

  return {
    id: product.id,
    // Оплаченный период кончается — раздел ещё открыт, но об этом надо
    // сказать заранее, а не в день отключения.
    access: daysLeft !== null ? 'expiring' : 'unlocked',
    tier: grant.tier,
    priceFrom,
    daysLeft,
  };
}

/**
 * Клиент передаётся снаружи, а не берётся из общего пула: маршруты портала
 * уже работают внутри `withTenant`, и открывать здесь второе соединение
 * значило бы выйти из области арендатора ровно там, где она и нужна.
 *
 * Фильтр по `tenant_id` остаётся явным, хотя область уже задана: то же
 * правило, что во всех Core-запросах этого проекта.
 */
export async function loadGrants(
  client: pg.PoolClient,
  tenantId: string,
): Promise<AgentGrant[]> {
  const { rows } = await client.query<{
    agent_id: string;
    tier: TierName | null;
    source: 'plan' | 'subscription';
    status: AgentGrant['status'];
    expires_at: Date | null;
  }>(
    `SELECT agent_id, tier, source, status, expires_at
       FROM tenant_agents
      WHERE tenant_id = $1`,
    [tenantId],
  );
  return rows.map((r) => ({
    agentId: r.agent_id,
    tier: r.tier,
    source: r.source,
    status: r.status,
    expiresAt: r.expires_at,
  }));
}

/**
 * Полный список разделов портала для клиента — все агенты, а не только его.
 *
 * Именно все: портал показывает и то, чего у клиента нет, потому что иначе
 * он не узнает, что это можно купить. Порядок берётся из контракта, чтобы
 * навигация в портале и список на витрине шли одинаково.
 */
export async function portalAgents(
  client: pg.PoolClient,
  tenantId: string,
  now = Date.now(),
): Promise<PortalAgent[]> {
  const grants = await loadGrants(client, tenantId);
  const byId = new Map(grants.map((g) => [g.agentId, g]));
  return PRODUCTS.map((product) => accessOf(product, byId.get(product.id), now));
}
