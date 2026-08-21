import type pg from 'pg';
import { decryptSecret } from './secrets.js';
import { assertPublicUrl, SsrfError } from './ssrf.js';

/** §8: жёсткие лимиты. Коннектор ходит в чужую сеть — он не должен уметь нас задержать. */
const TIMEOUT_MS = 5_000;
const RETRIES = 1;
const MAX_BYTES = 32 * 1024;
const MAX_REDIRECTS = 2;

export interface ConnectorTool {
  id: string;
  connectorId: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  httpMethod: string;
  pathTemplate: string;
  bodyTemplate: Record<string, unknown> | null;
  responseInstructions: string;
  baseUrl: string;
  headersTemplate: Record<string, string>;
  secret: Buffer | null;
}

export async function loadTools(
  client: pg.PoolClient,
  tenantId: string,
): Promise<ConnectorTool[]> {
  const { rows } = await client.query(
    `SELECT t.id, t.connector_id, t.tool_name, t.description, t.input_schema,
            t.http_method, t.path_template, t.body_template, t.response_instructions,
            c.base_url, c.headers_template, c.secret_encrypted
       FROM connector_tools t JOIN connectors c ON c.id = t.connector_id
      WHERE t.tenant_id = $1 AND t.enabled AND c.status = 'active'`,
    [tenantId],
  );

  return rows.map((r) => ({
    id: r.id,
    connectorId: r.connector_id,
    toolName: r.tool_name,
    description: r.description,
    inputSchema: r.input_schema,
    httpMethod: r.http_method,
    pathTemplate: r.path_template,
    bodyTemplate: r.body_template,
    responseInstructions: r.response_instructions,
    baseUrl: r.base_url,
    headersTemplate: r.headers_template,
    secret: r.secret_encrypted,
  }));
}

/**
 * Определение в том виде, в каком его увидит модель (§8). Схему пишет тенант в админке,
 * поэтому `type: 'object'` навязывается здесь: без него API отвергнет весь запрос,
 * и один криво заполненный инструмент положил бы чат целиком.
 */
export function toClaudeTool(tool: ConnectorTool): {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties?: Record<string, unknown> };
} {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> };
  return {
    name: tool.toolName,
    description: tool.description,
    input_schema: { ...schema, type: 'object' },
  };
}

/**
 * Подстановка значений в шаблон пути. Значения кодируются: без этого поле вида
 * `../../admin` в аргументе модели уводит запрос на другой эндпоинт того же хоста.
 */
function fillPath(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = input[name];
    if (value === undefined || value === null) {
      throw new Error(`Șablonul adresei nu are valoare pentru {${name}}`);
    }
    return encodeURIComponent(String(value));
  });
}

function fillBody(
  template: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const whole = /^\{(\w+)\}$/.exec(node);
      // Одиночный плейсхолдер подставляется значением как есть, чтобы числа
      // и булевы не превращались в строки.
      if (whole) return input[whole[1]!] ?? null;
      return node.replace(/\{(\w+)\}/g, (_, n: string) => String(input[n] ?? ''));
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return walk(template) as Record<string, unknown>;
}

function buildHeaders(tool: ConnectorTool): Record<string, string> {
  const secret = tool.secret ? decryptSecret(tool.secret) : '';
  const out: Record<string, string> = { accept: 'application/json' };
  for (const [name, value] of Object.entries(tool.headersTemplate)) {
    out[name.toLowerCase()] = value.replaceAll('{{secret}}', secret);
  }
  return out;
}

export interface CallResult {
  status: number | null;
  body: string;
  truncated: boolean;
  error?: string;
}

export async function callConnector(
  tool: ConnectorTool,
  input: Record<string, unknown>,
): Promise<CallResult> {
  let target: string;
  try {
    target = new URL(fillPath(tool.pathTemplate, input), tool.baseUrl).toString();
  } catch (err) {
    return { status: null, body: '', truncated: false, error: (err as Error).message };
  }

  const headers = buildHeaders(tool);
  const method = tool.httpMethod.toUpperCase();
  const body =
    tool.bodyTemplate && method !== 'GET' && method !== 'DELETE'
      ? JSON.stringify(fillBody(tool.bodyTemplate, input))
      : undefined;
  if (body) headers['content-type'] = 'application/json';

  let lastError = '';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await fetchGuarded(target, method, headers, body);
    } catch (err) {
      lastError = (err as Error).message;
      // Запрет по SSRF — не временная неполадка, повторять его бессмысленно.
      if (err instanceof SsrfError) break;
    }
  }
  return { status: null, body: '', truncated: false, error: lastError };
}

async function fetchGuarded(
  target: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<CallResult> {
  let url = target;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Проверка повторяется на каждом переходе: иначе публичный адрес,
    // отвечающий редиректом на 169.254.169.254, обходит всю защиту.
    await assertPublicUrl(url);

    const res = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { status: res.status, body: '', truncated: false };
      url = new URL(location, url).toString();
      continue;
    }

    return { status: res.status, ...(await readCapped(res)) };
  }

  throw new SsrfError('Prea multe redirecționări');
}

/**
 * Тело читается с потолком в 32 КБ. Content-Length доверять нельзя — сервер может
 * соврать или не прислать его вовсе, поэтому считаем фактически прочитанное
 * и обрываем поток, а не проверяем заголовок.
 */
async function readCapped(res: Response): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: '', truncated: false };

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (size + value.length > MAX_BYTES) {
      chunks.push(value.subarray(0, MAX_BYTES - size));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.length;
  }

  return { body: Buffer.concat(chunks).toString('utf8'), truncated };
}

/** Результат в том виде, в каком его увидит модель. */
export function formatResult(tool: ConnectorTool, result: CallResult): string {
  if (result.error) return `Tool unavailable: ${result.error}`;
  if (result.status !== null && result.status >= 400) {
    return `The service returned error ${result.status}. Tell the visitor the data is currently unavailable.`;
  }

  const parts = [result.body || '(empty response)'];
  if (result.truncated) parts.push('[response truncated at the 32 KB limit]');
  if (tool.responseInstructions.trim()) parts.push(tool.responseInstructions.trim());
  return parts.join('\n\n');
}
