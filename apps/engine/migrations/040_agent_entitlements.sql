-- Права переезжают с тарифа на агента.
--
-- Витрина уже год продаёт поагентно: у каждого из семи своя вилка Basic/Pro,
-- своя цена, скидка от двух агентов. Движок всё это время знал только
-- `tenants.plan` — одну строку на клиента, из которой выводился весь набор
-- возможностей. Один портал с замком на каждой странице агента читать
-- сегодня нечего: такого факта в базе нет.
--
-- Здесь появляется факт: какие агенты у клиента есть.
--
-- Правило переноса то же, что в 039: маппинг СОХРАНЯЕТ текущее поведение.
-- Клиент, проснувшийся утром без агента, за которого вчера платил, — это
-- не «мы обновили модель прав», это отказ в обслуживании.
BEGIN;

CREATE TABLE tenant_agents (
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- id из манифеста продукта (apps/engine/src/products/<id>/product.yaml).
  -- Текстом, а не перечислением: список агентов растёт, и каждый новый
  -- не должен требовать миграции ALTER TYPE.
  agent_id     text        NOT NULL,

  -- Вилка. NULL допустим и означает ровно одно: право досталось от старой
  -- тарифной лестницы, где поагентных вилок не существовало.
  --
  -- Проставить её задним числом было бы выдумыванием данных. Basic занизил
  -- бы права тем, у кого сегодня business, а Pro раздал бы бесплатно то,
  -- что продаётся. Пустое значение честнее обоих и видно запросом.
  tier         text        CHECK (tier IN ('basic', 'pro')),

  -- Откуда взялось право. Это и есть маркер перехода: пока в таблице есть
  -- строки с 'plan', лестница жива. Когда их не останется, `tenants.plan`
  -- и поле `plan:` в манифестах можно удалять.
  source       text        NOT NULL DEFAULT 'subscription'
               CHECK (source IN ('plan', 'subscription')),

  status       text        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),

  activated_at timestamptz NOT NULL DEFAULT now(),
  -- NULL — бессрочно, пока идут платежи. Заполняется при отмене, чтобы
  -- агент дожил до конца оплаченного периода, а не отключился в момент
  -- нажатия кнопки.
  expires_at   timestamptz,

  PRIMARY KEY (tenant_id, agent_id)
);

-- Портал спрашивает «что есть у этого клиента» на каждой отрисовке.
CREATE INDEX ON tenant_agents (tenant_id) WHERE status IN ('active', 'trialing');

/**
 * Перенос: тариф → набор агентов.
 *
 * Соответствие снято с `src/engine/plans.ts` на 2026-08-26 и является
 * СНИМКОМ. Миграция обязана применяться на пустой машине без приложения,
 * поэтому маппинг здесь повторён, а не импортирован. Менять его задним
 * числом нельзя: следующие изменения лестницы — это следующая миграция.
 *
 *   starter     chatbot
 *   pro         + configurator
 *   business    + follow-up, order-status
 *   enterprise  + content-engine, voice-assistant
 *
 * Ключи возможностей отображаются в идентификаторы агентов так:
 * followup → follow-up, productionUpdates → order-status,
 * social → content-engine, voice → voice-assistant.
 *
 * `drive` и `connectors` сюда не попадают: это возможности платформы,
 * а не агенты, и продаются они не поштучно.
 *
 * `analytics` не попадает тоже: аналитик не запущен, и ни у кого его нет.
 */
INSERT INTO tenant_agents (tenant_id, agent_id, source, status)
SELECT t.id, a.agent_id, 'plan', 'active'
  FROM tenants t
  CROSS JOIN LATERAL (
    SELECT unnest(
      CASE t.plan
        WHEN 'starter'    THEN ARRAY['chatbot']
        WHEN 'pro'        THEN ARRAY['chatbot','configurator']
        WHEN 'business'   THEN ARRAY['chatbot','configurator','follow-up','order-status']
        WHEN 'enterprise' THEN ARRAY['chatbot','configurator','follow-up','order-status',
                                     'content-engine','voice-assistant']
        -- Значение вне лестницы появиться не должно: 039 привела их все к
        -- starter. Если всё же появилось — тот же выбор, что там, и по той
        -- же причине: заниженные права клиент заметит и позвонит, завышенные
        -- не заметит никто, и платить за них будем мы.
        ELSE ARRAY['chatbot']
      END
    ) AS agent_id
  ) a
 WHERE t.status <> 'deleted';

COMMIT;
