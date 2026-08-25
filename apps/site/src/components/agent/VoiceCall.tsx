import { useTranslations } from 'next-intl';

interface Row {
  k: string;
  v: string;
}

/**
 * Звонок после того, как он закончился.
 *
 * Разговор в первом экране уже занят чат-ботом, и второй пузырьковый
 * диалог читался бы как тот же агент. Но у телефонного звонка есть то,
 * чего у переписки нет вовсе: он звучит. Осциллограмма — единственная
 * форма на сайте, которая может принадлежать только голосу, и она
 * говорит «это телефон» раньше любого заголовка.
 *
 * Показан не идущий звонок, а закончившийся: у телефона ценность не в
 * том, что кто-то поднял трубку, а в том, что осталось после. Поэтому
 * ниже — не реплики, а результат: что человек хотел и на что записан.
 *
 * Время в шапке — 19:42, и это половина смысла карточки. Тот же
 * разговор в рабочие часы провёл бы и человек.
 *
 * Собрано вёрсткой, как и остальные макеты интерфейса на сайте.
 */

/**
 * Высоты столбиков осциллограммы, в долях.
 *
 * Заданы списком, а не случайным числом: `Math.random()` на сервере и
 * в браузере даст разные картинки, и React пожалуется на расхождение
 * разметки. К тому же «случайная» осциллограмма выходит ровным шумом,
 * а речь — это всплески и паузы между ними.
 */
const WAVE = [
  0.2, 0.35, 0.5, 0.38, 0.62, 0.85, 0.7, 0.45, 0.3, 0.22, 0.15, 0.28, 0.44, 0.66, 0.92, 0.78,
  0.55, 0.34, 0.2, 0.14, 0.24, 0.4, 0.58, 0.8, 1, 0.72, 0.5, 0.32, 0.18, 0.26, 0.42, 0.6, 0.74,
  0.52, 0.36, 0.24, 0.16, 0.3, 0.48, 0.64, 0.4, 0.26, 0.18, 0.12,
];

export function VoiceCall({ namespace }: { namespace: string }) {
  const t = useTranslations(`${namespace}.call`);
  const rows = t.raw('rows') as Row[];

  return (
    <div className="relative mx-auto w-[24rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="flex items-center gap-2.5 text-sm text-chalk">
            <PhoneIcon />
            {t('title')}
          </span>
          <span className="font-mono text-[11px] tracking-wider text-chalk-faint tabular-nums">
            {t('time')}
          </span>
        </div>

        <div className="border-b border-white/8 px-6 py-5">
          <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('fromLabel')}
          </p>
          <p className="mt-1 font-mono text-sm text-chalk-dim tabular-nums">{t('from')}</p>

          {/* Осциллограмма — картинка, а не данные: скринридеру она не
              нужна, и подписи у неё нет. Длительность рядом словами. */}
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden>
              {WAVE.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full bg-aurora-warm/55"
                  style={{ height: `${Math.round(h * 100)}%` }}
                />
              ))}
            </div>
            <span className="shrink-0 font-mono text-[11px] text-chalk-faint tabular-nums">
              {t('duration')}
            </span>
          </div>
        </div>

        <dl className="divide-y divide-white/8">
          {rows.map((row) => (
            <div key={row.k} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 px-6 py-3.5">
              <dt className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {row.k}
              </dt>
              <dd className="text-sm leading-relaxed text-chalk">{row.v}</dd>
            </div>
          ))}
        </dl>

        {/* Ради этой строки карточка и нарисована: звонок пришёл, когда
            в офисе никого не было, и всё равно стал записью в календаре,
            а не пропущенным вызовом. */}
        <div className="border-t border-white/8 bg-aurora-warm/6 px-6 py-4">
          <p className="font-mono text-[10px] tracking-wider text-aurora-warm uppercase">
            {t('afterLabel')}
          </p>
          <p className="mt-1.5 text-sm text-chalk">{t('after')}</p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('note')}</p>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-aurora-warm"
    >
      <path d="M8.4 4.5H5.6a2 2 0 00-2 2.2c.4 3.6 2 7 4.6 9.6s6 4.2 9.6 4.6a2 2 0 002.2-2v-2.8a1.4 1.4 0 00-1.2-1.4l-2.7-.4a1.4 1.4 0 00-1.3.6l-1 1.4a12.6 12.6 0 01-5-5l1.4-1a1.4 1.4 0 00.6-1.3l-.4-2.7a1.4 1.4 0 00-1.4-1.2z" />
    </svg>
  );
}
