import { withTenant } from '../db/pool.js';
import { createDocument, processDocument } from '../ingest/index.js';
import { DriveClient } from './client.js';
import { clientError } from '../api/errors.js';

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  errors: string[];
}

/**
 * Синхронизация папки с базой знаний.
 *
 * Изменения определяются по времени правки файла, а не пересчётом всего: полный
 * пере-эмбеддинг корпуса на каждый прогон — это деньги и минуты там, где обычно
 * меняется один файл из тридцати.
 */
export async function syncDrive(tenantId: string): Promise<SyncResult> {
  const result: SyncResult = { added: 0, updated: 0, removed: 0, unchanged: 0, errors: [] };

  const conn = await withTenant(tenantId, (c) => DriveClient.forTenant(c, tenantId));
  if (!conn) throw clientError('drive_not_connected', 'Google Drive nu este conectat');

  const files = await conn.drive.list(conn.folderId);

  const known = await withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ id: string; external_id: string; external_modified_at: Date }>(
      `SELECT id, external_id, external_modified_at FROM documents WHERE external_id IS NOT NULL`,
    );
    return new Map(rows.map((r) => [r.external_id, r]));
  });

  const seen = new Set<string>();

  for (const file of files) {
    seen.add(file.id);
    const prev = known.get(file.id);
    const modified = new Date(file.modifiedTime);

    if (prev && prev.external_modified_at.getTime() >= modified.getTime()) {
      result.unchanged++;
      continue;
    }

    try {
      const { bytes, mime } = await conn.drive.download(file);

      // Старая версия удаляется до вставки новой: обновление того же файла Drive
      // не должно оставить в базе два поколения фрагментов.
      if (prev) {
        await withTenant(tenantId, (c) =>
          c.query('DELETE FROM documents WHERE id = $1', [prev.id]),
        );
      }

      const docId = await createDocument(tenantId, {
        filename: `drive:${file.path}`,
        mime,
        bytes,
      });
      await withTenant(tenantId, (c) =>
        c.query(
          'UPDATE documents SET external_id = $2, external_modified_at = $3 WHERE id = $1',
          [docId, file.id, modified.toISOString()],
        ),
      );
      await processDocument(tenantId, docId);

      if (prev) result.updated++;
      else result.added++;
    } catch (err) {
      result.errors.push(`${file.path}: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  // Файл убрали из папки — значит он больше не должен звучать в ответах бота.
  // Оставить его «на всякий случай» означает отвечать по отозванному документу.
  for (const [externalId, doc] of known) {
    if (seen.has(externalId)) continue;
    await withTenant(tenantId, (c) => c.query('DELETE FROM documents WHERE id = $1', [doc.id]));
    result.removed++;
  }

  await withTenant(tenantId, (c) =>
    c.query(
      `UPDATE connectors SET config = config || $2::jsonb
        WHERE tenant_id = $1 AND type = 'google_drive'`,
      [
        tenantId,
        JSON.stringify({
          lastSyncAt: new Date().toISOString(),
          lastResult: { ...result, errors: result.errors.slice(0, 5) },
        }),
      ],
    ),
  );

  return result;
}
