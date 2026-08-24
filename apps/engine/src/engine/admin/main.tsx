import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { STRINGS, type Locale } from '../shared/i18n.js';
import { planFor } from '../plans.js';
import type { Screen } from '../shared/screens.js';
import { auditTheme, type ContrastWarning, type Preset, type Theme } from '../shared/theme.js';
import { del, get, post, put, upload, UnauthorizedError } from './api.js';
import { previewSrcDoc } from './preview.js';
import { setPanelLocale, t, tf } from './i18n.js';



/**
 * Названия разделов вычисляются на каждой отрисовке, а не один раз при импорте.
 * Константа с t() на уровне модуля вычислилась бы до того, как язык вообще
 * известен — панель мигала бы румынским меню у русского клиента.
 */
const allScreens = (): Array<[Screen, string]> => [
  ['kb', t('Bază de cunoștințe')],
  ['drive', t('Google Drive')],
  ['aspect', t('Aspect')],
  ['connectors', t('Conectori')],
  ['chats', t('Conversații')],
  ['analytics', t('Analize')],
  ['install', t('Instalare')],
  ['subscription', t('Abonament')],
];

/**
 * Какие экраны видит клиент — свойство клиента, а не сборки. Пилотному
 * скрыли базу знаний и коннекторы: единственный источник материалов у него —
 * папка на Google Drive, и два лишних экрана только заставляли бы директора
 * выбирать, куда класть файл. Другому клиенту с CRM коннекторы нужны.
 *
 * Скрыты, а не удалены: экраны рабочие, эндпоинты на месте.
 */
const visibleScreens = (hidden: string[]): Array<[Screen, string]> =>
  allScreens().filter(([id]) => !hidden.includes(id));

/**
 * Ссылка из письма о заявке: `#chats/<id>` открывает панель сразу на нужном
 * разговоре. Без этого письмо — тупик: прочитал и всё равно иди ищи руками
 * среди сотни переписок.
 *
 * Адрес читается один раз при загрузке и сразу стирается: иначе кнопка
 * «Înapoi la listă» возвращала бы обратно в тот же разговор.
 */
function takeDeepLink(): { screen: Screen; conversationId: string } | null {
  const id = /^#chats\/([\w-]{8,})$/.exec(location.hash)?.[1];
  if (!id) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return { screen: 'chats', conversationId: id };
}

const DEEP_LINK = typeof location === 'undefined' ? null : takeDeepLink();

/**
 * Даты в формате клиента, а не всегда румынском.
 *
 * Язык панели ставится после загрузки /me, поэтому здесь не константа,
 * а чтение при каждом вызове: `05.03.2026` и `3/5/2026` — это разные даты
 * для того, кто читает, и ошибиться тут стоит дороже, чем перевести подпись.
 */
let panelLocaleTag = 'ro-RO';
export const setDateLocale = (locale: string): void => {
  panelLocaleTag = { ro: 'ro-RO', ru: 'ru-RU', de: 'de-DE', en: 'en-GB' }[locale] ?? 'ro-RO';
};
const dt = (v: string): string => new Date(v).toLocaleString(panelLocaleTag);
const d = (v: string): string => new Date(v).toLocaleDateString(panelLocaleTag);

/**
 * Иконки. Свои, а не из библиотеки: Lucide и Feather — первый выбор
 * по умолчанию, и интерфейс с ними узнаётся как собранный из деталей.
 * Один штрих 1.5, одна сетка 20×20, скруглённые концы — набор должен
 * читаться как один почерк, а не как подборка.
 */
const PATHS: Record<string, React.ReactNode> = {
  drive: <><path d="M3 7.5 6.2 4h7.6L17 7.5" /><path d="M3 7.5h14v7.2a1.3 1.3 0 0 1-1.3 1.3H4.3A1.3 1.3 0 0 1 3 14.7Z" /><path d="M7.5 11h5" /></>,
  kb: <><path d="M4 4.6A1.6 1.6 0 0 1 5.6 3H16v14H5.6A1.6 1.6 0 0 1 4 15.4Z" /><path d="M7 7h6M7 10h6" /></>,
  aspect: <><circle cx="10" cy="10" r="7" /><circle cx="7.4" cy="8.2" r="1" /><circle cx="12.6" cy="8.2" r="1" /><path d="M10 17c1.5 0 2-1 1.4-1.9-.5-.8.1-1.6 1-1.6H14" /></>,
  connectors: <><path d="M7 3v4M13 3v4" /><path d="M5 7h10v3a5 5 0 0 1-10 0Z" /><path d="M10 15v2.5" /></>,
  chats: <><path d="M4 5.6A1.6 1.6 0 0 1 5.6 4h8.8A1.6 1.6 0 0 1 16 5.6v5.8a1.6 1.6 0 0 1-1.6 1.6H8l-4 3.4Z" /></>,
  analytics: <><path d="M3.5 16.5h13" /><path d="M6 13V9M10 16V5M14 16v-6" /></>,
  install: <><path d="M7.5 6.5 4 10l3.5 3.5" /><path d="M12.5 6.5 16 10l-3.5 3.5" /></>,
  // Счёт с оторванным краем. Не карта и не корона: карта при двадцати
  // пикселях неотличима от папки Drive — обе читаются как горизонтальный
  // прямоугольник с линией, и в боковой панели их приходилось различать
  // по подписи. Проверено на экране, а не в голове.
  //
  // Оторванный край — единственная неровная линия во всём наборе, поэтому
  // узнаётся раньше, чем прочитывается форма.
  subscription: <><path d="M5.5 4.6A1.6 1.6 0 0 1 7.1 3h5.8a1.6 1.6 0 0 1 1.6 1.6V17l-2.2-1.6L10 17l-2.3-1.6L5.5 17Z" /><path d="M8 7h4M8 10h4" /></>,
  search: <><circle cx="9" cy="9" r="5.2" /><path d="m13 13 3.5 3.5" /></>,
  logout: <><path d="M8 3.5H5.3A1.3 1.3 0 0 0 4 4.8v10.4a1.3 1.3 0 0 0 1.3 1.3H8" /><path d="M12 13.5 15.5 10 12 6.5" /><path d="M15.5 10h-8" /></>,
};

