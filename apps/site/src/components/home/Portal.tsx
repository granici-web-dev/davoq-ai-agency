import { useTranslations } from 'next-intl';
import { DemoButton } from '@/components/ui/DemoButton';

/** Пункты слева. `soon` — того, чего ещё нет, и вид у него другой. */
interface Capability {
  key: string;
  soon?: boolean;
}

const CAPABILITIES: Capability[] = [
  { key: 'leads' },
  { key: 'offers' },
  { key: 'stats' },
  { key: 'agents' },
  { key: 'billing', soon: true },
];

/** Разделы в боковом меню макета. Первый — открытый. */
const NAV = ['leads', 'offers', 'agents', 'stats', 'billing'] as const;

/**
 * Портал.
 *
 * Крупная панель: слева — что там есть, справа — макет интерфейса, уходящий
 * за правый край. Обрез намеренный: интерфейс, целиком уместившийся в
 * картинку, выглядит маленьким, а срезанный краем — продолжающимся.
 *
 * Макет собран вёрсткой, а не сгенерирован. Причина не в экономии: в
 * сгенерированном интерфейсе текст выходит нечитаемым, и первое, что
 * увидит посетитель на скриншоте вашего продукта, — кривые буквы. Здесь
 * же он на том же шрифте, что и вся страница, и остаётся резким на любом
 * экране.
 *
 * Цифры в макете — образец экрана, а не результат клиента. Ни одного
 * процента и ни одной средней: как только в макет попадает «+38%
 * конversie», страница начинает обещать то, чего никто не мерил.
 */
export function Portal() {
  const t = useTranslations('home.portal');
  const tStatus = useTranslations('status');

  return (
    <section id="portal" className="relative px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center gap-3 border-b border-white/8 pb-5">
          <WindowIcon />
          <span className="eyebrow">{t('eyebrow')}</span>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-16">
          <h2 className="text-h1 font-medium">{t('title')}</h2>
          <p className="leading-relaxed text-chalk-dim lg:pt-3">{t('lead')}</p>
        </div>

        <div className="card relative mt-14 overflow-hidden p-7 sm:p-9">
          <span
            className="pointer-events-none absolute -top-40 -right-20 size-[30rem] rounded-full bg-aurora-cool/10 blur-3xl"
            aria-hidden
          />

          <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <div className="min-w-0">
              <h3 className="text-h3 font-medium">{t('panelTitle')}</h3>
              <p className="mt-4 max-w-md leading-relaxed text-chalk-dim">{t('panelText')}</p>

              <ul className="mt-8 flex flex-col gap-2.5">
                {CAPABILITIES.map(({ key, soon }) => (
                  <li
                    key={key}
                    className="flex items-center gap-3 rounded-pill border border-white/10 bg-white/3 py-2.5 pr-3 pl-4 text-sm"
                  >
                    <CheckIcon dim={Boolean(soon)} />
                    <span className={soon ? 'text-chalk-faint' : 'text-chalk-dim'}>
                      {t(`capabilities.${key}`)}
                    </span>
                    {soon && (
                      <span className="ml-auto rounded-pill border border-white/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                        {tStatus('soon')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <DemoButton variant="ghost">{t('cta')}</DemoButton>
              </div>
            </div>

            {/* Макет уезжает за правый и нижний край панели отрицательными
                полями и прижат к низу через self-end. Обрез с двух сторон
                читается как «окно продолжается за краем»; макет с полями
                вокруг читается как картинка, которую положили внутрь.

                Ширина задана жёстко, чтобы он обрезался, а не сжимался:
                сжатый интерфейс перестаёт быть похожим на интерфейс. */}
            {/* min-w-0 обязателен. По умолчанию колонка сетки не уже своего
                содержимого, а у макета жёстко задана ширина в 36rem —
                на телефоне он растягивал всю колонку до 576 px, и текст
                в соседних чипах уезжал под обрез панели. */}
            <div className="relative -mb-7 min-w-0 sm:-mb-9 lg:-mr-9 lg:self-end">
              <PortalMock />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Макет портала.
 *
 * `aria-hidden`: для скринридера это картинка, а не таблица, по которой
 * можно ходить. Всё, что она сообщает, уже сказано списком слева.
 */
function PortalMock() {
  const t = useTranslations('home.portal.mock');

  const rows = [
    { id: '1042', item: t('rows.a'), state: 'sent' as const, time: '2 min' },
    { id: '1041', item: t('rows.b'), state: 'open' as const, time: '18 min' },
    { id: '1039', item: t('rows.c'), state: 'sent' as const, time: '1 h' },
    { id: '1037', item: t('rows.d'), state: 'open' as const, time: '3 h' },
  ];

  return (
    <div
      aria-hidden
      className="flex min-w-[36rem] overflow-hidden rounded-t-xl border border-b-0 border-white/10 bg-ink-900 text-[11px]"
    >
      <aside className="hidden w-40 shrink-0 border-r border-white/8 p-3 sm:block">
        <p className="flex items-center gap-2 px-2 py-1.5 font-mono text-[10px] tracking-wider text-chalk-dim uppercase">
          <span className="size-1.5 rounded-full bg-aurora-warm" />
          {t('brand')}
        </p>
        <ul className="mt-4 flex flex-col gap-0.5">
          {NAV.map((key, i) => (
            <li
              key={key}
              className={`rounded-lg px-2 py-1.5 ${
                i === 0 ? 'bg-white/6 text-chalk' : 'text-chalk-faint'
              }`}
            >
              {t(`nav.${key}`)}
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-chalk">{t('nav.leads')}</p>
          <span className="rounded-pill border border-white/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('range')}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-white/8">
          {(['requests', 'offers', 'inProgress'] as const).map((key, i) => (
            <div key={key} className="bg-ink-900 px-3 py-3">
              <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {t(`tiles.${key}`)}
              </p>
              <p className="mt-1.5 text-lg text-chalk tabular-nums">{[24, 9, 15][i]}</p>
            </div>
          ))}
        </div>

        <ul className="mt-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 border-t border-white/8 py-2.5 first:border-t-0"
            >
              <span className="font-mono text-chalk-faint tabular-nums">#{row.id}</span>
              <span className="min-w-0 flex-1 truncate text-chalk-dim">{row.item}</span>
              <span
                className={`shrink-0 rounded-pill border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
                  row.state === 'sent'
                    ? 'border-aurora-warm/30 text-chalk'
                    : 'border-white/10 text-chalk-faint'
                }`}
              >
                {t(`states.${row.state}`)}
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-chalk-faint tabular-nums">
                {row.time}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CheckIcon({ dim }: { dim: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`shrink-0 ${dim ? 'text-chalk-faint/50' : 'text-aurora-warm'}`}
    >
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WindowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-chalk-faint">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" />
      <path d="M1.5 6h13M6 6v7.5" stroke="currentColor" />
    </svg>
  );
}
