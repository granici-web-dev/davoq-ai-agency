-- Конфигуратор: слой клиента в базе, оферты, нумерация, сроки хранения.
--
-- Одной миграцией намеренно. Таблица оферт заводит на диске файлы с именами,
-- телефонами и ценами покупателей клиента; цикл удаления сегодня знает только
-- про `documents.storage_key`. Развести это на две миграции значит выпустить
-- в мир состояние, в котором удаление клиента оставляет его покупателей
-- на нашем диске, — и «потом» здесь никогда не наступает вовремя.
BEGIN;

-- ── Слой клиента ──────────────────────────────────────────────────────────
--
-- Конфигуратор клиента (флоу, цены, бланк, промпт агента) ложится сюда jsonb,
-- как `quote_fields` и `profile`: онбординг переносит YAML в базу, дальше
-- источник правды — база. Слой ниши остаётся файлами в репозитории и
-- обновляется релизом, а не миграцией.
ALTER TABLE tenants ADD COLUMN configurator jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.configurator IS
  'Слой клиента для конфигуратора: flow, pricing, offer, agent. Поверх слоя ниши.';

-- ── Нумерация оферт ───────────────────────────────────────────────────────
--
-- Счётчик в БАЗЕ, а не в конфиге: два посетителя, нажавшие «Получить оферту»
-- в одну секунду, обязаны получить разные номера. Конфиг для этого не годится
-- ни в каком виде — он читается, а не блокируется.
--
-- Начальное значение важно: у клиента уже есть свой ряд (последняя виденная
-- оферта — NR. 986), и наш счётчик обязан его продолжить. Две оферты с одним
-- номером в одном году — это спор с покупателем, который клиент проиграет.
ALTER TABLE tenants
  ADD COLUMN offer_number_next   integer NOT NULL DEFAULT 1,
  ADD COLUMN offer_number_format text    NOT NULL DEFAULT '{n}';

COMMENT ON COLUMN tenants.offer_number_next IS
  'Следующий номер оферты. Заводится продолжением существующего ряда клиента.';
COMMENT ON COLUMN tenants.offer_number_format IS
  'Шаблон номера: {n} — счётчик, {year} — год. Счётчик не сбрасывается.';

-- ── Оферты ────────────────────────────────────────────────────────────────
CREATE TABLE offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Лид может быть удалён по сроку хранения раньше оферты: номер и сумма
  -- остаются бухгалтерским фактом, контакт — нет.
  lead_id     uuid REFERENCES leads(id) ON DELETE SET NULL,
  number      text NOT NULL,
  locale      text NOT NULL,
  -- Что выбрал посетитель и что насчитал сервер. Оферту надо уметь объяснить
  -- через год, а бланк и прайс к тому времени поменяются.
  selections  jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing     jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_bani  bigint NOT NULL,
  storage_key text NOT NULL DEFAULT '',
  valid_until date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Номер, по которому оферту нельзя найти однозначно, обесценивает её.
  CONSTRAINT offer_number_per_tenant UNIQUE (tenant_id, number)
);
CREATE INDEX ON offers (tenant_id, created_at DESC);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON offers
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON offers TO assistwidget_app;

-- ── Лиды: чей это лид и когда он исчезает ─────────────────────────────────
--
-- Заявки из чата и из конфигуратора живут в одной таблице: это один и тот же
-- контакт одного и того же покупателя, и разводить их по таблицам значит
-- заводить два списка заявок в панели у продавца.
ALTER TABLE leads ADD COLUMN product text NOT NULL DEFAULT 'chatbot';

COMMENT ON COLUMN leads.product IS
  'Откуда пришла заявка: chatbot | configurator.';

-- Срок хранения заявок.
--
-- До сих пор их не удаляли никогда, и это было верно, пока заявка была именем
-- и телефоном. Заявка с офертой — это ещё конфигурация, цена и PDF, то есть
-- заметно больше персональных данных, чем «Ион, +40…». Умолчание — три года,
-- общий срок исковой давности по договору: раньше удалять нельзя (спор
-- по заказу живой), дольше хранить нечем обосновать.
ALTER TABLE tenants ADD COLUMN lead_retention_days integer NOT NULL DEFAULT 1095;

COMMENT ON COLUMN tenants.lead_retention_days IS
  'Сколько живут заявки. 0 — не удалять (для клиентов с иным основанием хранения).';

COMMIT;
