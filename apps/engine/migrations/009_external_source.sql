-- Привязка документа к файлу во внешнем источнике.
-- Без идентификатора файла синхронизация не может отличить переименование
-- от нового файла, а без времени правки — переиндексировать всё заново каждый раз.
BEGIN;
ALTER TABLE documents
  ADD COLUMN external_id text,
  ADD COLUMN external_modified_at timestamptz;
CREATE UNIQUE INDEX ON documents (tenant_id, external_id) WHERE external_id IS NOT NULL;
COMMIT;
