-- Phase 2: лиды, доступ в админку, аудит, ретеншн.
BEGIN;

CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  email           text,
  phone           text,
  name            text,
  note            text,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Лид без единого способа связи бесполезен: модель иногда вызывает инструмент
  -- «на всякий случай», не дождавшись контакта.
  CONSTRAINT lead_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX ON leads (tenant_id, created_at DESC);

-- Доступ в админку (§10). Пароль хранится scrypt-хешем вместе с солью и параметрами:
-- без записанных параметров пароли нельзя перехешировать при их ужесточении.
CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  agency_id     uuid REFERENCES agencies(id) ON DELETE CASCADE,
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  role          text        NOT NULL DEFAULT 'tenant_admin'
                CHECK (role IN ('tenant_admin','agency_admin','superadmin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Роль определяет, какой из двух скоупов обязателен: тенантный админ без тенанта
  -- или агентский без агентства — это тихая дыра в доступе, а не просто NULL.
  CONSTRAINT scope_matches_role CHECK (
    (role = 'tenant_admin' AND tenant_id IS NOT NULL) OR
    (role = 'agency_admin' AND agency_id IS NOT NULL) OR
    (role = 'superadmin')
  )
);
CREATE UNIQUE INDEX ON admin_users (lower(email));

CREATE TABLE admin_sessions (
  token_hash  text PRIMARY KEY,          -- сам токен не хранится: утечка таблицы ≠ вход
  user_id     uuid        NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX ON admin_sessions (user_id);

-- §11: аудит действий администратора, коннекторы в первую очередь.
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  target     text,
  detail     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (tenant_id, created_at DESC);

-- §11: ретеншн диалогов настраивается тенантом, по умолчанию 12 месяцев.
ALTER TABLE tenants ADD COLUMN conversation_retention_months integer NOT NULL DEFAULT 12;

ALTER TABLE leads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads     FORCE  ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON audit_log
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON leads, admin_users, admin_sessions, audit_log
  TO assistwidget_app;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO assistwidget_app;

COMMIT;
