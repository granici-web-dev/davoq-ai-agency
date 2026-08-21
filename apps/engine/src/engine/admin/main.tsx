import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { STRINGS, type Locale } from '../shared/i18n.js';
import { auditTheme, type ContrastWarning, type Preset, type Theme } from '../shared/theme.js';
import { del, get, post, put, upload, UnauthorizedError } from './api.js';
import { previewSrcDoc } from './preview.js';

type Screen = 'kb' | 'drive' | 'aspect' | 'connectors' | 'chats' | 'analytics' | 'install';

const ALL_SCREENS: Array<[Screen, string]> = [
  ['kb', 'Bază de cunoștințe'],
  ['drive', 'Google Drive'],
  ['aspect', 'Aspect'],
  ['connectors', 'Conectori'],
  ['chats', 'Conversații'],
  ['analytics', 'Analize'],
  ['install', 'Instalare'],
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
  ALL_SCREENS.filter(([id]) => !hidden.includes(id));

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

const dt = (v: string): string => new Date(v).toLocaleString('ro-RO');
const d = (v: string): string => new Date(v).toLocaleDateString('ro-RO');

function Spinner(): React.ReactElement {
  return <span className="spinner" role="status" aria-label="Se încarcă" />;
}

function Loading(): React.ReactElement {
  return <div className="sheet row"><Spinner /><span className="note">Se încarcă…</span></div>;
}

function App(): React.ReactElement {
  const [me, setMe] = useState<{
    email: string;
    tenant: { name: string; plan: string; logo_url: string | null; hiddenScreens: string[] };
  } | null>(null);
  const [screen, setScreen] = useState<Screen | null>(DEEP_LINK?.screen ?? null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    get<typeof me>('/me').then(setMe).catch(() => setMe(null)).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="shell"><Loading /></div>;
  if (!me) return <Login />;

  // Первый видимый экран становится стартовым только после загрузки /me:
  // до неё неизвестно, какие экраны у этого клиента вообще есть.
  const screens = visibleScreens(me.tenant.hiddenScreens ?? []);
  const current = screen && screens.some(([id]) => id === screen) ? screen : screens[0]![0];

  return (
    <div className="shell">
      <header className="wallet-head">
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
          <span className="note">plan {me.tenant.plan}</span>
        </div>
        <div className="who">
          <span>{me.email}</span>
          <button onClick={() => post('/logout').then(() => location.reload())}>Ieșire</button>
        </div>
      </header>

      <nav className="coupons" aria-label="Secțiuni">
        {screens.map(([id, label]) => (
          <button key={id} className="coupon" onClick={() => setScreen(id)}
                  {...(current === id ? { 'aria-current': 'page' as const } : {})}>
            {label}
          </button>
        ))}
      </nav>

      {current === 'kb' && <Knowledge />}
      {current === 'drive' && <Drive />}
      {current === 'aspect' && <Aspect />}
      {current === 'connectors' && <Connectors />}
      {current === 'chats' && <Chats {...(DEEP_LINK ? { initialOpen: DEEP_LINK.conversationId } : {})} />}
      {current === 'analytics' && <Analytics />}
      {current === 'install' && <Install />}
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
        ? 'Email sau parolă greșită.'
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
        <h2>Autentificare</h2>
        <label className="field">Email
          <input type="email" value={form.email} autoComplete="username" required
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">Parolă
          <input type="password" value={form.password} autoComplete="current-password" required
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="note err">{error}</p>}
        <button className="go" disabled={busy}>{busy ? 'Se verifică…' : 'Intră în cont'}</button>
      </form>
    </div>
  );
}

// ── Bază de cunoștințe ────────────────────────────────────────────────────────

interface Doc {
  id: string; filename: string; source_url: string | null;
  status: string; error_text: string | null; chunk_count: number; uploaded_at: string;
}

const STATUS: Record<string, [string, string]> = {
  indexed: ['ok', 'Indexat'],
  processing: ['wait', 'Se procesează'],
  uploaded: ['wait', 'În așteptare'],
  failed: ['void', 'Eșuat'],
};

function Stamp({ status }: { status: string }): React.ReactElement {
  const [cls, label] = STATUS[status] ?? ['wait', status];
  return <span className={`stamp ${cls}`}>{label}</span>;
}

function Knowledge(): React.ReactElement {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => get<Doc[]>('/documents').then(setDocs), []);
  useEffect(() => void load(), [load]);

  // Procesarea are loc în fundal — reîmprospătăm doar cât timp ceva chiar lucrează.
  const pending = (docs ?? []).some((x) => x.status === 'uploaded' || x.status === 'processing');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
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
        <h2>Adaugă materiale</h2>
        <div className="row">
          <input className="grow" placeholder="https://exemplu.ro/produse" value={url}
                 onChange={(e) => setUrl(e.target.value)} aria-label="Adresa paginii" />
          <button className="go" disabled={busy || !url.trim()}
                  onClick={() => void guard(async () => { await post('/documents', { url }); setUrl(''); })}>
            Adaugă pagina
          </button>
        </div>

        <div onDragOver={(e) => e.preventDefault()}
             onDrop={(e) => { e.preventDefault();
               const f = e.dataTransfer.files[0]; if (f) void guard(() => upload('/documents/upload', f)); }}
             style={{ border: '1px dashed var(--input)', borderRadius: 'calc(var(--radius) - 2px)',
                      padding: 20, textAlign: 'center', background: 'var(--muted)' }}>
          <p className="note" style={{ marginBottom: 8 }}>
            Trage aici un fișier .docx, .odt, .pdf, .md sau .html
          </p>
          <input type="file" accept=".docx,.odt,.pdf,.md,.txt,.html" style={{ width: 'auto' }}
                 aria-label="Alege fișier"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void guard(() => upload('/documents/upload', f)); }} />
        </div>

        {busy && <p className="note row"><Spinner /> Se trimite…</p>}
        {error && <p className="note err">{error}</p>}
      </section>

      <section className="sheet">
        <h2>Materiale indexate</h2>
        {!docs ? <Loading /> : (
          <div className="ledger-wrap">
            <table>
              <thead><tr><th>Sursă</th><th>Stare</th><th>Fragmente</th><th /></tr></thead>
              <tbody>
                {site.length === 0 && (
                  <tr><td colSpan={4}>
                    <p className="note">Încă nimic. Adaugă prima pagină de pe site — botul
                      va putea răspunde din ea în câteva secunde.</p>
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
                            Reîncearcă
                          </button>
                        )}
                        <button onClick={() => void guard(() => del(`/documents/${x.id}`))}>Șterge</button>
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
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
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
        <h2>Google Drive</h2>
        <p className="note">
          Dosarul nu este conectat. Conectarea se face o singură dată și cere confirmare
          în browser — cere-i acest lucru persoanei care a configurat sistemul.
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
            <h2>Dosarul cu materiale</h2>
            <p className="note">
              Ultima verificare:{' '}
              {state.lastSyncAt ? dt(state.lastSyncAt) : 'încă niciuna'}
              {' · '}verificăm și singuri la fiecare {state.everyMinutes} minute
            </p>
            {r && (
              <p className="note">
                adăugate {r.added} · actualizate {r.updated} · șterse {r.removed} ·
                neschimbate {r.unchanged}
                {r.errors.length > 0 && <span className="err"> · erori {r.errors.length}</span>}
              </p>
            )}
          </div>
          <button className="go" disabled={syncing} onClick={() => void sync()}>
            {syncing ? <><Spinner /> Se sincronizează…</> : 'Sincronizează acum'}
          </button>
        </div>

        {stalled && (
          <p className="note err">
            Sincronizarea nu s-a încheiat în 90 de secunde. Serviciul care citește dosarul
            pare oprit — anunțați persoana care a configurat sistemul.
          </p>
        )}
        {r?.errors.map((e, i) => <p key={i} className="note err">{e}</p>)}

        <p className="note">
          Puneți un fișier în dosar și apăsați <b>Sincronizează acum</b> — apare mai jos.
          Scoateți-l din dosar și botul nu îl mai folosește: așa retrageți materialele depășite.
        </p>
        {sitePages > 0 && (
          // Иначе директор решит, что бот знает только эти файлы, и начнёт
          // перезаливать в папку то, что уже есть на сайте.
          <p className="note">
            Pe lângă fișierele din dosar, botul citește și cele {sitePages} pagini
            preluate de pe site-ul dumneavoastră.
          </p>
        )}
        {(state.closedRecently ?? 0) > 0 && (
          // Ради этой строки всё и делалось: положил файл — увидел, что починил.
          <p className="note ok">
            După materialele adăugate, {state.closedRecently} întrebări la care botul
            nu știa să răspundă s-au închis. Le vedeți în <b>Analize</b>.
          </p>
        )}
        {(state.reopenedRecently ?? 0) > 0 && (
          // Обратная сторона: удаление файла должно быть видимым, иначе оно
          // выглядит бесплатным, а список пробелов молча отрастает обратно.
          <p className="note warn">
            {state.reopenedRecently} întrebări au revenit în listă: materialul din care
            botul răspundea la ele nu mai este în dosar.
          </p>
        )}
      </section>

      <section className="sheet">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Fișiere din dosar</h2>
          {failed > 0 && <span className="stamp void">{failed} necitit(e)</span>}
        </div>
        <div className="ledger-wrap">
          <table>
            <thead><tr><th>Fișier</th><th>Stare</th><th>Fragmente</th></tr></thead>
            <tbody>
              {docs.length === 0 && (
                <tr><td colSpan={3}>
                  <p className="note">
                    Dosarul este gol. Puneți în el prețuri, condiții de livrare, garanție —
                    orice răspundeți zilnic la telefon.
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
}

const COLOR_FIELDS: Array<[keyof Theme, string]> = [
  ['primary', 'Culoare principală'],
  ['bg', 'Fundalul panoului'],
  ['text', 'Textul'],
  ['userBubble', 'Replica vizitatorului'],
  ['botBubble', 'Răspunsul botului'],
];

function Aspect(): React.ReactElement {
  const [data, setData] = useState<AspectData | null>(null);
  const [locale, setLocale] = useState<Locale>('ro');
  const [saved, setSaved] = useState(false);

  useEffect(() => { void get<AspectData>('/appearance').then(setData); }, []);
  if (!data) return <Loading />;

  const patch = (next: Partial<AspectData>): void => { setData({ ...data, ...next }); setSaved(false); };
  const warnings = auditTheme(data.theme);

  const srcDoc = previewSrcDoc({
    theme: data.theme, botName: data.botName,
    welcome: data.welcomeMessage[locale] || STRINGS[locale].title,
    disclosure: data.aiDisclosureText[locale] || STRINGS[locale].disclosure,
    placeholder: STRINGS[locale].placeholder, send: STRINGS[locale].send,
  });

  return (
    <div className="split">
      <div>
        <section className="sheet stack">
          <h2>Teme gata făcute</h2>
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
          <h2>Culori</h2>
          {COLOR_FIELDS.map(([key, label]) => (
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
              Tema întunecată
            </label>
            <select id="dark" style={{ width: 190 }} value={data.theme.darkMode}
                    onChange={(e) => patch({ theme: { ...data.theme, darkMode: e.target.value as Theme['darkMode'] } })}>
              <option value="auto">după setarea vizitatorului</option>
              <option value="light">mereu deschisă</option>
              <option value="dark">mereu întunecată</option>
            </select>
          </div>
          {warnings.length > 0 && (
            <div className="stack" style={{ gap: 3 }}>
              {warnings.map((w) => <p key={w.field} className="note warn">{w.message}</p>)}
              <p className="note">
                Culoarea textului de pe buton și din replici se alege automat, așa că
                widgetul nu devine ilizibil — dar avertismentele merită rezolvate.
              </p>
            </div>
          )}
        </section>

        <section className="sheet stack">
          <h2>Texte</h2>
          <div className="row">
            <span className="note">Limba:</span>
            {(['ro', 'de', 'en', 'ru'] as Locale[]).map((l) => (
              <button key={l} className={locale === l ? 'go' : ''} onClick={() => setLocale(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="field">Numele botului
            <input value={data.botName} onChange={(e) => patch({ botName: e.target.value })} />
          </label>
          <label className="field">Mesajul de întâmpinare
            <input value={data.welcomeMessage[locale] ?? ''}
                   onChange={(e) => patch({ welcomeMessage: { ...data.welcomeMessage, [locale]: e.target.value } })} />
          </label>
          <label className="field">Textul despre inteligența artificială
            <input placeholder={STRINGS[locale].disclosure} value={data.aiDisclosureText[locale] ?? ''}
                   onChange={(e) => patch({ aiDisclosureText: { ...data.aiDisclosureText, [locale]: e.target.value } })} />
          </label>
          <p className="note">
            Mențiunea că vizitatorul discută cu o inteligență artificială este obligatorie
            prin lege (AI Act, art. 50) și nu poate fi dezactivată. Poți schimba formularea;
            câmpul gol readuce textul implicit.
          </p>
        </section>

        <div className="row">
          <button className="go" onClick={() => {
            void put('/appearance', {
              botName: data.botName, avatarUrl: data.avatarUrl, position: data.position,
              theme: data.theme, welcomeMessage: data.welcomeMessage,
              aiDisclosureText: data.aiDisclosureText,
            }).then(() => setSaved(true));
          }}>Salvează</button>
          {saved && <span className="stamp ok">Salvat</span>}
        </div>
      </div>

      <section className="sheet">
        <h2>Previzualizare</h2>
        <iframe title="Previzualizarea widgetului" srcDoc={srcDoc}
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
  const [t, setT] = useState(EMPTY_T);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [testInput, setTestInput] = useState('{"order_id":"SB-1042"}');
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const load = useCallback(
    () => get<{ connectors: Connector[]; tools: Tool[] }>('/connectors').then(setData), []);
  useEffect(() => void load(), [load]);
  if (!data) return <Loading />;

  const guard = async (fn: () => Promise<unknown>): Promise<void> => {
    setError('');
    try { await fn(); await load(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <>
      {error && <div className="sheet"><p className="note err">{error}</p></div>}

      <section className="sheet stack">
        <h2>Conector nou</h2>
        <p className="note">
          Adresa este verificată la salvare: cererile către rețele interne și către
          adresele de metadate ale furnizorului de cloud sunt respinse.
        </p>
        <label className="field">Denumire
          <input placeholder="CRM-ul companiei" value={c.name}
                 onChange={(e) => setC({ ...c, name: e.target.value })} />
        </label>
        <label className="field">Adresa de bază
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
        <label className="field">Cheia secretă
          <input type="password" placeholder="se pune în locul {{secret}}" value={c.secret}
                 onChange={(e) => setC({ ...c, secret: e.target.value })} />
        </label>
        <p className="note">
          Cheia este criptată înainte de salvare și nu mai poate fi citită înapoi —
          nici în panou, nici prin interfața de programare.
        </p>
        <button className="go" disabled={!c.name.trim() || !c.baseUrl.trim()}
                onClick={() => void guard(async () => {
                  await post('/connectors', {
                    name: c.name, baseUrl: c.baseUrl,
                    headersTemplate: c.headerName ? { [c.headerName]: c.headerValue } : {},
                    secret: c.secret,
                  });
                  setC(EMPTY_C);
                })}>Creează conectorul</button>
      </section>

      {data.connectors.map((conn) => {
        const tools = data.tools.filter((x) => x.connector_id === conn.id);
        return (
          <section key={conn.id} className="sheet stack">
            <h2>{conn.name}</h2>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="note">{conn.base_url}{conn.has_secret ? ' · cheie setată' : ''}</p>
              <button onClick={() => void guard(() => del(`/connectors/${conn.id}`))}>Șterge</button>
            </div>

            <div className="ledger-wrap">
              <table>
                <thead><tr><th>Instrument</th><th>Metodă</th><th>Cale</th><th /></tr></thead>
                <tbody>
                  {tools.length === 0 && (
                    <tr><td colSpan={4}><p className="note">Niciun instrument încă.</p></td></tr>
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
                          })}>{testing === tool.id ? 'Se testează…' : 'Testează'}</button>
                          <button onClick={() => void guard(() => del(`/tools/${tool.id}`))}>Șterge</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={() => setTarget(target === conn.id ? '' : conn.id)}>
              {target === conn.id ? 'Renunță' : 'Adaugă un instrument'}
            </button>

            {target === conn.id && (
              <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <label className="field">Numele instrumentului
                  <input placeholder="stare_comanda" value={t.toolName}
                         onChange={(e) => setT({ ...t, toolName: e.target.value })} />
                </label>
                <label className="field">Ce face
                  <input placeholder="Află starea comenzii după numărul ei" value={t.description}
                         onChange={(e) => setT({ ...t, description: e.target.value })} />
                </label>
                <p className="note">
                  Descrierea este singurul lucru după care botul decide dacă să folosească
                  instrumentul. „Află starea comenzii după numărul ei” funcționează;
                  „comenzi” nu.
                </p>
                <div className="row">
                  <select style={{ width: 120 }} value={t.httpMethod}
                          onChange={(e) => setT({ ...t, httpMethod: e.target.value })}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <input className="grow" placeholder="/orders/{order_id}" value={t.pathTemplate}
                         onChange={(e) => setT({ ...t, pathTemplate: e.target.value })} />
                </div>
                <label className="field">Parametrii
                  <textarea rows={8} value={t.schemaText}
                            onChange={(e) => setT({ ...t, schemaText: e.target.value })} />
                </label>
                <label className="field">Cum să interpreteze răspunsul
                  <input value={t.responseInstructions}
                         onChange={(e) => setT({ ...t, responseInstructions: e.target.value })} />
                </label>
                <button className="go" onClick={() => void guard(async () => {
                  let inputSchema: Record<string, unknown>;
                  try { inputSchema = JSON.parse(t.schemaText) as Record<string, unknown>; }
                  catch (err) { throw new Error(`Parametrii nu sunt corecți: ${(err as Error).message}`); }
                  await post('/tools', { ...t, connectorId: conn.id, inputSchema });
                  setT(EMPTY_T);
                })}>Salvează instrumentul</button>
              </div>
            )}
          </section>
        );
      })}

      <section className="sheet stack">
        <h2>Test</h2>
        <label className="field">Parametrii cu care se face testul
          <textarea rows={3} value={testInput} onChange={(e) => setTestInput(e.target.value)} />
        </label>
        {result && (
          <>
            <p className="note">
              HTTP {result.status ?? '—'}
              {result.truncated && ' · răspuns tăiat la 32 KB'}
              {result.error && <span className="err"> · {result.error}</span>}
            </p>
            <p className="note">Răspunsul brut al serviciului:</p>
            <pre>{result.raw || '(gol)'}</pre>
            <p className="note">Ce vede botul din el:</p>
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

function Chats({ initialOpen }: { initialOpen?: string }): React.ReactElement {
  const [f, setF] = useState(EMPTY_F);
  const [data, setData] = useState<{ rows: Conv[]; total: number } | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
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

  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set('limit', String(PER));
    p.set('offset', String(page * PER));
    setData(null);
    void get<{ rows: Conv[]; total: number }>(`/conversations?${p}`).then(setData);
  }, [params, page]);

  useEffect(() => {
    setEditing(null);
    setSaved(new Set());
    if (open) void get<Detail>(`/conversations/${open}`).then(setDetail);
    else setDetail(null);
  }, [open]);

  if (open) {
    return (
      <>
        <div className="row" style={{ marginBottom: 14 }}>
          <button onClick={() => setOpen(null)}>← Înapoi la listă</button>
        </div>
        {!detail ? <Loading /> : (
          <>
            {detail.lead && (
              <section className="sheet stack">
                <h2>Cerere de ofertă</h2>
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
                        <tr><td><p className="note">Doar datele de contact.</p></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {detail.gaps.length > 0 && (
              <section className="sheet stack">
                <h2>Nu s-a găsit în materiale</h2>
                {detail.gaps.map((g, i) => <p key={i} className="note warn">{g.question}</p>)}
              </section>
            )}
            <section className="sheet stack">
              <h2>Conversația</h2>
              {detail.messages.map((t, i) => {
                // Вопрос берётся из ближайшей реплики посетителя выше: правят
                // ответ, но утверждают пару, иначе искать его будет не по чему.
                const asked = detail.messages.slice(0, i)
                  .reverse().find((m) => m.role === 'user')?.content ?? '';
                const editable = t.role !== 'user' && asked !== '';
                return (
                  <div key={i} className="turn">
                    <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                      <span className="note">
                        {t.role === 'user' ? 'Vizitator' : 'Bot'} · {dt(t.created_at)}
                        {t.tool_calls ? ' · a folosit un instrument' : ''}
                      </span>
                      {editable && editing !== i && (
                        saved.has(i)
                          ? <span className="stamp ok">Aprobat</span>
                          : <button onClick={() => {
                              setEditing(i); setDraft(t.content); setAsk(asked); setErr('');
                            }}>Corectează răspunsul</button>
                      )}
                    </div>

                    {editing === i ? (
                      <div className="stack" style={{ gap: 10 }}>
                        {/* Вопрос правится вместе с ответом: посетитель мог спросить
                            «а в Клуж?» — утверждать ответ на такую формулировку
                            бессмысленно, по ней потом ничего не найдётся. */}
                        <label className="field">Întrebarea la care răspunde
                          <input value={ask} onChange={(e) => setAsk(e.target.value)} />
                        </label>
                        <label className="field">Răspunsul pe care îl aprobați
                          <textarea rows={5} value={draft}
                                    onChange={(e) => setDraft(e.target.value)} />
                        </label>
                        <p className="note">
                          Botul va folosi acest text cuvânt cu cuvânt când cineva întreabă
                          același lucru, chiar dacă în materiale scrie altceva.
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
                          }}>{busy ? 'Se salvează…' : 'Aprobă răspunsul'}</button>
                          <button onClick={() => setEditing(null)}>Renunță</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{t.content}</div>
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
        <h2>Filtre</h2>
        <div className="row">
          <label className="field">De la
            <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="field">Până la
            <input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <label className="field">Limba
            <select style={{ width: 150 }} value={f.locale} onChange={(e) => set({ locale: e.target.value })}>
              <option value="">toate</option>
              {['ro', 'de', 'en', 'ru'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Caută în text
          <input placeholder="rate, garanție, livrare…" value={f.q}
                 onChange={(e) => set({ q: e.target.value })} />
        </label>
        <div className="row">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={f.hasLead}
                   onChange={(e) => set({ hasLead: e.target.checked })} /> cu cerere de ofertă
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={f.hasGap}
                   onChange={(e) => set({ hasGap: e.target.checked })} /> cu întrebări fără răspuns
          </label>
          <button onClick={() => { setF(EMPTY_F); setPage(0); }}>Resetează</button>
        </div>
        <div className="row">
          <span className="note">Descarcă ce vezi acum:</span>
          <a href={exportUrl('conversation')}><button>Pe conversații</button></a>
          <a href={exportUrl('message')}><button>Pe replici</button></a>
        </div>
        <p className="note">
          „Pe conversații” — un rând per discuție, cu cererea de ofertă și numărul de goluri;
          pentru situația de ansamblu. „Pe replici” — fiecare mesaj separat; pentru a citi
          și a marca unde botul a răspuns greșit.
        </p>
      </section>

      <section className="sheet">
        <h2>Conversații{data ? ` · ${data.total}` : ''}</h2>
        {!data ? <Loading /> : (
          <div className="ledger-wrap">
            <table>
              <thead>
                <tr><th>Început</th><th>Prima întrebare</th><th>Lb.</th><th>Replici</th>
                  <th>Ofertă</th><th>Goluri</th><th /></tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={7}><p className="note">
                    Nicio conversație pentru filtrele alese.</p></td></tr>
                )}
                {data.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="quiet">{dt(c.started_at)}</td>
                    <td>{c.first_question?.slice(0, 72) ?? '—'}</td>
                    <td className="quiet">{c.locale.toUpperCase()}</td>
                    <td className="num">{c.message_count}</td>
                    <td>{c.has_lead ? <span className="stamp lead">Ofertă</span> : ''}</td>
                    <td>{c.gap_count > 0 ? <span className="stamp wait">{c.gap_count}</span> : ''}</td>
                    <td><button onClick={() => setOpen(c.id)}>Deschide</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && data.total > PER && (
        <div className="row">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Înapoi</button>
          <span className="note">
            {page * PER + 1}–{Math.min((page + 1) * PER, data.total)} din {data.total}
          </span>
          <button disabled={(page + 1) * PER >= data.total}
                  onClick={() => setPage(page + 1)}>Înainte</button>
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
                 notified_at: string | null; notify_error: string | null }>;
  notifyEmail?: string;
  quota: { plan: string; cap: number | null; usedThisMonth: number };
}

interface Approved {
  id: string; question: string; answer: string; updated_at: string;
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
        <h2>Consum</h2>
        <div className="row" style={{ gap: 40 }}>
          <p className="figure">{d2.quota.usedThisMonth}<small>mesaje luna aceasta</small></p>
          {d2.quota.cap !== null && (
            <p className="figure">{d2.quota.cap}<small>incluse în plan</small></p>
          )}
          <p className="figure">{total}<small>în ultimele 30 de zile</small></p>
        </div>
      </section>

      <section className="sheet">
        <h2>Întrebări fără răspuns</h2>
        <p className="note" style={{ padding: '0 0 12px' }}>
          Exact temele care lipsesc din materiale. Cel mai scurt drum spre un bot mai bun
          este să adaugi un document despre primele rânduri din listă.
        </p>
        <div className="ledger-wrap">
          <table>
            <thead><tr><th>Întrebare</th><th>De câte ori</th><th>Ultima dată</th></tr></thead>
            <tbody>
              {d2.unanswered.length === 0 && (
                <tr><td colSpan={3}><p className="note">
                  Toate întrebările și-au găsit răspunsul în materiale.</p></td></tr>
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
          <h2>Închise după completarea materialelor</h2>
          <p className="note" style={{ padding: '0 0 12px' }}>
            Verificăm lista singuri de fiecare dată când adăugați ceva în dosar.
            Citiți răspunsurile: dacă unul nu vă convine, adăugați un material mai clar
            despre acel subiect.
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
          <h2>Răspunsuri aprobate de dumneavoastră</h2>
          <p className="note" style={{ padding: '0 0 12px' }}>
            La aceste întrebări botul răspunde exact cu textul de mai jos, cuvânt cu cuvânt,
            indiferent ce scrie în materiale. Le creați din <b>Conversații</b>, corectând
            un răspuns al botului.
          </p>
          <div className="stack" style={{ gap: 16 }}>
            {approved.map((a) => (
              <div key={a.id} className="qa">
                <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <b>{a.question}</b>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="when">{d(a.updated_at)}</span>
                    <button onClick={() => void del(`/approved/${a.id}`).then(loadApproved)}>
                      Șterge
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
        <h2>Cereri de ofertă</h2>
        <NotifyEmail initial={d2.notifyEmail ?? ''} />
        <div className="ledger-wrap">
          <table>
            <thead><tr><th>Când</th><th>Nume</th><th>Email</th><th>Telefon</th><th>Cererea</th></tr></thead>
            <tbody>
              {d2.leads.length === 0 && (
                <tr><td colSpan={5}><p className="note">Nicio cerere încă.</p></td></tr>
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
                  <td>{l.name}</td><td>{l.email}</td>
                  <td className="quiet">{l.phone}</td><td>{l.note}</td>
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
      <label className="field" htmlFor="notify-email">Trimitem fiecare cerere pe</label>
      <div className="row">
        <input id="notify-email" type="email" value={value} placeholder="vanzari@exemplu.ro"
               style={{ flex: 1, minWidth: 200, maxWidth: 420 }}
               onChange={(e) => { setValue(e.currentTarget.value); setSaved(false); setErr(''); }} />
        <button className="go" onClick={() => {
          void put<{ error?: string }>('/lead-notify', { email: value })
            .then((r) => (r.error ? setErr(r.error) : setSaved(true)))
            .catch((e: Error) => setErr(e.message));
        }}>Salvează</button>
        {saved && <span className="stamp ok">Salvat</span>}
      </div>
      {err && <p className="note err">{err}</p>}
      <p className="note">
        Anunțul pleacă la două minute după ce vizitatorul lasă un contact — atât cât
        îi ia asistentului să afle și restul detaliilor. Câmpul gol oprește anunțurile;
        cererile rămân oricum aici.
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
      <div><span className="stamp ok" title={dt(lead.notified_at)}>Trimis</span></div>
    );
  }
  if (lead.notify_error) {
    return (
      <div><span className="stamp void" title={lead.notify_error}>Netrimis</span></div>
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
        <h2>Codul de instalat</h2>
        <pre>{data.snippet}</pre>
        <div className="row">
          <button onClick={() => {
            void navigator.clipboard.writeText(data.snippet).then(() => setCopied(true));
          }}>Copiază</button>
          {copied && <span className="stamp ok">Copiat</span>}
          <span className="note">Se pune înainte de eticheta &lt;/body&gt;.</span>
        </div>
      </section>

      <section className="sheet stack">
        <h2>Verifică instalarea</h2>
        <p className="note">Deschidem pagina și căutăm pe ea codul cu cheia ta.</p>
        <div className="row">
          <input className="grow" placeholder="https://exemplu.ro/" value={checkUrl}
                 onChange={(e) => setCheckUrl(e.target.value)} aria-label="Adresa paginii" />
          <button disabled={checking || !checkUrl.trim()} onClick={() => {
            setChecking(true); setVerify(null);
            void post<VerifyResult>('/install/verify', { url: checkUrl })
              .then(setVerify).finally(() => setChecking(false));
          }}>{checking ? 'Se verifică…' : 'Verifică'}</button>
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
                  {verify.scriptFound ? 'Codul widgetului a fost găsit'
                    : 'Codul widgetului nu apare pe pagină'}
                </p>
                <p className={verify.keyFound ? 'note' : 'note err'}>
                  {verify.keyFound ? 'Cheia corespunde' : 'Cheia ta nu apare pe pagină'}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="sheet stack">
        <h2>Domenii permise</h2>
        <p className="note">
          Widgetul răspunde doar pe aceste domenii — câte unul pe rând, subdomeniile
          sunt incluse automat. Lista goală înseamnă că widgetul nu funcționează nicăieri.
        </p>
        <textarea rows={4} value={draft} aria-label="Domenii permise"
                  onChange={(e) => { setDraft(e.target.value); setSaved(false); }} />
        <div className="row">
          <button className="go" onClick={() => {
            const domains = draft.split('\n').map((s) => s.trim()).filter(Boolean);
            void put<{ domains: string[] }>('/install', { domains }).then((next) => {
              setDraft(next.domains.join('\n')); setSaved(true);
            });
          }}>Salvează</button>
          {saved && <span className="stamp ok">Salvat</span>}
        </div>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
