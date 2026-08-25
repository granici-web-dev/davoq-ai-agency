-- Поиск по тексту переписок.
-- Конфигурация 'simple' вместо языковой: посетители пишут на четырёх языках,
-- и румынского словаря в стандартной поставке Postgres нет вовсе. 'simple'
-- не знает морфологии, но работает одинаково для всех языков — для поиска
-- по фрагменту фразы этого достаточно.
BEGIN;

ALTER TABLE messages ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX ON messages USING gin (search);

-- Сортировка и фильтр по дате — основной сценарий директора по продажам.
CREATE INDEX IF NOT EXISTS conversations_tenant_started
  ON conversations (tenant_id, started_at DESC);

COMMIT;
