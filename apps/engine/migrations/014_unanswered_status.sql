-- Автопроверка чек-листа.
--
-- До сих пор список пробелов был журналом: вопрос, на который материалы уже
-- появились, всё равно висел в нём тридцать дней. Директор дозаливал файл и
-- не видел никакого результата — а именно это и есть петля, ради которой
-- затевалась база знаний на Google Drive. Без обратной связи он перестанет
-- дозаливать на второй неделе.
--
-- Ответ хранится рядом со статусом намеренно: «закрыто» без текста директор
-- проверить не может, а увидев ответ — заметит, если бот отвечает не то.
BEGIN;

ALTER TABLE unanswered_log
  ADD COLUMN status          text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'resolved')),
  ADD COLUMN checked_at      timestamptz,
  ADD COLUMN resolved_at     timestamptz,
  ADD COLUMN resolved_answer text;

-- Проверяются только открытые за последний месяц — по ним и строится выборка.
CREATE INDEX ON unanswered_log (tenant_id, status, created_at DESC);

COMMIT;
