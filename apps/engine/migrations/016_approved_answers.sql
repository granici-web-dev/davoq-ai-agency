-- Утверждённые ответы.
--
-- Директор по продажам читает разговор, видит неверный ответ и пишет верный.
-- Дальше бот отвечает так же — дословно. Это единственное место, где человек
-- управляет словами бота напрямую, а не через материалы, и в пилоте оно
-- отвечает на главный вопрос клиента: «а если он скажет не то?».
--
-- Отдельная таблица, а не документ в базе знаний: у утверждённого ответа
-- приоритет над всем найденным, и он не должен растворяться среди фрагментов,
-- конкурируя с ними по близости.
BEGIN;

CREATE TABLE approved_answers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Вопрос посетителя, как он был задан: по нему и ищем похожие.
  question               text        NOT NULL,
  answer                 text        NOT NULL,
  embedding              vector(1024),
  -- Как и у фрагментов: при смене модели эмбеддингов сравнивать поколения нельзя.
  embedding_model        text        NOT NULL,
  -- Откуда пришёл: из этого разговора директор его и утвердил.
  source_conversation_id uuid        REFERENCES conversations(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES admin_users(id) ON DELETE SET NULL,
  active                 boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON approved_answers (tenant_id, active, updated_at DESC);
CREATE INDEX ON approved_answers USING hnsw (embedding vector_cosine_ops);

ALTER TABLE approved_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_answers FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON approved_answers
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

COMMIT;
