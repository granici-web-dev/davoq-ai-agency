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
  leads: number;
  tenants: number;
  /** Сколько файлов оферт удалено — их легко потерять из виду, они не в `documents`. */
  offerFiles: number;
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

    // ── Старые заявки ─────────────────────────────────────────────────────
    //
    // Заявка с офертой — это уже не имя и телефон, а ещё конфигурация, цена
    // и PDF. Срок у каждого клиента свой; 0 означает «не удалять».
    //
    // PDF удаляется ВМЕСТЕ с заявкой. Убрать контакт из базы и оставить на
    // диске документ, где то же имя стоит в шапке рядом с адресом доставки, —
    // это не удаление персональных данных, а видимость удаления.
    //
    // Сама оферта остаётся: номер, сумма и дата — бухгалтерский факт и
    // непрерывность ряда. Ссылка на заявку обнулится внешним ключом сама.
    const { rows: staleOffers } = await client.query<{ id: string; storage_key: string }>(
      `SELECT o.id, o.storage_key
         FROM offers o
         JOIN leads l   ON l.id = o.lead_id
         JOIN tenants t ON t.id = l.tenant_id
        WHERE t.lead_retention_days > 0
          AND l.created_at < now() - (t.lead_retention_days || ' days')::interval
          AND o.storage_key <> ''`,
    );
    let offerFiles = await removeFiles(staleOffers.map((o) => o.storage_key));
    if (staleOffers.length > 0) {
      await client.query(
        `UPDATE offers SET storage_key = '' WHERE id = ANY($1::uuid[])`,
        [staleOffers.map((o) => o.id)],
      );
    }

    const { rowCount: leads } = await client.query(
      `DELETE FROM leads l
        USING tenants t
        WHERE l.tenant_id = t.id
          AND t.lead_retention_days > 0
          AND l.created_at < now() - (t.lead_retention_days || ' days')::interval`,
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
      // Материалы И оферты. Оферты не в `documents`, и цикл удаления про них
      // не знал бы: после ухода клиента на диске остались бы PDF с именами,
      // телефонами и ценами его покупателей.
      const { rows: keys } = await client.query<{ storage_key: string }>(
        `SELECT storage_key FROM documents WHERE tenant_id = $1 AND storage_key <> ''
         UNION ALL
         SELECT storage_key FROM offers    WHERE tenant_id = $1 AND storage_key <> ''`,
        [t.id],
      );
      offerFiles += await removeFiles(keys.map((k) => k.storage_key));

      // Всё остальное уходит каскадом от tenants.
      await client.query('DELETE FROM tenants WHERE id = $1', [t.id]);
      console.log(`удалён клиент ${t.name}: срок хранения после отмены истёк`);
    }

    return {
      conversations: conversations ?? 0,
      leads: leads ?? 0,
      tenants: doomed.length,
      offerFiles,
    };
  });
}

/**
 * Удаление файлов пачкой.
 *
 * Неудача на файле не останавливает проход: строку в базе убрать важнее,
 * чем байты на диске, и оставшийся файл безопаснее оставшейся переписки.
 */
async function removeFiles(keys: string[]): Promise<number> {
  let removed = 0;
  for (const key of keys) {
    await storageRemove(key)
      .then(() => { removed += 1; })
      .catch((err: Error) => console.error(`не удалось удалить файл ${key}: ${err.message}`));
  }
  return removed;
}
