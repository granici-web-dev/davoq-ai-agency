-- Тариф становится единственной ручкой, и появляется состояние подписки.
--
-- Прежде тариф, уровень модели и потолок сообщений стояли независимо. У пилота
-- это уже разъехалось: plan = 'business', model_tier = 'base', потолка нет.
-- Куплен старший тариф, работает дешёвая модель, ограничения нет никакого.
-- Три значения, которые обязаны согласовываться, но которые ничто не заставляло.
BEGIN;

-- ── 1. Модель определяется тарифом ──────────────────────────────────────────
--
-- Пилот переводится на `pro`, а не остаётся на `business`. Это сохранение
-- текущего поведения, а не понижение: он и так отвечал дешёвой моделью, то есть
-- фактически получал `pro`. Оставить `business` значило бы молча включить ему
-- Sonnet и утроить расход на модель — такое решение принимает человек, а не
-- миграция. Материалы при этом помещаются с запасом: 21 документ и 255
-- фрагментов против 50 и 10 000, разрешённых на `pro`.
UPDATE tenants SET plan = 'pro'
 WHERE plan = 'business' AND model_tier = 'base';

ALTER TABLE tenants DROP COLUMN model_tier;

-- ── 2. Потолок сообщений ────────────────────────────────────────────────────
--
-- NULL меняет смысл: было «без ограничений», стало «как в тарифе». Прежнее
-- значение опасно само по себе — клиент без потолка это счёт за Bedrock,
-- ограниченный только чужой добросовестностью. Ненулевое значение остаётся
-- запасным ходом для особых договорённостей.
COMMENT ON COLUMN tenants.monthly_message_cap IS
  'NULL — потолок из тарифа. Число — осознанное отступление для этого клиента.';

-- ── 3. Состояние подписки ───────────────────────────────────────────────────
--
-- Держится у нас, а не запрашивается у платёжной системы на каждый запрос:
-- ответ бота не должен зависеть от доступности чужого API. Обновляется
-- вебхуком и потому может отстать на минуты — это допустимо, а вот отказать
-- посетителю из-за недоступного Stripe недопустимо.
ALTER TABLE tenants
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'trial',
  ADD COLUMN subscription_id     text,
  ADD COLUMN billing_customer_id text,
  ADD COLUMN current_period_end  timestamptz,
  ADD COLUMN trial_ends_at       timestamptz;

ALTER TABLE tenants ADD CONSTRAINT subscription_status_known CHECK (
  subscription_status IN ('trial', 'active', 'past_due', 'canceled')
);

-- Идентификаторы платёжной системы уникальны глобально: одна подписка
-- не может принадлежать двум клиентам, и полагаться тут на аккуратность
-- вебхука нельзя.
CREATE UNIQUE INDEX tenants_subscription_id_key ON tenants (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Пилот уже работает и платить пока не должен.
UPDATE tenants SET subscription_status = 'active' WHERE status = 'active';

-- ── 4. Резолв тенанта отдаёт тариф вместо уровня модели ─────────────────────
DROP FUNCTION IF EXISTS resolve_tenant_by_public_key(text);

CREATE FUNCTION resolve_tenant_by_public_key(pk text)
RETURNS TABLE (id uuid, allowed_domains text[], locale_default text,
               supported_locales text[], plan text, status text,
               subscription_status text, monthly_message_cap integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.allowed_domains, t.locale_default, t.supported_locales,
         t.plan, t.status, t.subscription_status, t.monthly_message_cap
  FROM tenants t
  WHERE t.public_key = pk
$$;

REVOKE ALL ON FUNCTION resolve_tenant_by_public_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_by_public_key(text) TO assistwidget_app;

COMMIT;
