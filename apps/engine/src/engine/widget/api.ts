import type { Theme } from '../shared/theme.js';

export interface WidgetConfig {
  botName: string;
  welcomeMessage: Record<string, string>;
  aiDisclosureText: Record<string, string>;
  position: 'bottom-right' | 'bottom-left';
  localeDefault: string;
  /** Языки, на которых клиент готов разговаривать. Пусто — только localeDefault. */
  supportedLocales?: string[];
  avatarUrl: string | null;
  theme: Theme;
}

export async function fetchConfig(base: string, key: string): Promise<WidgetConfig> {
  const res = await fetch(`${base}/v1/widget/config?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`config: ${res.status}`);
  return (await res.json()) as WidgetConfig;
}

export interface ChatHandlers {
  onMeta: (conversationId: string) => void;
  onDelta: (text: string) => void;
  onError: (kind: 'quota' | 'network') => void;
}

/**
 * SSE поверх POST. EventSource умеет только GET, а ключ и сообщение в query-строке
 * осели бы в логах прокси и в истории браузера — поэтому разбираем поток вручную.
 */
export async function streamChat(
  base: string,
  body: Record<string, unknown>,
  handlers: ChatHandlers,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    handlers.onError('network');
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError(res.status === 402 ? 'quota' : 'network');
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  // Событие может прийти разрезанным на границе чанка, поэтому копим хвост,
  // пока не увидим разделитель блоков.
  let buffer = '';

  // Чтение под защитой целиком.
  //
  // Обрыв соединения на середине ответа — обычное дело: вкладку усыпили, вайфай
  // моргнул, прокси закрыл долгий поток. Без этого перехвата исключение уходило
  // наверх мимо всей обработки: `phase` навсегда оставался `streaming`,
  // «Печатает…» крутилось, поле ввода было заблокировано, кнопки повтора не было.
  // Лечилось только перезагрузкой страницы, и посетитель до неё не доходил.
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;

      let split: number;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let event = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        let parsed: Record<string, string>;
        try {
          parsed = JSON.parse(data) as Record<string, string>;
        } catch {
          // Битый блок — не повод обрывать весь ответ: остальные придут целыми.
          continue;
        }
        if (event === 'meta' && parsed.conversationId) handlers.onMeta(parsed.conversationId);
        else if (event === 'delta' && parsed.t !== undefined) handlers.onDelta(parsed.t);
        else if (event === 'error') handlers.onError('network');
      }
    }
  } catch {
    // Отмена посетителем — не ошибка: он сам ушёл или начал заново.
    if (!signal.aborted) handlers.onError('network');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function submitLead(
  base: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${base}/v1/lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Идентификатор посетителя в localStorage, без кук (§9): непрерывность диалога есть,
 * а согласия на куки не требуется. Приватный режим может запретить запись —
 * тогда работаем без непрерывности, но работаем.
 */
export function visitorId(): string {
  const KEY = 'cw_visitor_id';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
