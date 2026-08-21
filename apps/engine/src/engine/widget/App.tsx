/** @jsxImportSource preact */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { pickLocale, STRINGS } from '../shared/i18n.js';
import { resolveTheme, toCssVars } from '../shared/theme.js';
import { fetchConfig, streamChat, submitLead, visitorId, type WidgetConfig } from './api.js';

type Msg = { role: 'user' | 'bot' | 'note'; text: string };
type Phase = 'idle' | 'streaming' | 'error' | 'offline';

export function App({ base, publicKey }: { base: string; publicKey: string }): preact.JSX.Element | null {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [prefersDark, setPrefersDark] = useState(false);

  const conversationId = useRef<string | undefined>(undefined);
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
    () => pickLocale(navigator.language, config?.localeDefault ?? 'en'),
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
          onMeta: (id) => (conversationId.current = id),
          onDelta: (text) =>
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last?.role === 'bot') next[next.length - 1] = { ...last, text: last.text + text };
              return next;
            }),
          onError: (kind) => {
            // Пустой пузырь бота убираем: оборванный ответ не должен выглядеть
            // как ответ, состоящий из пустоты.
            setMessages((m) => (m[m.length - 1]?.text === '' ? m.slice(0, -1) : m));
            setPhase(kind === 'quota' ? 'offline' : 'error');
          },
        },
        abort.current.signal,
      );

      setPhase((p) => (p === 'streaming' ? 'idle' : p));
    },
    [base, publicKey, locale],
  );

  if (!config || !theme) return null;

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
            {phase === 'error' && (
              <div class="msg note">
                {t.error}{' '}
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
  const [state, setState] = useState<'idle' | 'error' | 'sent'>('idle');

  if (state === 'sent') return <div class="lead"><span class="hint">{t.leadThanks}</span></div>;

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) {
      setState('error');
      return;
    }
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
      <button class="send" type="submit">{t.leadSubmit}</button>
    </form>
  );
}
