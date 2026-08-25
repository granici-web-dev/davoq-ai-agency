import { t, tf } from './i18n.js';
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string; code?: string; detail?: Record<string, string | number>;
    };
    throw new Error(errorText(body));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * Текст ошибки на языке клиента. Сервер присылает код и румынский текст;
 * известный код переводим, неизвестный показываем словами — это лучше,
 * чем пустое место или сам код на экране у директора по продажам.
 */
function errorText(body: { error?: string; code?: string; detail?: Record<string, string | number> }): string {
  if (body.code) {
    const key = `error.${body.code}`;
    const translated = body.detail ? tf(key, body.detail) : t(key);
    if (translated !== key) return translated;
  }
  return body.error ?? 'error';
}

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
  }
}

export const get = <T>(p: string): Promise<T> => api<T>(p);
export const post = <T>(p: string, body?: unknown): Promise<T> =>
  api<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const put = <T>(p: string, body: unknown): Promise<T> =>
  api<T>(p, { method: 'PUT', body: JSON.stringify(body) });
export const del = (p: string): Promise<void> => api<void>(p, { method: 'DELETE' });

/** Загрузка файла: FormData, поэтому content-type ставит браузер, а не мы. */
export async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/admin/api${path}`, { method: 'POST', body: form });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
