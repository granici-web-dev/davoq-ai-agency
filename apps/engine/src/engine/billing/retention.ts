import { withOwner } from '../db/pool.js';
import { remove as storageRemove } from '../ingest/storage.js';

/**
 * Сроки хранения.
 *
 * Две разные вещи, и путать их нельзя.
 *
 * ПЕРЕПИСКИ живут ограниченное время у ВСЕХ клиентов, включая платящих.
 * Посетитель, спросивший про диван и оставивший телефон, не соглашался
 * на вечное хранение — ни он, ни закон. Заявки при этом остаются: это уже
 * деловые отношения клиента с его покупателем, и удалять их за него мы права
 * не имеем. Удаляется переписка, а не факт обращения.
 *
 * ДАННЫЕ ОТМЕНИВШЕГО клиента живут срок передумать, а потом исчезают целиком.
 * Слишком короткий срок наказывает за забытую карту; вечный — превращает нас
 * в хранилище чужих данных без основания их хранить.
 *
 * Оба прохода идут под владельцем базы: удаление затрагивает всех клиентов
 * сразу, то есть по определению вне тенантного контекста.
 */

/** Сколько живут переписки. Заявки не трогаются никогда. */
export const CONVERSATION_DAYS = Number(process.env.CONVERSATION_RETENTION_DAYS ?? 365);

/** Сколько данные отменившего клиента ждут его возвращения. */
export const CANCELED_DAYS = Number(process.env.CANCELED_RETENTION_DAYS ?? 30);

export interface PurgeResult {
  conversations: number;
  tenants: number;
}

export async function purge(): Promise<PurgeResult> {
  return withOwner(async (client) => {
    // ── Старые переписки ──────────────────────────────────────────────────
    //
    // Заявка ссылается на разговор, и внешний ключ обнулит ссылку сам
    // (ON DELETE SET NULL). Заявка остаётся: контакт покупателя — это
    // собственность клиента, а не наш журнал.
    const { rowCount: conversations } = await client.query(
      `DELETE FROM conversations
        WHERE last_message_at < now() - ($1 || ' days')::interval`,
      [String(CONVERSATION_DAYS)],
    );

    // ── Данные отменивших ─────────────────────────────────────────────────
    //
    // Сначала забираем ключи файлов: после удаления тенанта строк не останется,
    // и файлы на диске превратились бы в мусор, о котором никто не знает.
    const { rows: doomed } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM tenants
        WHERE subscription_status = 'canceled'
          AND canceled_at IS NOT NULL
          AND canceled_at < now() - ($1 || ' days')::interval`,
      [String(CANCELED_DAYS)],
    );

    for (const t of doomed) {
      const { rows: keys } = await client.query<{ storage_key: string }>(
        `SELECT storage_key FROM documents
          WHERE tenant_id = $1 AND storage_key <> ''`, [t.id],
      );
      for (const k of keys) {
        // Неудача на файле не должна останавливать удаление: строку в базе
        // убрать важнее, чем байты на диске, и оставшийся файл безопаснее
        // оставшейся переписки.
        await storageRemove(k.storage_key).catch((err: Error) =>
          console.error(`не удалось удалить файл ${k.storage_key}: ${err.message}`));
      }

      // Всё остальное уходит каскадом от tenants.
      await client.query('DELETE FROM tenants WHERE id = $1', [t.id]);
      console.log(`удалён клиент ${t.name}: срок хранения после отмены истёк`);
    }

    return { conversations: conversations ?? 0, tenants: doomed.length };
  });
}
