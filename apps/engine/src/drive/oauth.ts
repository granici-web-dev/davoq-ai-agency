import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';

/**
 * OAuth для Google Drive — вместо сервисного аккаунта.
 *
 * Ключи сервисных аккаунтов заблокированы политикой организации (Secure by Default),
 * и это к лучшему: в продукте каждый тенант подключает СВОЙ диск, а просить клиента
 * добавить нашего робота в свою папку — нерабочая схема. Здесь тот же поток,
 * который потом станет кнопкой «Подключить Google» в админке, только запускаемый
 * локально: браузер, одно согласие, refresh-токен на длительное хранение.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ClientSecrets {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

export interface DriveTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

/**
 * Учётные данные берутся из окружения, а файл — запасной путь. Переменные удобнее:
 * в проде их подставит хранилище секретов, и лишний файл на диске не нужен.
 */
export async function loadClient(
  path = 'secrets/google-oauth-client.json',
): Promise<{ id: string; secret: string }> {
  const id = process.env.GOOGLE_CLIENT_ID ?? process.env.CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.CLIENT_SECRET;
  if (id && secret) return { id, secret };

  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as ClientSecrets;
    const c = raw.installed ?? raw.web;
    if (c) return { id: c.client_id, secret: c.client_secret };
    throw new Error('нет ключа installed или web');
  } catch (err) {
    throw new Error(
      'OAuth-клиент не найден: задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env ' +
      `или положите ${path} (${(err as Error).message})`,
    );
  }
}

/**
 * Разовая авторизация. PKCE обязателен даже для desktop-клиента: код возврата
 * летит через localhost, и без верификатора перехваченный код можно обменять
 * на токен со стороны.
 */
export async function authorize(port = 8765): Promise<DriveTokens> {
  const client = await loadClient();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
  const redirect = `http://localhost:${port}/callback`;

  const url =
    `${AUTH_URL}?client_id=${encodeURIComponent(client.id)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}&code_challenge=${challenge}` +
    `&code_challenge_method=S256&state=${state}` +
    // Без обоих параметров Google не выдаёт refresh-токен на повторных согласиях,
    // и подключение отваливается через час без внятной причины.
    `&access_type=offline&prompt=consent`;

  console.log('\nОткройте в браузере и подтвердите доступ:\n\n' + url + '\n');
  // Открываем сами: ссылка длинная, а при повторном запуске в переписке остаётся
  // предыдущая — с другим state. Переход по устаревшей ссылке даёт отказ,
  // который выглядит как поломка, хотя это защита от подмены кода.
  if (process.platform === 'darwin') {
    const { spawn } = await import('node:child_process');
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  }

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const q = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (q.pathname !== '/callback') return void res.writeHead(404).end();

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      const err = q.searchParams.get('error');
      const got = q.searchParams.get('code');

      if (err || q.searchParams.get('state') !== state || !got) {
        const why = err
          ? `Google вернул ошибку: ${err}`
          : !got
            ? 'Google не прислал код авторизации'
            : 'Не совпал state — вероятно, открыта ссылка от предыдущего запуска. ' +
              'Запустите авторизацию заново и переходите только по свежей ссылке.';
        res.end(`<h3>Не получилось</h3><p>${why}</p>`);
        server.close();
        return void reject(new Error(why));
      }
      res.end('<h3>Готово. Можно закрыть вкладку.</h3>');
      server.close();
      resolve(got);
    });
    server.listen(port);
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: client.id, client_secret: client.secret,
      redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`обмен кода не удался: ${res.status} ${await res.text()}`);

  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  if (!t.refresh_token) {
    throw new Error('Google не вернул refresh_token — отзовите доступ в аккаунте и повторите');
  }
  return {
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}

/** Access-токен живёт час; обновляем по refresh-токену, который храним зашифрованным. */
export async function refresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const client = await loadClient();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: client.id,
      client_secret: client.secret, grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`обновление токена не удалось: ${res.status}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
}
