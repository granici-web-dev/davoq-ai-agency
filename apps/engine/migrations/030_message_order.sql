-- Порядок реплик в разговоре был не определён.
--
-- Обе реплики оборота — вопрос и ответ — пишутся в одной транзакции, а
-- `now()` в Postgres возвращает время НАЧАЛА транзакции, одинаковое для обеих.
-- Сортировка шла только по нему, второго ключа не было. То есть порядок
-- выбирала база: и в панели, и в выгрузке, и — что хуже — в истории, которая
-- уходит модели. Ответ перед вопросом читается как бессмыслица, а модель
-- на такой истории отвечает не на то.
--
-- Отдельный счётчик внутри разговора. Не `clock_timestamp()`: миллисекунды
-- совпадают чаще, чем кажется, и это снова была бы лотерея, только реже.
BEGIN;

ALTER TABLE messages ADD COLUMN seq integer;

-- Существующие реплики: порядок восстанавливается по времени, а внутри
-- одного времени вопрос ставится перед ответом — так и было на самом деле.
WITH ordered AS (
  SELECT id, row_number() OVER (
           PARTITION BY conversation_id
           ORDER BY created_at, CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END, id
         ) AS n
    FROM messages
)
UPDATE messages m SET seq = ordered.n FROM ordered WHERE ordered.id = m.id;

ALTER TABLE messages ALTER COLUMN seq SET NOT NULL;

DROP INDEX IF EXISTS messages_conversation_id_created_at_idx;
CREATE INDEX ON messages (conversation_id, seq);

COMMIT;
