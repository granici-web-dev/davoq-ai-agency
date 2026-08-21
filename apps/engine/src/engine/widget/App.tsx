/** @jsxImportSource preact */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { pickLocale, STRINGS } from '../shared/i18n.js';
import { DEFAULT_THEME, resolveTheme, toCssVars } from '../shared/theme.js';
import { fetchConfig, streamChat, submitLead, visitorId, type WidgetConfig } from './api.js';

type Msg = { role: 'user' | 'bot' | 'note'; text: string };
type Phase = 'idle' | 'streaming' | 'error' | 'busy' | 'offline';

/**
 * Переписка в sessionStorage.
 *
 * Прежде диалог жил только в памяти вкладки: посетитель спрашивал про доставку,
 * переходил на карточку товара — и всё начиналось с чистого листа. В панели
 * у директора это выглядело как два разных обращения, а «Conversații · N»
 * считала просмотры страниц.
 *
 * sessionStorage, а не куки: разговор кончается вместе с вкладкой, согласия
 * на куки не требуется (§9). Приватный режим может запретить запись — тогда
 * работаем без непрерывности, но работаем.
 */
const MSG_LIMIT = 60;

function restoreMessages(publicKey: string): Msg[] {
  try {
    const raw = sessionStorage.getItem(`cw_log_${publicKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed.slice(-MSG_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberMessages(publicKey: string, messages: Msg[]): void {
  try {
    if (messages.length === 0) sessionStorage.removeItem(`cw_log_${publicKey}`);
    else sessionStorage.setItem(`cw_log_${publicKey}`, JSON.stringify(messages.slice(-MSG_LIMIT)));
  } catch { /* приватный режим */ }
}

export function App({ base, publicKey }: { base: string; publicKey: string }): preact.JSX.Element | null {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => restoreMessages(publicKey));
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [prefersDark, setPrefersDark] = useState(false);

  // Идентификатор разговора переживает переход по страницам сайта.
  //
  // Прежде он жил только в памяти вкладки: посетитель спрашивал про доставку,
  // переходил на карточку товара — и начинал разговор с чистого листа, а
  // в панели у директора это выглядело как два разных обращения. «Conversații · N»
  // считала просмотры страниц, а не разговоры.
  //
  // sessionStorage, а не localStorage и не куки: разговор кончается вместе
  // с вкладкой, согласия на куки не требуется (§9).
  const CONVO_KEY = `cw_convo_${publicKey}`;
  const conversationId = useRef<string | undefined>(
    (() => { try { return sessionStorage.getItem(CONVO_KEY) ?? undefined; } catch { return undefined; } })(),
  );
  const rememberConversation = (id: string): void => {
    conversationId.current = id;
    try { sessionStorage.setItem(CONVO_KEY, id); } catch { /* приватный режим */ }
  };

  /**
   * Номер попытки. Ответ приходит кусками и асинхронно, а посетитель может
   * начать заново, не дождавшись конца: без номера дельты прерванного ответа
   * дописывались в пузырь нового — посетитель не получал ответ вовсе,
   * хотя в панели директор его видел.
   */
  const generation = useRef(0);
  const lastQuestion = useRef('');
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    fetchConfig(base, publicKey).then(setConfig).catch(() => setPhase('offline'));
  }, [base, publicKey]);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const sync = (): void => setPrefersDark(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const locale = useMemo(
    () => pickLocale(navigator.language, config?.localeDefault ?? 'en', config?.supportedLocales),
    [config],
  );
  const t = STRINGS[locale];

  const theme = useMemo(
    () => (config ? resolveTheme(config.theme, prefersDark) : null),
    [config, prefersDark],
  );

  // Приветствие показывается один раз при первом открытии — до этого диалога нет.
  useEffect(() => {
    if (!open || !config || messages.length > 0) return;
    const welcome = config.welcomeMessage[locale] ?? config.welcomeMessage['en'];
    if (welcome) setMessages([{ role: 'bot', text: welcome }]);
  }, [open, config, locale, messages.length]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, phase]);

  // Переписка переживает переход по сайту вместе с идентификатором разговора.
  // Восстановить только идентификатор мало: бот помнил бы разговор, а посетитель
  // видел бы пустое окно и здоровался заново.
  useEffect(() => {
    if (phase === 'streaming') return;
    rememberMessages(publicKey, messages);
  }, [publicKey, messages, phase]);

  // Фокус-ловушка (§9): Tab не должен уводить в страницу под панелью, Esc закрывает.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, input, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = panelRef.current.getRootNode() as ShadowRoot;
      if (e.shiftKey && active.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panelRef.current?.addEventListener('keydown', onKey);
    const node = panelRef.current;
    return () => node?.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = useCallback(
    async (question: string) => {
      lastQuestion.current = question;
      setMessages((m) => [...m, { role: 'user', text: question }, { role: 'bot', text: '' }]);
      setPhase('streaming');

      abort.current?.abort();
      abort.current = new AbortController();
      const mine = ++generation.current;
      const current = (): boolean => generation.current === mine;

      await streamChat(
        base,
        {
          publicKey,
          visitorId: visitorId(),
          conversationId: conversationId.current,
          message: question,
          locale,
        },
        {
          onMeta: (id) => { if (current()) rememberConversation(id); },
          onDelta: (text) => {
            if (!current()) return;
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last?.role === 'bot') next[next.length - 1] = { ...last, text: last.text + text };
              return next;
            });
          },
          onError: (kind) => {
            if (!current()) return;
            // Пустой пузырь бота убираем: оборванный ответ не должен выглядеть
            // как ответ, состоящий из пустоты.
            setMessages((m) => (m[m.length - 1]?.text === '' ? m.slice(0, -1) : m));
            setPhase(kind === 'quota' ? 'offline' : kind === 'busy' ? 'busy' : 'error');
          },
        },
        abort.current.signal,
      );

      if (current()) setPhase((p) => (p === 'streaming' ? 'idle' : p));
    },
    [base, publicKey, locale],
  );

  // Конфигурация не дошла. Прежде здесь стоял `return null` — ни кнопки,
  // ни сообщения, ни строчки в консоли: клиент звонит «виджет пропал»,
  // а смотреть нечего. Показываем то, ради чего виджет вообще стоит на сайте:
  // способ оставить контакт.
  if (!config || !theme) {
    if (phase !== 'offline') return null;
    const fallback = STRINGS[pickLocale(navigator.language, 'en')];
    return (
      <div class="root" data-pos="bottom-right" style={toCssVars(resolveTheme(DEFAULT_THEME, prefersDark))}>
        {!open ? (
          <button ref={launcherRef} class="launcher" onClick={() => setOpen(true)}>
            {fallback.launcher}
          </button>
        ) : (
          <div class="panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={fallback.title}>
            <div class="header">
              <span class="name">{fallback.title}</span>
              <button class="iconbtn" aria-label={fallback.close} onClick={() => setOpen(false)}>×</button>
            </div>
            {/* Текст «недоступен» рисует сама форма — второй раз его тут не надо. */}
            <div class="log" />
            <LeadForm base={base} publicKey={publicKey} conversationId={conversationId.current} t={fallback} />
            <div class="disclosure">{fallback.disclosure}</div>
          </div>
        )}
      </div>
    );
  }

  const send = (e: Event): void => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || phase === 'streaming') return;
    setDraft('');
    void ask(text);
  };

  const disclosure = config.aiDisclosureText[locale] ?? t.disclosure;

  return (
    <div class="root" data-pos={config.position} style={toCssVars(theme)}>
      {!open && (
        <button ref={launcherRef} class="launcher" onClick={() => setOpen(true)}>
          {config.botName || t.launcher}
        </button>
      )}

      {open && (
        <div class="panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={t.title}>
          <div class="header">
            {config.avatarUrl && <img class="avatar" src={config.avatarUrl} alt="" />}
            <span class="name">{config.botName || t.title}</span>
            <button class="iconbtn" aria-label={t.close} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div class="log" ref={logRef} aria-live="polite" aria-atomic="false">
            {messages.map((m, i) => (
              <div key={i} class={`msg ${m.role}`}>
                {m.text}
              </div>
            ))}
            {phase === 'streaming' && messages[messages.length - 1]?.text === '' && (
              <div class="typing" aria-label={t.typing}>
                <i /><i /><i />
              </div>
            )}
            {(phase === 'error' || phase === 'busy') && (
              <div class="msg note">
                {phase === 'busy' ? t.busy : t.error}{' '}
                <button class="retry" onClick={() => void ask(lastQuestion.current)}>
                  {t.retry}
                </button>
              </div>
            )}
          </div>

          {phase === 'offline' ? (
            <LeadForm base={base} publicKey={publicKey} conversationId={conversationId.current} t={t} />
          ) : (
            <form class="form" onSubmit={send}>
              <input
                ref={inputRef}
                value={draft}
                placeholder={t.placeholder}
                aria-label={t.placeholder}
                onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              />
              <button class="send" type="submit" disabled={phase === 'streaming' || !draft.trim()}>
                {t.send}
              </button>
            </form>
          )}

          <div class="disclosure">{disclosure}</div>
        </div>
      )}
    </div>
  );
}

function LeadForm({
  base, publicKey, conversationId, t,
}: {
  base: string;
  publicKey: string;
  conversationId: string | undefined;
  t: (typeof STRINGS)['en'];
}): preact.JSX.Element {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'error' | 'sent'>('idle');

  if (state === 'sent') return <div class="lead"><span class="hint">{t.leadThanks}</span></div>;

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    // Второй клик по «Trimite», пока идёт первый, давал две заявки, два письма
    // и два контакта в метрике — то есть отдел продаж звонил человеку дважды.
    if (state === 'sending') return;
    if (!form.email.trim() && !form.phone.trim()) {
      setState('error');
      return;
    }
    setState('sending');
    const ok = await submitLead(base, { publicKey, conversationId, ...form });
    setState(ok ? 'sent' : 'error');
  };

  const field = (key: keyof typeof form, label: string, type = 'text'): preact.JSX.Element => (
    <input
      type={type}
      value={form[key]}
      placeholder={label}
      aria-label={label}
      onInput={(e) => setForm({ ...form, [key]: (e.target as HTMLInputElement).value })}
    />
  );

  return (
    <form class="lead" onSubmit={submit}>
      <span class="hint">{t.offline}</span>
      {field('name', t.leadName)}
      {field('email', t.leadEmail, 'email')}
      {field('phone', t.leadPhone, 'tel')}
      {state === 'error' && <span class="err">{t.leadNeedContact}</span>}
      <button class="send" type="submit" disabled={state === 'sending'}>{t.leadSubmit}</button>
    </form>
  );
}
