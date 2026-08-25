-- Google Drive как источник базы знаний. Хранится тем же коннектором (§8):
-- secret_encrypted — refresh-токен, config — идентификатор папки.
BEGIN;
ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_type_check;
ALTER TABLE connectors ADD CONSTRAINT connectors_type_check
  CHECK (type IN ('webhook_rest', 'make', 'hubspot', 'google_drive'));
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
-- base_url для диска не нужен, но колонка NOT NULL — даём ей пустое значение по умолчанию
ALTER TABLE connectors ALTER COLUMN base_url SET DEFAULT '';
COMMIT;
