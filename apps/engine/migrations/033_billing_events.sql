-- Журнал платёжных событий.
--
-- Нужен для двух разных вещей, и обе выясняются в неудачный день.
--
-- Первое: разбирательство. «Клиент говорит, что платил» — без журнала это
-- слово против слова, а со Stripe разговаривать придётся через их панель.
--
-- Второе: повторы. Stripe шлёт событие несколько раз, пока не получит 200,
-- и порядок не гарантирован. Уникальность по event_id делает видимым,
-- сколько раз событие приходило на самом деле.
--
-- RLS здесь нет намеренно: строки пишет вебхук, у которого нет тенантного
-- контекста, а читаем их мы, а не клиент. Клиенту в панели показывается
-- состояние подписки, а не история наших расчётов с платёжной системой.
BEGIN;

CREATE TABLE billing_events (
  id         bigserial   PRIMARY KEY,
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id   text        NOT NULL,
  type       text        NOT NULL,
  status     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_events_event_id_key ON billing_events (event_id);
CREATE INDEX billing_events_tenant_idx ON billing_events (tenant_id, created_at DESC);

COMMIT;