function Icon({ name }: { name: string }): React.ReactElement | null {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg className="icon" viewBox="0 0 20 20" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

function Spinner(): React.ReactElement {
  return <span className="spinner" role="status" aria-label={t('Se încarcă')} />;
}

function Loading(): React.ReactElement {
  return <div className="sheet row"><Spinner /><span className="note">{t('Se încarcă…')}</span></div>;
}

/**
 * Экран не загрузился.
 *
 * Прежде этого экрана не существовало: ни один загрузчик не имел `catch`,
 * поэтому любая ошибка запроса — упавший сервер, обрыв сети, протухшая
 * сессия — оставляла «Se încarcă…» навсегда. Директор по продажам смотрел
 * на крутилку и звонил нам.
 */
function Failed({ error, onRetry }: { error: string; onRetry: () => void }): React.ReactElement {
  return (
    <div className="sheet stack">
      <p className="err">{error}</p>
      <div className="row">
        <button onClick={onRetry}>{t('Încearcă din nou')}</button>
      </div>
    </div>
  );
}

/**
 * Загрузка данных экрана: данные, ошибка, повтор.
 *
 * Протухшая сессия обрабатывается отдельно: раньше она не возвращала к форме
 * входа, а просто оставляла экран пустым — человек считал, что панель сломана,
 * хотя ему было достаточно войти заново.
 */
function useResource<T>(load: () => Promise<T>, deps: unknown[]): {
  data: T | null; error: string | null; reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    load().then(
      (value) => { if (alive) setData(value); },
      (err: Error) => {
        if (err instanceof UnauthorizedError) { location.reload(); return; }
        if (alive) setError(err.message || t('Ceva nu a funcționat.'));
      },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { data, error, reload: () => setAttempt((n) => n + 1) };
}

function App(): React.ReactElement {
  const [me, setMe] = useState<{
    email: string;
    tenant: {
      name: string; plan: string; logo_url: string | null;
      hiddenScreens: string[]; locale: string; locales: string[];
    };
  } | null>(null);
  const [screen, setScreen] = useState<Screen | null>(DEEP_LINK?.screen ?? null);
  // Ссылка из письма срабатывает ОДИН раз. Прежде она читалась при каждом
  // монтировании экрана переписок: нажал «Înapoi la listă» — и тебя тут же
  // возвращало в тот же разговор, список был недостижим до перезагрузки.
  const [deepLink, setDeepLink] = useState(DEEP_LINK?.conversationId ?? null);
  // Поиск из верхней строки — не украшение: он уводит в переписки
  // с уже применённым фильтром по тексту, то есть делает то, что обещает.
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    get<typeof me>('/me')
      .then((data) => {
        // Язык ставится до первой отрисовки экранов: иначе панель успевает
        // мигнуть румынским у клиента, который его не знает.
        if (data) { setPanelLocale(data.tenant.locale); setDateLocale(data.tenant.locale); }
        setMe(data);
      })
      .catch(() => setMe(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="shell"><Loading /></div>;
  if (!me) return <Login />;

  // Первый видимый экран становится стартовым только после загрузки /me:
  // до неё неизвестно, какие экраны у этого клиента вообще есть.
  const screens = visibleScreens(me.tenant.hiddenScreens ?? []);
  // Пустой список экранов — не «такого не бывает», а «кто-то перечислил в
  // hidden_screens всё». Прежде здесь стоял `screens[0]!`, и панель падала
  // в белый лист без единого слова о причине.
  if (screens.length === 0) {
    return (
      <div className="shell">
        <div className="sheet">
          {t('Toate ecranele sunt ascunse pentru acest cont. Contactați administratorul.')}
        </div>
      </div>
    );
  }
  const current = screen && screens.some(([id]) => id === screen) ? screen : screens[0]![0];

  return (
    <div className="shell">
      <aside className="side">
        <div className="mark">
          {me.tenant.logo_url ? (
            // Марка уже произносит имя — дублировать его текстом незачем.
            <span className="brand" role="img" aria-label={me.tenant.name}
                  style={{ '--logo': `url(${me.tenant.logo_url})` } as React.CSSProperties} />
          ) : (
            <>
              <span className="carrier" aria-hidden="true">AW</span>
              <b>{me.tenant.name}</b>
            </>
          )}
        </div>
        <p className="plan">{planFor(me.tenant.plan).name}</p>

        <nav className="coupons" aria-label={t('Secțiuni')}>
          {screens.map(([id, label]) => (
            <button key={id} className="coupon" onClick={() => setScreen(id)}
                    {...(current === id ? { 'aria-current': 'page' as const } : {})}>
              <Icon name={id} />
              {label}
            </button>
          ))}
        </nav>

        <div className="foot">
          <ThemeSwitch />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{screens.find(([id]) => id === current)?.[1]}</h1>
          <form className="seek" onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get('q');
            setQuery(typeof q === 'string' ? q.trim() : '');
            setScreen('chats');
          }}>
            <Icon name="search" />
            <input name="q" type="search" placeholder={t('Caută în conversații')}
                   aria-label={t('Caută în conversații')} />
          </form>
          <div className="who">
            <span>{me.email}</span>
            <button className="icon-btn" title={t('Ieșire')} aria-label={t('Ieșire')}
                    onClick={() => post('/logout').then(() => location.reload())}>
              <Icon name="logout" />
            </button>
          </div>
        </header>
      {current === 'kb' && <Knowledge />}
      {current === 'drive' && <Drive />}
      {current === 'aspect' && <Aspect />}
      {current === 'connectors' && <Connectors />}
      {current === 'chats' && (
        <Chats key={query} locales={me.tenant.locales} initialQuery={query}
               {...(deepLink ? { initialOpen: deepLink } : {})}
               onOpened={() => setDeepLink(null)} />
      )}
      {current === 'analytics' && <Analytics />}
      {current === 'install' && <Install />}
      {current === 'subscription' && <Subscription />}
      </div>
    </div>
  );
}

/**
 * Переключатель темы.
 *
 * Три состояния, а не два. «Как в системе» — тоже выбор, и он же по умолчанию:
 * бинарная пара пришлось бы врать о том, что происходит, пока человек ничего
 * не выбрал. Выбор запоминается в браузере, а не в базе: это свойство рабочего
 * места, а не учётной записи, и у одного директора рабочий стол может стоять
 * у окна, а ноутбук — дома вечером.
 */
type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = 'aw-theme';

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

function ThemeSwitch(): React.ReactElement {
  const [choice, setChoice] = useState<ThemeChoice>(
    () => (localStorage.getItem(THEME_KEY) as ThemeChoice | null) ?? 'system',
  );

  useEffect(() => {
    applyTheme(choice);
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  }, [choice]);

  const options: Array<[ThemeChoice, string]> = [
    ['system', t('Sistem')],
    ['light', t('Deschis')],
    ['dark', t('Întunecat')],
  ];

  return (
    <div className="theme-switch" role="group" aria-label={t('Tema panoului')}>
      {options.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={choice === id} onClick={() => setChoice(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Login(): React.ReactElement {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/login', form);
      location.reload();
    } catch (err) {
      setError(err instanceof UnauthorizedError
        ? t('Email sau parolă greșită.')
        : `Nu am putut verifica datele: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="shell" style={{ maxWidth: 380 }}>
      <header className="wallet-head" style={{ marginBottom: 26 }}>
        <div className="mark"><span className="carrier" aria-hidden="true">AW</span><b>AssistWidget</b></div>
      </header>
      <form className="sheet stack" onSubmit={submit}>
        <h2>{t('Autentificare')}</h2>
        <label className="field">{t('Email')}
          <input type="email" value={form.email} autoComplete="username" required
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">{t('Parolă')}
          <input type="password" value={form.password} autoComplete="current-password" required
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="note err">{error}</p>}
        <button className="go" disabled={busy}>{busy ? t('Se verifică…') : t('Intră în cont')}</button>
      </form>
    </div>
  );
}

// ── Bază de cunoștințe ────────────────────────────────────────────────────────

interface Doc {
  id: string; filename: string; source_url: string | null;
  status: string; error_text: string | null; chunk_count: number; uploaded_at: string;
}

/** Тоже функцией, и по той же причине, что и названия разделов. */
const statusLabels = (): Record<string, [string, string]> => ({
  indexed: ['ok', t('Indexat')],
  processing: ['wait', t('Se procesează')],
  uploaded: ['wait', t('În așteptare')],
  failed: ['void', t('Eșuat')],
});

function Stamp({ status }: { status: string }): React.ReactElement {
  const [cls, label] = statusLabels()[status] ?? ['wait', status];
  return <span className={`stamp ${cls}`}>{label}</span>;
}

function Knowledge(): React.ReactElement {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Первый заход под защитой: без него упавший запрос оставлял экран
  // в «Se încarcă…» навсегда, а протухшая сессия не возвращала к форме входа.
  const load = useCallback(
    () => get<Doc[]>('/documents').then(setDocs).catch((err: Error) => {
      if (err instanceof UnauthorizedError) { location.reload(); return; }
      setError(err.message);
      setDocs([]);
    }), []);
  useEffect(() => void load(), [load]);

  // Procesarea are loc în fundal — reîmprospătăm doar cât timp ceva chiar lucrează.
  const pending = (docs ?? []).some((x) => x.status === 'uploaded' || x.status === 'processing');
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [pending, load]);

  const guard = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const site = (docs ?? []).filter((x) => !x.filename.startsWith('drive:'));

  return (
    <>
      <section className="sheet stack">
        <h2>{t('Adaugă materiale')}</h2>
        <div className="row">
          <input className="grow" placeholder="https://exemplu.ro/produse" value={url}
                 onChange={(e) => setUrl(e.target.value)} aria-label={t('Adresa paginii')} />
          <button className="go" disabled={busy || !url.trim()}
                  onClick={() => void guard(async () => { await post('/documents', { url }); setUrl(''); })}>
            {t('Adaugă pagina')}
          </button>
        </div>

        <div onDragOver={(e) => e.preventDefault()}
             onDrop={(e) => { e.preventDefault();
               const f = e.dataTransfer.files[0]; if (f) void guard(() => upload('/documents/upload', f)); }}
             style={{ border: '1px dashed var(--input)', borderRadius: 'calc(var(--radius) - 2px)',
                      padding: 20, textAlign: 'center', background: 'var(--muted)' }}>
          <p className="note" style={{ marginBottom: 8 }}>
            {t('Trage aici un fișier .docx, .odt, .pdf, .md sau .html')}
          </p>
          <input type="file" accept=".docx,.odt,.pdf,.md,.txt,.html" style={{ width: 'auto' }}
                 aria-label={t('Alege fișier')}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void guard(() => upload('/documents/upload', f)); }} />
        </div>

        {busy && <p className="note row"><Spinner /> Se trimite…</p>}
        {error && <p className="note err">{error}</p>}
      </section>

      <section className="sheet">
        <h2>{t('Materiale indexate')}</h2>
        {!docs ? <Loading /> : (
          <div className="ledger-wrap">
            <table>
              <thead><tr><th>{t('Sursă')}</th><th>{t('Stare')}</th><th>{t('Fragmente')}</th><th /></tr></thead>
              <tbody>
                {site.length === 0 && (
                  <tr><td colSpan={4}>
                    <p className="note">{t('Încă nimic. Adaugă prima pagină de pe site — botul va putea răspunde din ea în câteva secunde.')}</p>
                  </td></tr>
                )}
                {site.map((x) => (
                  <tr key={x.id}>
                    <td>{x.filename}{x.error_text && <p className="note err">{x.error_text}</p>}</td>
                    <td><Stamp status={x.status} /></td>
                    <td className="num">{x.chunk_count}</td>
                    <td>
                      <div className="row">
                        {x.status === 'failed' && (
                          <button onClick={() => void guard(() => post(`/documents/${x.id}/retry`))}>
                            {t('Reîncearcă')}
                          </button>
                        )}
                        <button onClick={() => void guard(() => del(`/documents/${x.id}`))}>{t('Șterge')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ── Google Drive ──────────────────────────────────────────────────────────────

interface DriveState {
  connected: boolean; folderId?: string | null; lastSyncAt?: string | null;
  everyMinutes?: number; closedRecently?: number; reopenedRecently?: number;
  lastResult?: { added: number; updated: number; removed: number; unchanged: number; errors: string[] } | null;
}

function Drive(): React.ReactElement {
  const [state, setState] = useState<DriveState | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sitePages, setSitePages] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [stalled, setStalled] = useState(false);

  const load = useCallback(async (): Promise<DriveState> => {
    const [drive, all] = await Promise.all([get<DriveState>('/drive'), get<Doc[]>('/documents')]);
    setState(drive);
    setDocs(all.filter((x) => x.filename.startsWith('drive:')));
    setSitePages(all.filter((x) => !x.filename.startsWith('drive:')).length);
    return drive;
  }, []);
  useEffect(() => void load(), [load]);

  // Индексация идёт в фоне. Пока хоть один файл в работе, список обновляется сам:
  // директор нажал кнопку и видит, чем кончилось, а не гадает, дочитался ли файл.
  const pending = docs.some((x) => x.status === 'uploaded' || x.status === 'processing');
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [pending, load]);

  // Сверка ставится в очередь, а не выполняется в ответе. Поэтому ждём не
  // фиксированные секунды, а признак того, что она прошла: иначе «готово»
  // соврёт при остановленном обработчике — самая частая поломка на пилоте.
  const sync = async (): Promise<void> => {
    const before = state?.lastSyncAt ?? null;
    setSyncing(true);
    setStalled(false);
    try {
      await post('/drive/sync');
      for (let i = 0; i < 45; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await load();
        if ((fresh.lastSyncAt ?? null) !== before) return;
      }
      setStalled(true);
    } finally {
      setSyncing(false);
    }
  };

  if (!state) return <Loading />;
  if (!state.connected) {
    return (
      <section className="sheet stack">
        <h2>{t('Google Drive')}</h2>
        <p className="note">
          {t('Dosarul nu este conectat. Conectarea se face o singură dată și cere confirmare în browser — cere-i acest lucru persoanei care a configurat sistemul.')}
        </p>
      </section>
    );
  }

  const r = state.lastResult;
  const failed = docs.filter((x) => x.status === 'failed').length;

  return (
    <>
      <section className="sheet stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2>{t('Dosarul cu materiale')}</h2>
            {/* Числа подставляются в перевод, а не приклеиваются к его кускам:
                собранная из фрагментов фраза в другом языке не собирается. */}
            <p className="note">
              {tf('Ultima verificare: {when} · verificăm și singuri la fiecare {every} minute', {
                when: state.lastSyncAt ? dt(state.lastSyncAt) : t('încă niciuna'),
                every: state.everyMinutes ?? '—',
              })}
            </p>
            {r && (
              <p className="note">
                {tf('adăugate {added} · actualizate {updated} · șterse {removed} · neschimbate {same}', {
                  added: r.added, updated: r.updated, removed: r.removed, same: r.unchanged,
                })}
                {r.errors.length > 0 && (
                  <span className="err">{tf(' · erori {n}', { n: r.errors.length })}</span>
                )}
              </p>
            )}
          </div>
          <button className="go" disabled={syncing} onClick={() => void sync()}>
            {syncing ? <><Spinner /> {t('Se sincronizează…')}</> : t('Sincronizează acum')}
          </button>
        </div>

        {stalled && (
          <p className="note err">
            {t('Sincronizarea nu s-a încheiat în 90 de secunde. Serviciul care citește dosarul pare oprit — anunțați persoana care a configurat sistemul.')}
          </p>
        )}
        {r?.errors.map((e, i) => <p key={i} className="note err">{e}</p>)}

        <p className="note">
          {t('Puneți un fișier în dosar și apăsați')} <b>{t('Sincronizează acum')}</b> {t('— apare mai jos. Scoateți-l din dosar și botul nu îl mai folosește: așa retrageți materialele depășite.')}
        </p>
        {sitePages > 0 && (
          // Иначе директор решит, что бот знает только эти файлы, и начнёт
          // перезаливать в папку то, что уже есть на сайте.
          <p className="note">
            {t('Pe lângă fișierele din dosar, botul citește și cele')} {sitePages} {t('pagini preluate de pe site-ul dumneavoastră.')}
          </p>
        )}
        {(state.closedRecently ?? 0) > 0 && (
          // Ради этой строки всё и делалось: положил файл — увидел, что починил.
          <p className="note ok">
            {t('După materialele adăugate,')} {state.closedRecently} {t('întrebări la care botul nu știa să răspundă s-au închis. Le vedeți în')} <b>{t('Analize')}</b>.
          </p>
        )}
        {(state.reopenedRecently ?? 0) > 0 && (
          // Обратная сторона: удаление файла должно быть видимым, иначе оно
          // выглядит бесплатным, а список пробелов молча отрастает обратно.
          <p className="note warn">
            {state.reopenedRecently} {t('întrebări au revenit în listă: materialul din care botul răspundea la ele nu mai este în dosar.')}
          </p>
        )}
      </section>

      <section className="sheet">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('Fișiere din dosar')}</h2>
          {failed > 0 && <span className="stamp void">{failed} necitit(e)</span>}
        </div>
        <div className="ledger-wrap">
          <table>
            <thead><tr><th>{t('Fișier')}</th><th>{t('Stare')}</th><th>{t('Fragmente')}</th></tr></thead>
            <tbody>
              {docs.length === 0 && (
                <tr><td colSpan={3}>
                  <p className="note">
                    {t('Dosarul este gol. Puneți în el prețuri, condiții de livrare, garanție — orice răspundeți zilnic la telefon.')}
                  </p>
                </td></tr>
              )}
              {docs.map((x) => (
                <tr key={x.id}>
                  <td>{x.filename.replace(/^drive:/, '')}
                    {x.error_text && <p className="note err">{x.error_text}</p>}</td>
                  <td><Stamp status={x.status} /></td>
                  <td className="num">{x.chunk_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ── Aspect ────────────────────────────────────────────────────────────────────

interface AspectData {
  botName: string; avatarUrl: string | null; position: string;
  theme: Theme; welcomeMessage: Record<string, string>;
  aiDisclosureText: Record<string, string>;
  warnings: ContrastWarning[]; presets: Preset[];
  /** Языки клиента: заполнять тексты имеет смысл только на них. */
  locales: string[];
}

/**
 * Функция, а не константа. Константа вычислялась при импорте — до того, как
 * панель узнавала язык клиента, — и подписи цветов навсегда оставались
 * румынскими, хотя переводы есть. Та же ошибка, от которой уже защищены
 * `allScreens` и `statusLabels`.
 */
const colorFields = (): Array<[keyof Theme, string]> => [
  ['primary', t('Culoare principală')],
  ['bg', t('Fundalul panoului')],
  ['text', t('Textul')],
  ['userBubble', t('Replica vizitatorului')],
  ['botBubble', t('Răspunsul botului')],
];

function Aspect(): React.ReactElement {
  // Язык вкладки текстов — первый язык КЛИЕНТА, а не зашитый румынский.
  // Прежде тексты немецкого клиента сохранялись в ключ `ro`: панель показывала
  // «Salvat» и верный предпросмотр, а виджет открывался без приветствия.
  const [locale, setLocale] = useState<Locale | null>(null);
  const [saved, setSaved] = useState(false);
  // Ошибка сохранения обязана быть видна. Прежде отказ сервера не оставлял
  // ни штампа, ни сообщения: человек уходил с экрана уверенный, что сохранил.
  const [saveError, setSaveError] = useState('');

  const { data: loaded, error, reload } = useResource(() => get<AspectData>('/appearance'), []);
  const [edited, setEdited] = useState<AspectData | null>(null);
  const data = edited ?? loaded;
  if (error) return <Failed error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const known = (data.locales as Locale[]).filter((l) => l in STRINGS);
  const active: Locale = locale && known.includes(locale) ? locale : (known[0] ?? 'en');

  const patch = (next: Partial<AspectData>): void => { setEdited({ ...data, ...next }); setSaved(false); };
  const warnings = auditTheme(data.theme);

  const srcDoc = previewSrcDoc({
    theme: data.theme, botName: data.botName,
    welcome: data.welcomeMessage[active] || STRINGS[active].title,
    disclosure: data.aiDisclosureText[active] || STRINGS[active].disclosure,
    placeholder: STRINGS[active].placeholder, send: STRINGS[active].send,
  });

  return (
    <div className="split">
      <div>
        <section className="sheet stack">
          <h2>{t('Teme gata făcute')}</h2>
          <div className="swatches">
            {data.presets.map((p) => (
              <button key={p.id} onClick={() => patch({ theme: p.theme })}>
                <span className="swatch">
                  <span className="dot" style={{ background: p.theme.primary }} />
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="sheet stack">
          <h2>{t('Culori')}</h2>
          {colorFields().map(([key, label]) => (
            <div key={key} className="row" style={{ justifyContent: 'space-between' }}>
              <label className="field" htmlFor={`c-${key}`}>
                {label}
              </label>
              <input id={`c-${key}`} type="color" style={{ width: 62 }}
                     value={String(data.theme[key])}
                     onChange={(e) => patch({ theme: { ...data.theme, [key]: e.target.value } })} />
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="field" htmlFor="dark">
              {t('Tema întunecată')}
            </label>
            <select id="dark" style={{ width: 190 }} value={data.theme.darkMode}
                    onChange={(e) => patch({ theme: { ...data.theme, darkMode: e.target.value as Theme['darkMode'] } })}>
              <option value="auto">{t('după setarea vizitatorului')}</option>
              <option value="light">{t('mereu deschisă')}</option>
              <option value="dark">{t('mereu întunecată')}</option>
            </select>
          </div>
          {warnings.length > 0 && (
            <div className="stack" style={{ gap: 3 }}>
              {warnings.map((w) => <p key={w.field} className="note warn">{w.message}</p>)}
              <p className="note">
                {t('Culoarea textului de pe buton și din replici se alege automat, așa că widgetul nu devine ilizibil — dar avertismentele merită rezolvate.')}
              </p>
            </div>
          )}
        </section>

        <section className="sheet stack">
          <h2>{t('Texte')}</h2>
          <div className="row">
            <span className="note">{t('Limba:')}</span>
            {known.map((l) => (
              <button key={l} className={active === l ? 'go' : ''} onClick={() => setLocale(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="field">Numele botului
            <input value={data.botName} onChange={(e) => patch({ botName: e.target.value })} />
          </label>
          <label className="field">{t('Mesajul de întâmpinare')}
            <input value={data.welcomeMessage[active] ?? ''}
                   onChange={(e) => patch({ welcomeMessage: { ...data.welcomeMessage, [active]: e.target.value } })} />
          </label>
          <label className="field">{t('Textul despre inteligența artificială')}
            <input placeholder={STRINGS[active].disclosure} value={data.aiDisclosureText[active] ?? ''}
                   onChange={(e) => patch({ aiDisclosureText: { ...data.aiDisclosureText, [active]: e.target.value } })} />
          </label>
          <p className="note">
            {t('Mențiunea că vizitatorul discută cu o inteligență artificială este obligatorie prin lege (AI Act, art. 50) și nu poate fi dezactivată. Poți schimba formularea; câmpul gol readuce textul implicit.')}
          </p>
        </section>

        <div className="row">
          <button className="go" onClick={() => {
            setSaveError('');
            void put('/appearance', {
              botName: data.botName, avatarUrl: data.avatarUrl, position: data.position,
              theme: data.theme, welcomeMessage: data.welcomeMessage,
              aiDisclosureText: data.aiDisclosureText,
            }).then(() => setSaved(true), (err: Error) => setSaveError(err.message));
          }}>{t('Salvează')}</button>
          {saved && <span className="stamp ok">{t('Salvat')}</span>}
        </div>
        {saveError && <p className="note err">{saveError}</p>}
      </div>

      <section className="sheet">
        <h2>{t('Previzualizare')}</h2>
        <iframe title={t('Previzualizarea widgetului')} srcDoc={srcDoc}
                style={{ width: '100%', height: 560, border: 0, background: 'var(--muted)',
                         borderRadius: 'calc(var(--radius) - 2px)' }} />
      </section>
    </div>
  );
}

// ── Conectori ─────────────────────────────────────────────────────────────────

interface Connector {
  id: string; name: string; base_url: string; status: string;
  headers_template: Record<string, string>; has_secret: boolean;
}
interface Tool {
  id: string; connector_id: string; tool_name: string; description: string;
  http_method: string; path_template: string; enabled: boolean;
}
interface TestResult {
  status: number | null; truncated: boolean; error: string | null;
  raw: string; asModelSees: string;
}

const EMPTY_C = { name: '', baseUrl: '', headerName: 'Authorization', headerValue: 'Bearer {{secret}}', secret: '' };
const EMPTY_T = {
  toolName: '', description: '', pathTemplate: '/', httpMethod: 'GET',
  schemaText: '{\n  "type": "object",\n  "properties": {\n    "order_id": { "type": "string", "description": "Numărul comenzii" }\n  },\n  "required": ["order_id"]\n}',
  responseInstructions: '',
};

function Connectors(): React.ReactElement {
  const [data, setData] = useState<{ connectors: Connector[]; tools: Tool[] } | null>(null);
  const [c, setC] = useState(EMPTY_C);
  const [toolForm, setToolForm] = useState(EMPTY_T);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [testInput, setTestInput] = useState('{"order_id":"SB-1042"}');
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const load = useCallback(
    () => get<{ connectors: Connector[]; tools: Tool[] }>('/connectors').then(setData)
      .catch((err: Error) => {
        if (err instanceof UnauthorizedError) { location.reload(); return; }
        setError(err.message);
        setData({ connectors: [], tools: [] });
      }), []);
  useEffect(() => void load(), [load]);
  if (!data) return error ? <Failed error={error} onRetry={() => void load()} /> : <Loading />;

  const guard = async (fn: () => Promise<unknown>): Promise<void> => {
    setError('');
    try { await fn(); await load(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <>
      {error && <div className="sheet"><p className="note err">{error}</p></div>}

      <section className="sheet stack">
        <h2>{t('Conector nou')}</h2>
        <p className="note">
          {t('Adresa este verificată la salvare: cererile către rețele interne și către adresele de metadate ale furnizorului de cloud sunt respinse.')}
        </p>
        <label className="field">{t('Denumire')}
          <input placeholder={t('CRM-ul companiei')} value={c.name}
                 onChange={(e) => setC({ ...c, name: e.target.value })} />
        </label>
        <label className="field">{t('Adresa de bază')}
          <input placeholder="https://api.example.com" value={c.baseUrl}
                 onChange={(e) => setC({ ...c, baseUrl: e.target.value })} />
        </label>
        <div className="row">
          <label className="field grow">Antet
            <input value={c.headerName} onChange={(e) => setC({ ...c, headerName: e.target.value })} />
          </label>
          <label className="field grow">Valoare
            <input value={c.headerValue} onChange={(e) => setC({ ...c, headerValue: e.target.value })} />
          </label>
        </div>
        <label className="field">{t('Cheia secretă')}
          <input type="password" placeholder={t('se pune în locul {{secret}}')} value={c.secret}
                 onChange={(e) => setC({ ...c, secret: e.target.value })} />
        </label>
        <p className="note">
          {t('Cheia este criptată înainte de salvare și nu mai poate fi citită înapoi — nici în panou, nici prin interfața de programare.')}
        </p>
        <button className="go" disabled={!c.name.trim() || !c.baseUrl.trim()}
                onClick={() => void guard(async () => {
                  await post('/connectors', {
                    name: c.name, baseUrl: c.baseUrl,
                    headersTemplate: c.headerName ? { [c.headerName]: c.headerValue } : {},
                    secret: c.secret,
                  });
                  setC(EMPTY_C);
                })}>{t('Creează conectorul')}</button>
      </section>

      {data.connectors.map((conn) => {
        const tools = data.tools.filter((x) => x.connector_id === conn.id);
        return (
          <section key={conn.id} className="sheet stack">
            <h2>{conn.name}</h2>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="note">{conn.base_url}{conn.has_secret ? t(' · cheie setată') : ''}</p>
              <button onClick={() => void guard(() => del(`/connectors/${conn.id}`))}>{t('Șterge')}</button>
            </div>

            <div className="ledger-wrap">
              <table>
                <thead><tr><th>{t('Instrument')}</th><th>{t('Metodă')}</th><th>{t('Cale')}</th><th /></tr></thead>
                <tbody>
                  {tools.length === 0 && (
                    <tr><td colSpan={4}><p className="note">{t('Niciun instrument încă.')}</p></td></tr>
                  )}
                  {tools.map((tool) => (
                    <tr key={tool.id}>
                      <td><b>{tool.tool_name}</b><p className="note">{tool.description}</p></td>
                      <td className="quiet">{tool.http_method}</td>
                      <td className="quiet">{tool.path_template}</td>
                      <td>
                        <div className="row">
                          <button disabled={testing === tool.id} onClick={() => void guard(async () => {
                            setTesting(tool.id); setResult(null);
                            try {
                              setResult(await post<TestResult>(`/tools/${tool.id}/test`,
                                { input: JSON.parse(testInput) }));
                            } finally { setTesting(null); }
                          })}>{testing === tool.id ? t('Se testează…') : t('Testează')}</button>
                          <button onClick={() => void guard(() => del(`/tools/${tool.id}`))}>{t('Șterge')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={() => setTarget(target === conn.id ? '' : conn.id)}>
              {target === conn.id ? t('Renunță') : t('Adaugă un instrument')}
            </button>

            {target === conn.id && (
              <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label className="field">Numele instrumentului
                  <input placeholder="stare_comanda" value={toolForm.toolName}
                         onChange={(e) => setToolForm({ ...toolForm, toolName: e.target.value })} />
                </label>
                <label className="field">Ce face
                  <input placeholder={t('Află starea comenzii după numărul ei')} value={toolForm.description}
                         onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })} />
                </label>
                <p className="note">
                  {t('Descrierea este singurul lucru după care botul decide dacă să folosească instrumentul. „Află starea comenzii după numărul ei” funcționează; „comenzi” nu.')}
                </p>
                <div className="row">
                  <select style={{ width: 120 }} value={toolForm.httpMethod}
                          onChange={(e) => setToolForm({ ...toolForm, httpMethod: e.target.value })}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <input className="grow" placeholder="/orders/{order_id}" value={toolForm.pathTemplate}
                         onChange={(e) => setToolForm({ ...toolForm, pathTemplate: e.target.value })} />
                </div>
                <label className="field">Parametrii
                  <textarea rows={8} value={toolForm.schemaText}
                            onChange={(e) => setToolForm({ ...toolForm, schemaText: e.target.value })} />
                </label>
                <label className="field">{t('Cum să interpreteze răspunsul')}
                  <input value={toolForm.responseInstructions}
                         onChange={(e) => setToolForm({ ...toolForm, responseInstructions: e.target.value })} />
                </label>
                <button className="go" onClick={() => void guard(async () => {
                  let inputSchema: Record<string, unknown>;
                  try { inputSchema = JSON.parse(toolForm.schemaText) as Record<string, unknown>; }
                  catch (err) { throw new Error(`Parametrii nu sunt corecți: ${(err as Error).message}`); }
                  await post('/tools', { ...toolForm, connectorId: conn.id, inputSchema });
                  setToolForm(EMPTY_T);
                })}>{t('Salvează instrumentul')}</button>
              </div>
            )}
          </section>
        );
      })}

      <section className="sheet stack">
        <h2>{t('Test')}</h2>
        <label className="field">Parametrii cu care se face testul
          <textarea rows={3} value={testInput} onChange={(e) => setTestInput(e.target.value)} />
        </label>
        {result && (
          <>
            <p className="note">
              HTTP {result.status ?? '—'}
              {result.truncated && t(' · răspuns tăiat la 32 KB')}
              {result.error && <span className="err"> · {result.error}</span>}
            </p>
            <p className="note">{t('Răspunsul brut al serviciului:')}</p>
            <pre>{result.raw || '(gol)'}</pre>
            <p className="note">{t('Ce vede botul din el:')}</p>
            <pre>{result.asModelSees}</pre>
          </>
        )}
      </section>
    </>
  );
}

// ── Conversații ───────────────────────────────────────────────────────────────

interface Conv {
  id: string; started_at: string; last_message_at: string; locale: string; status: string;
  message_count: number; has_lead: boolean; gap_count: number; first_question: string | null;
}
interface Turn {
  role: string; content: string; created_at: string;
  tokens_in: number; tokens_out: number; tool_calls: unknown;
}
interface Detail {
  messages: Turn[];
  lead: { name: string | null; email: string | null; phone: string | null;
          payload: Record<string, string>; quote_completeness: number } | null;
  gaps: Array<{ question: string; reason: string }>;
  /** Названия полей заявки — те же, что в письме. */
  fieldLabels?: Record<string, string>;
}

const EMPTY_F = { from: '', to: '', q: '', locale: '', hasLead: false, hasGap: false };
const PER = 25;

function Chats(
  { initialOpen, locales, initialQuery, onOpened }:
  { initialOpen?: string; locales: string[]; initialQuery?: string; onOpened?: () => void },
): React.ReactElement {
  const [f, setF] = useState({ ...EMPTY_F, q: initialQuery ?? '' });
  const [data, setData] = useState<{ rows: Conv[]; total: number } | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  // Сообщаем наверх, что ссылку из письма уже отработали: второй раз она
  // открываться не должна.
  useEffect(() => { if (initialOpen) onOpened?.(); }, [initialOpen, onOpened]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [ask, setAsk] = useState('');
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    if (f.q.trim()) p.set('q', f.q.trim());
    if (f.locale) p.set('locale', f.locale);
    if (f.hasLead) p.set('hasLead', 'true');
    if (f.hasGap) p.set('hasGap', 'true');
    return p;
  }, [f]);

  // Запрос уходит на каждое нажатие клавиши, а отвечают они не по порядку:
  // без отбрасывания устаревших ответов в поле было одно, а в таблице другое.
  const seq = useRef(0);
  const [listError, setListError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set('limit', String(PER));
    p.set('offset', String(page * PER));
    setData(null);
    setListError(null);
    const mine = ++seq.current;
    void get<{ rows: Conv[]; total: number }>(`/conversations?${p}`).then(
      (next) => { if (seq.current === mine) setData(next); },
      (err: Error) => {
        if (err instanceof UnauthorizedError) { location.reload(); return; }
        if (seq.current === mine) setListError(err.message);
      },
    );
  }, [params, page, attempt]);

  useEffect(() => {
    setEditing(null);
    setSaved(new Set());
    if (!open) { setDetail(null); return; }
    void get<Detail>(`/conversations/${open}`).then(setDetail, (err: Error) => {
      if (err instanceof UnauthorizedError) { location.reload(); return; }
      setListError(err.message);
    });
  }, [open, attempt]);

  if (open) {
    return (
      <>
        <div className="row" style={{ marginBottom: 14 }}>
          <button onClick={() => setOpen(null)}>{t('← Înapoi la listă')}</button>
        </div>
        {listError ? <Failed error={listError} onRetry={() => setAttempt((n) => n + 1)} />
         : !detail ? <Loading /> : (
          <>
            {detail.lead && (
              <section className="sheet stack">
                <h2>{t('Cerere de ofertă')}</h2>
                <p><b>{[detail.lead.name, detail.lead.email, detail.lead.phone]
                  .filter(Boolean).join(' · ')}</b></p>
                <div className="ledger-wrap">
                  <table>
                    <tbody>
                      {Object.entries(detail.lead.payload ?? {}).map(([k, v]) => (
                        <tr key={k}>
                          <td className="quiet">{detail.fieldLabels?.[k] ?? k}</td>
                          <td>{v}</td>
                        </tr>
                      ))}
                      {Object.keys(detail.lead.payload ?? {}).length === 0 && (
                        <tr><td><p className="note">{t('Doar datele de contact.')}</p></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {detail.gaps.length > 0 && (
              <section className="sheet stack">
                <h2>{t('Nu s-a găsit în materiale')}</h2>
                {detail.gaps.map((g, i) => <p key={i} className="note warn">{g.question}</p>)}
              </section>
            )}
            <section className="sheet stack">
              <h2>{t('Conversația')}</h2>
              {detail.messages.map((turn, i) => {
                // Вопрос берётся из ближайшей реплики посетителя выше: правят
                // ответ, но утверждают пару, иначе искать его будет не по чему.
                const asked = detail.messages.slice(0, i)
                  .reverse().find((m) => m.role === 'user')?.content ?? '';
                const editable = turn.role !== 'user' && asked !== '';
                return (
                  <div key={i} className="turn">
                    <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                      <span className="note">
                        {turn.role === 'user' ? t('Vizitator') : t('Bot')} · {dt(turn.created_at)}
                        {turn.tool_calls ? t(' · a folosit un instrument') : ''}
                      </span>
                      {editable && editing !== i && (
                        saved.has(i)
                          ? <span className="stamp ok">{t('Aprobat')}</span>
                          : <button onClick={() => {
                              setEditing(i); setDraft(turn.content); setAsk(asked); setErr('');
                            }}>{t('Corectează răspunsul')}</button>
                      )}
                    </div>

                    {editing === i ? (
                      <div className="stack" style={{ gap: 10 }}>
                        {/* Вопрос правится вместе с ответом: посетитель мог спросить
                            «а в Клуж?» — утверждать ответ на такую формулировку
                            бессмысленно, по ней потом ничего не найдётся. */}
                        <label className="field">{t('Întrebarea la care răspunde')}
                          <input value={ask} onChange={(e) => setAsk(e.target.value)} />
                        </label>
                        <label className="field">{t('Răspunsul pe care îl aprobați')}
                          <textarea rows={5} value={draft}
                                    onChange={(e) => setDraft(e.target.value)} />
                        </label>
                        <p className="note">
                          {t('Botul va folosi acest text cuvânt cu cuvânt când cineva întreabă același lucru, chiar dacă în materiale scrie altceva.')}
                        </p>
                        {err && <p className="note err">{err}</p>}
                        <div className="row">
                          <button className="go" disabled={busy || !ask.trim() || !draft.trim()}
                                  onClick={() => {
                            setBusy(true); setErr('');
                            void post('/approved', {
                              question: ask, answer: draft, conversationId: open,
                            })
                              .then(() => { setSaved(new Set(saved).add(i)); setEditing(null); })
                              .catch((e: Error) => setErr(e.message))
                              .finally(() => setBusy(false));
                          }}>{busy ? t('Se salvează…') : t('Aprobă răspunsul')}</button>
                          <button onClick={() => setEditing(null)}>{t('Renunță')}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </>
    );
  }

  const set = (patch: Partial<typeof f>): void => { setF({ ...f, ...patch }); setPage(0); };
  const exportUrl = (level: 'conversation' | 'message'): string => {
    const p = new URLSearchParams(params);
    p.set('level', level);
    return `/admin/api/conversations/export?${p}`;
  };

  return (
    <>
      <section className="sheet stack">
        <h2>{t('Filtre')}</h2>
        <div className="row">
          <label className="field">De la
            <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="field">{t('Până la')}
            <input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <label className="field">{t('Limba')}
            <select style={{ width: 150 }} value={f.locale} onChange={(e) => set({ locale: e.target.value })}>
              <option value="">toate</option>
              {locales.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </label>
        </div>
        <label className="field">{t('Caută în text')}
          <input placeholder={t('rate, garanție, livrare…')} value={f.q}
                 onChange={(e) => set({ q: e.target.value })} />
        </label>
        <div className="row">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={f.hasLead}
                   onChange={(e) => set({ hasLead: e.target.checked })} /> {t('cu cerere de ofertă')}
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={f.hasGap}
                   onChange={(e) => set({ hasGap: e.target.checked })} /> {t('cu întrebări fără răspuns')}
          </label>
          <button onClick={() => { setF(EMPTY_F); setPage(0); }}>{t('Resetează')}</button>
        </div>
        <div className="row">
          <span className="note">{t('Descarcă ce vezi acum:')}</span>
          <a href={exportUrl('conversation')}><button>{t('Pe conversații')}</button></a>
          <a href={exportUrl('message')}><button>{t('Pe replici')}</button></a>
        </div>
        <p className="note">
          {t('„Pe conversații” — un rând per discuție, cu cererea de ofertă și numărul de goluri; pentru situația de ansamblu. „Pe replici” — fiecare mesaj separat; pentru a citi și a marca unde botul a răspuns greșit.')}
        </p>
      </section>

      <section className="sheet">
        <h2>{t('Conversații')}{data ? ` · ${data.total}` : ''}</h2>
        {listError ? <Failed error={listError} onRetry={() => setAttempt((n) => n + 1)} />
         : !data ? <Loading /> : (
          <div className="ledger-wrap">
            <table>
              <thead>
                <tr><th>{t('Început')}</th><th>{t('Prima întrebare')}</th><th>Lb.</th><th>{t('Replici')}</th>
                  <th>{t('Ofertă')}</th><th>{t('Goluri')}</th><th /></tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={7}><p className="note">
                    {t('Nicio conversație pentru filtrele alese.')}</p></td></tr>
                )}
                {data.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="quiet">{dt(c.started_at)}</td>
                    <td>{c.first_question?.slice(0, 72) ?? '—'}</td>
                    <td className="quiet">{c.locale.toUpperCase()}</td>
                    <td className="num">{c.message_count}</td>
                    <td>{c.has_lead ? <span className="stamp lead">{t('Ofertă')}</span> : ''}</td>
                    <td>{c.gap_count > 0 ? <span className="stamp wait">{c.gap_count}</span> : ''}</td>
                    <td><button onClick={() => setOpen(c.id)}>{t('Deschide')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && data.total > PER && (
        <div className="row">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Înapoi')}</button>
          <span className="note">
            {page * PER + 1}–{Math.min((page + 1) * PER, data.total)} din {data.total}
          </span>
          <button disabled={(page + 1) * PER >= data.total}
                  onClick={() => setPage(page + 1)}>{t('Înainte')}</button>
        </div>
      )}
    </>
  );
}

// ── Analize ───────────────────────────────────────────────────────────────────

interface AnalyticsData {
  usage: Array<{ date: string; messages: number; tokens_in: number; tokens_out: number }>;
  unanswered: Array<{ question: string; times: number; last_seen: string }>;
  closed?: Array<{ question: string; times: number; resolved_at: string; answer: string | null }>;
  leads: Array<{ id: string; name: string | null; email: string | null; phone: string | null;
                 note: string | null; created_at: string; conversation_id: string | null;
                 notified_at: string | null; notify_error: string | null;
                 /** chatbot | configurator — откуда пришла заявка. */
                 product: string;
                 payload: { summary?: string[]; totalFormatted?: string } | null;
                 offer_id: string | null; offer_number: string | null; has_pdf: boolean }>;
  notifyEmail?: string;
  quota: { plan: string; cap: number | null; usedThisMonth: number };
}

interface Approved {
  id: string; question: string; answer: string; updated_at: string;
}

/**
 * График расхода за 30 дней.
 *
 * Настоящие данные, а не украшение: по нему видно, когда виджет реально
 * разговаривал, а когда молчал. Без осей и сетки — они здесь ничего не
 * добавляют; подписаны только края и максимум, то есть ровно те три числа,
 * которые с графика и считывают.
 *
 * Рисуется вручную, а не библиотекой: одна кривая с заливкой не стоит
 * трёхсот килобайт зависимости, а собственный SVG слушается токенов темы.
 */
function UsageChart({ rows }: { rows: Array<{ date: string; messages: number }> }): React.ReactElement | null {
  const points = useMemo(() => {
    if (rows.length < 2) return null;
    const max = Math.max(...rows.map((r) => r.messages), 1);
    const W = 100;
    const H = 34;
    const step = W / (rows.length - 1);
    const xy = rows.map((r, i) => [i * step, H - (r.messages / max) * H] as const);
    // Сглаживание по средним точкам: ломаная из тридцати отрезков читается
    // как шум, а не как ход событий.
    let d = `M ${xy[0]![0]} ${xy[0]![1]}`;
    for (let i = 1; i < xy.length; i++) {
      const [px, py] = xy[i - 1]!;
      const [cx, cy] = xy[i]!;
      d += ` C ${(px + cx) / 2} ${py}, ${(px + cx) / 2} ${cy}, ${cx} ${cy}`;
    }
    return { d, area: `${d} L ${W} ${H} L 0 ${H} Z`, max, last: xy[xy.length - 1]! };
  }, [rows]);

  if (!points) return null;
  const first = rows[0]!.date;
  const last = rows[rows.length - 1]!.date;

  return (
    <figure className="chart">
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" role="img"
           aria-label={tf('Mesaje pe zi, maximum {max}', { max: points.max })}>
        <defs>
          <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={points.area} fill="url(#usageFill)" />
        <path d={points.d} fill="none" stroke="var(--accent-strong)" strokeWidth="1"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption>
        <span>{d(first)}</span>
        <span className="peak">{tf('maxim {max} pe zi', { max: points.max })}</span>
        <span>{d(last)}</span>
      </figcaption>
    </figure>
  );
}

function Analytics(): React.ReactElement {
  const [d2, setD2] = useState<AnalyticsData | null>(null);
  const [approved, setApproved] = useState<Approved[]>([]);
  const loadApproved = useCallback(
    () => get<Approved[]>('/approved').then(setApproved).catch(() => setApproved([])), []);
  useEffect(() => { void get<AnalyticsData>('/insights').then(setD2); void loadApproved(); },
    [loadApproved]);
  const total = useMemo(() => (d2?.usage ?? []).reduce((s, r) => s + r.messages, 0), [d2]);
  if (!d2) return <Loading />;

  return (
    <>
      <section className="sheet">
        <h2>{t('Consum')}</h2>
        <div className="row" style={{ gap: 40 }}>
          <p className="figure">{d2.quota.usedThisMonth}<small>{t('mesaje luna aceasta')}</small></p>
          {d2.quota.cap !== null && (
            <p className="figure">{d2.quota.cap}<small>{t('incluse în plan')}</small></p>
          )}
          <p className="figure">{total}<small>{t('în ultimele 30 de zile')}</small></p>
        </div>
        <UsageChart rows={d2.usage} />
      </section>

      <section className="sheet">
        <h2>{t('Întrebări fără răspuns')}</h2>
        <p className="note" style={{ padding: '0 0 12px' }}>
          {t('Exact temele care lipsesc din materiale. Cel mai scurt drum spre un bot mai bun este să adaugi un document despre primele rânduri din listă.')}
        </p>
        <div className="ledger-wrap">
          <table>
            <thead><tr><th>{t('Întrebare')}</th><th>{t('De câte ori')}</th><th>{t('Ultima dată')}</th></tr></thead>
            <tbody>
              {d2.unanswered.length === 0 && (
                <tr><td colSpan={3}><p className="note">
                  {t('Toate întrebările și-au găsit răspunsul în materiale.')}</p></td></tr>
              )}
              {d2.unanswered.map((u, i) => (
                <tr key={i}>
                  <td>{u.question}</td>
                  <td className="num">{u.times}</td>
                  <td className="quiet">{d(u.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Поле может не прийти от сервера более старой сборки. Отсутствующая
          секция — это отсутствующая секция, а не пустой экран: ронять всю
          страницу из-за одного необязательного блока нельзя. */}
      {(d2.closed ?? []).length > 0 && (
        <section className="sheet">
          <h2>{t('Închise după completarea materialelor')}</h2>
          <p className="note" style={{ padding: '0 0 12px' }}>
            {t('Verificăm lista singuri de fiecare dată când adăugați ceva în dosar. Citiți răspunsurile: dacă unul nu vă convine, adăugați un material mai clar despre acel subiect.')}
          </p>
          <div className="stack" style={{ gap: 16 }}>
            {(d2.closed ?? []).map((u, i) => (
              <div key={i} className="qa">
                <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <b>{u.question}</b>
                  <span className="when">{d(u.resolved_at)}</span>
                </div>
                <p className="note">{u.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {approved.length > 0 && (
        <section className="sheet">
          <h2>{t('Răspunsuri aprobate de dumneavoastră')}</h2>
          <p className="note" style={{ padding: '0 0 12px' }}>
            {t('La aceste întrebări botul răspunde exact cu textul de mai jos, cuvânt cu cuvânt, indiferent ce scrie în materiale. Le creați din')} <b>{t('Conversații')}</b>{t(', corectând un răspuns al botului.')}
          </p>
          <div className="stack" style={{ gap: 16 }}>
            {approved.map((a) => (
              <div key={a.id} className="qa">
                <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <b>{a.question}</b>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="when">{d(a.updated_at)}</span>
                    <button onClick={() => void del(`/approved/${a.id}`).then(loadApproved)}>
                      {t('Șterge')}
                    </button>
                  </span>
                </div>
                <p className="note">{a.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sheet stack">
        <h2>{t('Cereri de ofertă')}</h2>
        <NotifyEmail initial={d2.notifyEmail ?? ''} />
        <div className="ledger-wrap">
          <table>
            <thead><tr><th>{t('Când')}</th><th>{t('Nume')}</th><th>{t('Email')}</th><th>{t('Telefon')}</th><th>{t('Cererea')}</th></tr></thead>
            <tbody>
              {d2.leads.length === 0 && (
                <tr><td colSpan={5}><p className="note">{t('Nicio cerere încă.')}</p></td></tr>
              )}
              {d2.leads.map((l) => (
                <tr key={l.id}>
                  {/* Отметка отправки стоит под датой, а не отдельной колонкой:
                      шестая колонка уезжает за край на телефоне, и состояние,
                      ради которого всё затевалось, оказывается не видно. */}
                  <td className="quiet">
                    {d(l.created_at)}
                    <NotifyState lead={l} />
                  </td>
                  <td>
                    {l.name}
                    {/* Метка продукта — под именем, а не колонкой: колонок
                        и так пять, шестая уезжает за край на телефоне. */}
                    {l.product === 'configurator' && (
                      <span className="tag">{t('Configurator')}</span>
                    )}
                  </td>
                  <td>{l.email}</td>
                  <td className="quiet">{l.phone}</td>
                  <td>
                    {l.note}
                    <Configuration lead={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/**
 * Конфигурация из конфигуратора и ссылка на документ.
 *
 * Расшифрованные строки берутся из заявки, а не собираются здесь: панель
 * не знает ни прайса, ни подписей шагов, а через год конфиг тенанта будет
 * другим — и старая заявка расшифровалась бы уже неверно.
 */
function Configuration({ lead }: {
  lead: AnalyticsData['leads'][number];
}): React.ReactElement | null {
  const summary = lead.payload?.summary ?? [];
  if (lead.product !== 'configurator') return null;
  return (
    <div className="lead-config">
      {lead.offer_number && (
        <div className="lead-offer">
          <b>№ {lead.offer_number}</b>
          {lead.payload?.totalFormatted && <span> · {lead.payload.totalFormatted}</span>}
          {lead.has_pdf && lead.offer_id && (
            <>
              {' · '}
              <a href={`/admin/api/offers/${lead.offer_id}/pdf`} target="_blank" rel="noreferrer">
                PDF
              </a>
            </>
          )}
        </div>
      )}
      {summary.length > 0 && (
        <ul className="lead-lines">
          {summary.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Куда слать заявки. Поле стоит здесь, а не в отдельных настройках: директор
 * смотрит на список заявок, и вопрос «а мне об этом сообщат?» возникает именно
 * в этот момент.
 */
function NotifyEmail({ initial }: { initial: string }): React.ReactElement {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  return (
    <>
      <label className="field" htmlFor="notify-email">{t('Trimitem fiecare cerere pe')}</label>
      <div className="row">
        <input id="notify-email" type="email" value={value} placeholder="vanzari@exemplu.ro"
               style={{ flex: 1, minWidth: 200, maxWidth: 420 }}
               onChange={(e) => { setValue(e.currentTarget.value); setSaved(false); setErr(''); }} />
        <button className="go" onClick={() => {
          void put<{ error?: string }>('/lead-notify', { email: value })
            .then((r) => (r.error ? setErr(r.error) : setSaved(true)))
            .catch((e: Error) => setErr(e.message));
        }}>{t('Salvează')}</button>
        {saved && <span className="stamp ok">{t('Salvat')}</span>}
      </div>
      {err && <p className="note err">{err}</p>}
      <p className="note">
        {t('Anunțul pleacă la două minute după ce vizitatorul lasă un contact — atât cât îi ia asistentului să afle și restul detaliilor. Câmpul gol oprește anunțurile; cererile rămân oricum aici.')}
      </p>
    </>
  );
}

/**
 * Ушло письмо или нет. Показывается прямо в строке заявки: молчаливая ошибка
 * отправки — это заявка, о которой никто не узнал, и узнать об этом директор
 * должен здесь, а не по отсутствию звонков.
 */
function NotifyState({ lead }: {
  lead: { notified_at: string | null; notify_error: string | null };
}): React.ReactElement | null {
  if (lead.notified_at) {
    return (
      <div><span className="stamp ok" title={dt(lead.notified_at)}>{t('Trimis')}</span></div>
    );
  }
  if (lead.notify_error) {
    return (
      <div><span className="stamp void" title={lead.notify_error}>{t('Netrimis')}</span></div>
    );
  }
  return null;
}

// ── Instalare ─────────────────────────────────────────────────────────────────

interface VerifyResult {
  reachable: boolean; status: number | null;
  scriptFound: boolean; keyFound: boolean; error?: string;
}

function Install(): React.ReactElement {
  const [data, setData] = useState<{ domains: string[]; snippet: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [checkUrl, setCheckUrl] = useState('');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void get<{ domains: string[]; snippet: string }>('/install').then((x) => {
      setData(x); setDraft(x.domains.join('\n'));
    });
  }, []);
  if (!data) return <Loading />;

  return (
    <>
      <section className="sheet stack">
        <h2>{t('Codul de instalat')}</h2>
        <pre>{data.snippet}</pre>
        <div className="row">
          <button onClick={() => {
            void navigator.clipboard.writeText(data.snippet).then(() => setCopied(true));
          }}>{t('Copiază')}</button>
          {copied && <span className="stamp ok">{t('Copiat')}</span>}
          {/* Тег пишется как есть: JSX выводит текст буквально, и HTML-сущности
              вида &lt; попадают на экран в сыром виде — клиент видел абракадабру
              там, где должен быть закрывающий тег. */}
          <span className="note">{t('Se pune înainte de eticheta </body>.')}</span>
        </div>
      </section>

      <section className="sheet stack">
        <h2>{t('Verifică instalarea')}</h2>
        <p className="note">{t('Deschidem pagina și căutăm pe ea codul cu cheia ta.')}</p>
        <div className="row">
          <input className="grow" placeholder="https://exemplu.ro/" value={checkUrl}
                 onChange={(e) => setCheckUrl(e.target.value)} aria-label={t('Adresa paginii')} />
          <button disabled={checking || !checkUrl.trim()} onClick={() => {
            setChecking(true); setVerify(null);
            void post<VerifyResult>('/install/verify', { url: checkUrl })
              .then(setVerify).finally(() => setChecking(false));
          }}>{checking ? t('Se verifică…') : t('Verifică')}</button>
        </div>
        {verify && (
          <div className="stack" style={{ gap: 3 }}>
            <p className={verify.reachable ? 'note' : 'note err'}>
              {verify.reachable
                ? `Pagina răspunde (${verify.status})`
                : `Pagina nu răspunde${verify.error ? `: ${verify.error}` : ''}`}
            </p>
            {verify.reachable && (
              <>
                <p className={verify.scriptFound ? 'note' : 'note err'}>
                  {verify.scriptFound ? t('Codul widgetului a fost găsit')
                    : t('Codul widgetului nu apare pe pagină')}
                </p>
                <p className={verify.keyFound ? 'note' : 'note err'}>
                  {verify.keyFound ? t('Cheia corespunde') : t('Cheia ta nu apare pe pagină')}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="sheet stack">
        <h2>{t('Domenii permise')}</h2>
        <p className="note">
          {t('Widgetul răspunde doar pe aceste domenii — câte unul pe rând, subdomeniile sunt incluse automat. Lista goală înseamnă că widgetul nu funcționează nicăieri.')}
        </p>
        <textarea rows={4} value={draft} aria-label={t('Domenii permise')}
                  onChange={(e) => { setDraft(e.target.value); setSaved(false); }} />
        <div className="row">
          <button className="go" onClick={() => {
            setSaveError('');
            const domains = draft.split('\n').map((s) => s.trim()).filter(Boolean);
            void put<{ domains: string[] }>('/install', { domains }).then((next) => {
              setDraft(next.domains.join('\n')); setSaved(true);
            }, (err: Error) => setSaveError(err.message));
          }}>{t('Salvează')}</button>
          {saved && <span className="stamp ok">{t('Salvat')}</span>}
        </div>
        {/* На этом экране проглоченная ошибка означает мёртвый виджет при
            «сохранённых» доменах — то есть тихую поломку у клиента на сайте. */}
        {saveError && <p className="note err">{saveError}</p>}
      </section>
    </>
  );
}


// ── Abonament ────────────────────────────────────────────────────────────────

interface PlanCard {
  id: string; name: string; priceEur: number; monthlyMessages: number;
  highlights: string[]; current: boolean;
}

interface SubscriptionData {
  plan: { id: string; name: string; priceEur: number; highlights: string[] };
  allPlans: PlanCard[];
  status: string;
  active: boolean;
  reason: string;
  daysLeft: number | null;
  currentPeriodEnd: string | null;
  usage: {
    messages: number; messagesCap: number;
    documents: number; documentsCap: number;
    chunks: number; chunksCap: number;
    bytes: number; bytesCap: number;
  };
  canManageBilling: boolean;
  retention: { conversationDays: number; canceledDays: number };
  canceledAt: string | null;
}

/**
 * Полоса расхода.
 *
 * Цвет меняется на девяноста процентах, а не на ста: сообщить, что лимит
 * ИСЧЕРПАН, — значит сообщить об этом, когда сделать уже ничего нельзя.
 */
function Meter({ label, used, cap, format }: {
  label: string; used: number; cap: number; format?: (v: number) => string;
}): React.ReactElement {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const show = format ?? ((v: number) => v.toLocaleString());
  return (
    <div className="meter">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span className={pct >= 90 ? 'err' : 'quiet'}>{show(used)} / {show(cap)}</span>
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} data-full={pct >= 90 || undefined} /></div>
    </div>
  );
}

function Subscription(): React.ReactElement {
  const { data, error, reload } = useResource(() => get<SubscriptionData>('/subscription'), []);
  const [portalError, setPortalError] = useState('');
  const [busy, setBusy] = useState('');
  const [requested, setRequested] = useState<string | null>(null);

  if (error) return <Failed error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const mb = (v: number): string => `${Math.round(v / 1048576)} MB`;

  /**
   * Выбрать пакет. Что произойдёт — решает сервер, а не эта кнопка:
   * оплата, смена действующей подписки или заявка нам, если оплата ещё
   * не подключена. Панели знать эту разницу незачем, а ошибиться в ней
   * она могла бы — и ошибка стоила бы клиенту двойного списания.
   */
  const choose = async (planId: string): Promise<void> => {
    setPortalError('');
    setBusy(planId);
    try {
      const r = await post<{ url?: string; changed?: boolean; requested?: boolean }>(
        '/subscription/checkout', { plan: planId },
      );
      if (r.url) { location.href = r.url; return; }
      if (r.requested) { setRequested(planId); setBusy(''); return; }
      // Тариф сменился у действующей подписки — перечитываем, а не гадаем.
      reload();
      setBusy('');
    } catch (e) {
      setPortalError((e as Error).message);
      setBusy('');
    }
  };

  // Состояние подписки словами, а не кодом. Читает директор по продажам,
  // а не мы: «past_due» ему не говорит ничего, «карта не прошла» — говорит.
  const state = (): { text: string; kind: 'ok' | 'warn' | 'err' } => {
    switch (data.reason) {
      case 'trial':
        return { kind: 'ok', text: data.daysLeft !== null
          ? tf('Perioadă de probă — au mai rămas {n} zile', { n: data.daysLeft })
          : t('Perioadă de probă') };
      case 'paid':
        return { kind: 'ok', text: data.currentPeriodEnd
          ? tf('Activ — următoarea plată {date}', { date: d(data.currentPeriodEnd) })
          : t('Activ') };
      case 'grace':
        return { kind: 'warn', text: tf('Plata nu a trecut. Asistentul funcționează încă {n} zile', { n: data.daysLeft ?? 0 }) };
      case 'trial_expired':
        return { kind: 'err', text: t('Perioada de probă s-a încheiat') };
      case 'unpaid':
        return { kind: 'err', text: t('Abonamentul nu este plătit') };
      default:
        return { kind: 'err', text: t('Abonamentul este anulat') };
    }
  };
  const s = state();

  return (
    <>
      <section className="sheet stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>{data.plan.name}</h2>
            <p className="note">{tf('{price} € pe lună', { price: data.plan.priceEur })}</p>
          </div>
          <span className={`stamp ${s.kind}`}>{s.text}</span>
        </div>

        {!data.active && (
          <p className="note err">
            {t('Asistentul nu mai răspunde vizitatorilor. Formularul de contact rămâne activ, așa că nu pierdeți cererile.')}
          </p>
        )}

        <ul className="ticks">
          {data.plan.highlights.map((h) => <li key={h}>{h}</li>)}
        </ul>

        <div className="row">
          {/* Оплата ТЕКУЩЕГО пакета. Не выбор тарифа — плата за то, что уже есть.
              Триал кончается ночью, и утром человек должен мочь заплатить сам,
              а не писать письмо и ждать нас.
              Тому, у кого подписка уже оформлена, кнопка не показывается:
              «Оплатить» рядом с «Активна» читается как просьба заплатить дважды.
              Ему нужна другая кнопка — карта и счета. */}
          {!data.canManageBilling && (
          <button className="go" disabled={busy !== ''} onClick={() => void choose(data.plan.id)}>
            {busy === data.plan.id ? t('Se trimite…') : t('Plătește abonamentul')}
          </button>
          )}

          {data.canManageBilling && (
            <button disabled={busy !== ''} onClick={() => {
              setPortalError(''); setBusy('portal');
              void post<{ url: string }>('/subscription/portal')
                .then((r) => { location.href = r.url; })
                .catch((e: Error) => { setPortalError(e.message); setBusy(''); });
            }}>{t('Card și facturi')}</button>
          )}
        </div>
        {portalError && <p className="note err">{portalError}</p>}
      </section>

      <section className="sheet stack">
        <h2>{t('Consum luna aceasta')}</h2>
        <Meter label={t('Mesaje')} used={data.usage.messages} cap={data.usage.messagesCap} />
        <Meter label={t('Documente')} used={data.usage.documents} cap={data.usage.documentsCap} />
        <Meter label={t('Fragmente')} used={data.usage.chunks} cap={data.usage.chunksCap} />
        <Meter label={t('Spațiu')} used={data.usage.bytes} cap={data.usage.bytesCap} format={mb} />
        <p className="note">
          {t('Când numărul de mesaje se epuizează, asistentul propune vizitatorului să lase datele de contact — cererile continuă să ajungă la dumneavoastră.')}
        </p>
      </section>

      <section className="sheet stack">
        <h2>{t('Ce se întâmplă cu datele')}</h2>
        <ul className="ticks">
          <li>{tf('Conversațiile se păstrează {n} zile, apoi se șterg.', { n: data.retention.conversationDays })}</li>
          <li>{t('Cererile de contact rămân — sunt datele clienților dumneavoastră, nu jurnalul nostru.')}</li>
          <li>{tf('Dacă renunțați la abonament, păstrăm totul încă {n} zile — reveniți și găsiți totul la loc.', { n: data.retention.canceledDays })}</li>
          <li>{tf('După aceste {n} zile ștergem definitiv: materiale, conversații, setări.', { n: data.retention.canceledDays })}</li>
        </ul>
        {data.canceledAt && (
          <p className="note err">
            {tf('Abonamentul a fost anulat pe {date}. Datele se șterg definitiv după {n} zile de la această dată.',
                { date: d(data.canceledAt), n: data.retention.canceledDays })}
          </p>
        )}
        <p className="note">
          {t('Renunțarea la abonament se face din «Card și facturi» — acolo puteți și descărca facturile.')}
        </p>
      </section>

      <section className="sheet stack">
        <h2>{t('Pachete')}</h2>
        <div className="plans">
          {data.allPlans.map((p) => (
            <div key={p.id} className={`plan-card${p.current ? ' current' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{p.name}</strong>
                <span className="quiet">{p.priceEur} €</span>
              </div>
              <ul className="ticks">
                {p.highlights.map((h) => <li key={h}>{h}</li>)}
              </ul>
              {requested === p.id ? <span className="stamp ok">{t('Cererea a fost trimisă')}</span>
               : p.current ? <span className="stamp ok">{t('Pachetul dumneavoastră')}</span>
               : (
                <button disabled={busy !== ''} onClick={() => void choose(p.id)}>
                  {busy === p.id ? t('Se trimite…') : t('Alege acest pachet')}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="note">
          {t('Schimbarea pachetului se face de către noi — primiți un link de plată în aceeași zi.')}
        </p>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
