-- Phase 1 — ядро: тенанты, RLS, документы, чанки, диалоги, учёт.
-- Коннекторы (Phase 3) и leads (Phase 2) — отдельными миграциями.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Агентство-реселлер над тенантом. В §5 спеки этого уровня нет, но всё позиционирование
-- (research.md) строится на white-label-реселле: покупатель и настройщик — агентство,
-- а не конечный бизнес. Добавить сущность позже = переписать владение и биллинг.
CREATE TABLE agencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  custom_domain   text,                       -- свой домен дашборда
  branding        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  billing_owner   text        NOT NULL DEFAULT 'platform'
                  CHECK (billing_owner IN ('platform','agency')),  -- Stripe passthrough
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid REFERENCES agencies(id) ON DELETE RESTRICT,  -- NULL = прямой клиент
  name            text        NOT NULL,
  plan            text        NOT NULL DEFAULT 'starter',
  model_tier      text        NOT NULL DEFAULT 'base'
                  CHECK (model_tier IN ('base','premium')),
  allowed_domains text[]      NOT NULL DEFAULT '{}',
  locale_default  text        NOT NULL DEFAULT 'de',
  -- Потолок расхода на суб-аккаунт. research.md (B): без него один высокотрафиковый
  -- клиент съедает маржу агентства.
  monthly_message_cap integer,
  status          text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','deleted')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenants (agency_id);

CREATE TABLE widget_configs (
  tenant_id       uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  theme           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  position        text        NOT NULL DEFAULT 'bottom-right',
  launcher_icon_url text,
  avatar_url      text,
  bot_name        text        NOT NULL DEFAULT 'Assistant',
  welcome_message jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- по локалям
  preset_id       text,
  -- AI Act Art. 50(1), в силе с 02.08.2026: раскрытие «я — ИИ» обязательно.
  -- В §3 спеки (строка 180) это был настраиваемый тумблер — тумблер убран,
  -- редактируется только текст, а не факт наличия надписи.
  ai_disclosure_text jsonb    NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename        text        NOT NULL,
  source_url      text,
  storage_key     text        NOT NULL,
  mime            text        NOT NULL,
  size_bytes      bigint      NOT NULL,
  status          text        NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded','processing','indexed','failed')),
  error_text      text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  indexed_at      timestamptz
);
CREATE INDEX ON documents (tenant_id, status);

CREATE TABLE chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq             integer     NOT NULL,
  content         text        NOT NULL,
  embedding       vector(1024),
  -- §14.4: смена модели эмбеддингов = полный пере-эмбеддинг корпуса.
  -- Без этой колонки миграция неразрешима — пишем с первого дня.
  embedding_model text        NOT NULL,
  token_count     integer     NOT NULL DEFAULT 0,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON chunks (tenant_id, document_id, seq);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visitor_id      text        NOT NULL,
  channel         text        NOT NULL DEFAULT 'web',
  locale          text        NOT NULL DEFAULT 'de',
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','resolved','escalated'))
);
CREATE INDEX ON conversations (tenant_id, last_message_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user','assistant','system')),
  content         text        NOT NULL,
  tool_calls      jsonb,
  tokens_in       integer     NOT NULL DEFAULT 0,
  tokens_out      integer     NOT NULL DEFAULT 0,
  cache_read_tokens integer   NOT NULL DEFAULT 0,   -- контроль эффективности кеша
  model           text,
  retrieval_chunk_ids uuid[]  NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at);

CREATE TABLE usage_daily (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  messages        integer     NOT NULL DEFAULT 0,
  tokens_in       bigint      NOT NULL DEFAULT 0,
  tokens_out      bigint      NOT NULL DEFAULT 0,
  model_tier      text        NOT NULL DEFAULT 'base',
  cost_estimate_cents integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date, model_tier)
);

CREATE TABLE unanswered_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  question        text        NOT NULL,
  reason          text        NOT NULL
                  CHECK (reason IN ('no_retrieval_hit','low_confidence','out_of_scope')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON unanswered_log (tenant_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- FORCE обязателен: без него владелец таблиц обходит политику, и изоляция
-- существует только пока приложение не подключилось под владельцем.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','widget_configs','documents','chunks',
                           'conversations','messages','usage_daily','unanswered_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- nullif(): при неустановленном контексте current_setting возвращает пустую строку,
-- и без него ::uuid падает с нечитаемым «invalid input syntax». С ним сравнение даёт
-- NULL → false → ноль строк. Утечки нет в обоих случаях, но так диагностируемее;
-- громкий отказ при отсутствии контекста живёт в withTenant() на стороне приложения.
CREATE POLICY tenant_isolation ON tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['widget_configs','documents','chunks',
                           'conversations','messages','usage_daily','unanswered_log']
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

COMMIT;
