import type pg from 'pg';
import { decryptSecret } from '../llm/secrets.js';
import { refresh } from './oauth.js';

const API = 'https://www.googleapis.com/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  path: string;
}

/**
 * Экспорт документов Google в наши форматы. Родные Docs и Sheets нельзя скачать
 * как есть — только выгрузить, и выбор формата определяет качество индексации:
 * из Docs берём HTML, чтобы сохранились заголовки и попали в путь раздела.
 */
const EXPORT_AS: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/html',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const FOLDER = 'application/vnd.google-apps.folder';

export class DriveClient {
  #token = '';
  #expiresAt = 0;
  #refreshToken: string;

  constructor(refreshToken: string) {
    this.#refreshToken = refreshToken;
  }

  static async forTenant(client: pg.PoolClient, tenantId: string): Promise<{
    drive: DriveClient; folderId: string;
  } | null> {
    const { rows } = await client.query<{ secret_encrypted: Buffer; config: { folderId?: string } }>(
      `SELECT secret_encrypted, config FROM connectors
        WHERE tenant_id = $1 AND type = 'google_drive' AND status = 'active' LIMIT 1`,
      [tenantId],
    );
    const row = rows[0];
    if (!row?.secret_encrypted || !row.config?.folderId) return null;
    return {
      drive: new DriveClient(decryptSecret(row.secret_encrypted)),
      folderId: row.config.folderId,
    };
  }

  async #auth(): Promise<string> {
    // Запас в минуту: токен, годный «ещё три секунды», протухнет посреди скачивания.
    if (this.#token && Date.now() < this.#expiresAt - 60_000) return this.#token;
    try {
      const t = await refresh(this.#refreshToken);
      this.#token = t.accessToken;
      this.#expiresAt = t.expiresAt;
      return this.#token;
    } catch (err) {
      // В режиме Testing refresh-токен живёт 7 дней. Отличать это от сетевого сбоя
      // важно: иначе база знаний однажды перестанет обновляться молча.
      throw new Error(
        'Accesul la Google Drive nu mai este valid — probabil a expirat autorizarea ' +
        `(în regim de testare Google o anulează după 7 zile). Reconectați Google Drive. ${(err as Error).message}`,
      );
    }
  }

  async #get(url: string): Promise<Response> {
    const res = await fetch(url, { headers: { authorization: `Bearer ${await this.#auth()}` } });
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  /** Обходит папку рекурсивно: директор по продажам почти наверняка заведёт подпапки. */
  async list(folderId: string, prefix = ''): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${API}/files`);
      url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
      url.searchParams.set('fields', 'nextPageToken, files(id,name,mimeType,modifiedTime,size)');
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const data = (await (await this.#get(url.toString())).json()) as {
        files: Omit<DriveFile, 'path'>[]; nextPageToken?: string;
      };
      for (const f of data.files) {
        if (f.mimeType === FOLDER) out.push(...(await this.list(f.id, `${prefix}${f.name}/`)));
        else out.push({ ...f, path: `${prefix}${f.name}` });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return out;
  }

  async download(file: DriveFile): Promise<{ bytes: Buffer; mime: string }> {
    const exportAs = EXPORT_AS[file.mimeType];
    const url = exportAs
      ? `${API}/files/${file.id}/export?mimeType=${encodeURIComponent(exportAs)}`
      : `${API}/files/${file.id}?alt=media`;
    const res = await this.#get(url);
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      mime: exportAs ?? file.mimeType,
    };
  }
}
