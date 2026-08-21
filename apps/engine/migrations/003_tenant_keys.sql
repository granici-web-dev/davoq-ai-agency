-- Ключи тенанта (§4). pk_ уходит в виджет и виден всем — он лишь идентифицирует тенанта,
-- а защиту даёт allowed_domains. sk_ живёт на сервере клиента и хранится только хешем.
BEGIN;

ALTER TABLE tenants
  ADD COLUMN public_key      text UNIQUE,
  ADD COLUMN secret_key_hash text;

CREATE INDEX ON tenants (public_key) WHERE public_key IS NOT NULL;

-- Резолв тенанта по pk_ идёт ДО установки tenant-контекста, поэтому под RLS он невозможен.
-- Отдельная SECURITY DEFINER-функция отдаёт ровно то, что нужно для проверки происхождения
-- запроса, и ничего больше — вместо права читать таблицу tenants целиком.
CREATE FUNCTION resolve_tenant_by_public_key(pk text)
RETURNS TABLE (id uuid, allowed_domains text[], locale_default text,
               model_tier text, status text, monthly_message_cap integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.allowed_domains, t.locale_default,
         t.model_tier, t.status, t.monthly_message_cap
  FROM tenants t
  WHERE t.public_key = pk
$$;

REVOKE ALL ON FUNCTION resolve_tenant_by_public_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_by_public_key(text) TO assistwidget_app;

COMMIT;
