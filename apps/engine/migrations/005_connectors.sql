-- Phase 3: коннекторы и инструменты (§8).
BEGIN;

CREATE TABLE connectors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type              text NOT NULL DEFAULT 'webhook_rest'
                    CHECK (type IN ('webhook_rest','make','hubspot')),
  name              text NOT NULL,
  base_url          text NOT NULL,
  headers_template  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- значения могут содержать {{secret}}
  secret_encrypted  bytea,                                -- AES-256-GCM, ключ из окружения
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','disabled')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON connectors (tenant_id);

CREATE TABLE connector_tools (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id          uuid NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name             text NOT NULL,
  description           text NOT NULL,      -- это видит модель; поверхность промпт-инжиниринга
  input_schema          jsonb NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  http_method           text NOT NULL DEFAULT 'GET'
                        CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  path_template         text NOT NULL,      -- /orders/{order_id}
  body_template         jsonb,
  response_instructions text NOT NULL DEFAULT '',
  enabled               boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Имя инструмента попадает в API как идентификатор и должно быть уникально
  -- у тенанта: два одинаковых имени сделали бы выбор модели неопределённым.
  CONSTRAINT tool_name_shape CHECK (tool_name ~ '^[a-z][a-z0-9_]{2,63}$')
);
CREATE UNIQUE INDEX ON connector_tools (tenant_id, tool_name);

ALTER TABLE connectors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors      FORCE  ROW LEVEL SECURITY;
ALTER TABLE connector_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_tools FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connectors
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation ON connector_tools
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON connectors, connector_tools TO assistwidget_app;

COMMIT;
