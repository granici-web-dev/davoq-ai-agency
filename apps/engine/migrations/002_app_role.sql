-- Роль приложения. Отдельная миграция, потому что дефолтный пользователь Postgres
-- (POSTGRES_USER / владелец БД) — superuser, а superuser обходит RLS, включая FORCE.
-- Без этой роли изоляция тенантов существует только на бумаге.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistwidget_app') THEN
    CREATE ROLE assistwidget_app LOGIN PASSWORD 'dev'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO assistwidget_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO assistwidget_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO assistwidget_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO assistwidget_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO assistwidget_app;

-- agencies управляется платформенным API, не тенантным контекстом: RLS на ней нет,
-- поэтому и прав тенантной роли на неё не выдаём.
REVOKE ALL ON agencies FROM assistwidget_app;
GRANT SELECT ON agencies TO assistwidget_app;

COMMIT;
