-- Одна заявка на разговор.
-- Боту разрешено передавать заявку повторно, дополнив её: контакт он получает
-- раньше остальных подробностей, и ждать полноты — значит терять посетителей.
-- Но в списке отдела продаж это выглядело как два обращения от одного человека.
BEGIN;
DELETE FROM leads a USING leads b
  WHERE a.conversation_id = b.conversation_id AND a.conversation_id IS NOT NULL
    AND (a.quote_completeness, a.created_at) < (b.quote_completeness, b.created_at);
CREATE UNIQUE INDEX leads_one_per_conversation
  ON leads (conversation_id) WHERE conversation_id IS NOT NULL;
COMMIT;
