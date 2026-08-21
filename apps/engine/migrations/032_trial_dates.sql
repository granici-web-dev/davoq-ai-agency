-- Резолв тенанта отдаёт даты подписки: они нужны на пути сообщения.
--
-- Право отвечать посетителю проверяется в каждом запросе, и спрашивать о нём
-- платёжную систему нельзя — ответ бота не должен зависеть от доступности
-- чужого API. Состояние держится у нас, здесь оно и достаётся.
BEGIN;

-- Пилот работает без подписки: он не должен упереться в конец несуществующего
-- триала. Явный active, а не пустой триал.
UPDATE tenants SET subscription_status = 'active' WHERE subscription_status = 'trial';

DROP FUNCTION IF EXISTS resolve_tenant_by_public_key(text);

CREATE FUNCTION resolve_tenant_by_public_key(pk text)
RETURNS TABLE (id uuid, allowed_domains text[], locale_default text,
               supported_locales text[], plan text, status text,
               subscription_status text, trial_ends_at timestamptz,
               current_period_end timestamptz, monthly_message_cap integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.allowed_domains, t.locale_default, t.supported_locales,
         t.plan, t.status, t.subscription_status, t.trial_ends_at,
         t.current_period_end, t.monthly_message_cap
  FROM tenants t
  WHERE t.public_key = pk
$$;

REVOKE ALL ON FUNCTION resolve_tenant_by_public_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_by_public_key(text) TO assistwidget_app;

COMMIT;
