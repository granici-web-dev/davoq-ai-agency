import { useTranslations } from 'next-intl';

interface Entry {
  time: string;
  agent: string;
  text: string;
}

/** Час и минуты → доля суток. Из неё считается положение отметки на полосе. */
function dayFraction(time: string) {
  const [h, m] = time.split(':').map(Number);
  return (h * 60 + m) / 1440;
}

/** Ночь — до семи утра и после девяти вечера. Такие события подсвечены. */
const isNight = (time: string) => {
  const f = dayFraction(time);
  return f < 7 / 24 || f > 21 / 24;
};

/**
 * День в мастерской.
 *
 * Раньше это был просто список строк со временем. Список не показывает
 * главного — что события идут ВОКРУГ суток; чтобы это понять, приходилось
 * читать колонку цифр и складывать её в голове.
 *
 * Теперь сверху полоса суток: тёмная по краям, светлеющая к середине дня,
 * с отметками там, где что-то произошло. Отметка в 22:14 стоит в тёмной
 * части, и вопрос «а кто отвечает вечером» отпадает раньше, чем возникает.
 *
 * Виджет чат-бота, стоявший здесь до этого, сужал страницу до одного
 * агента, хотя ниже она предлагает четверых. Лента показывает набор.
 */
export function AgentDay({ namespace }: { namespace: string }) {
  const t = useTranslations(namespace);
  const entries = t.raw('day.entries') as Entry[];

  return (
    <div className="relative mx-auto w-[24rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/3 px-6 py-4">
          <span className="text-sm text-chalk">{t('day.title')}</span>
          <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('day.label')}
          </span>
        </div>

        {/* Полоса суток. Ночь по краям — не украшение: она превращает
            колонку цифр в картину, где видно, что половина событий
            приходится на время, когда мастерская закрыта. */}
        <div className="border-b border-white/8 px-6 pt-5 pb-4" aria-hidden>
          <p className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
            {t('day.scale')}
          </p>

          <div className="relative mt-3 h-1.5 rounded-pill bg-linear-to-r from-aurora-cool/25 via-aurora-warm/25 to-aurora-cool/25">
            {entries.map((entry) => (
              /* Ночная отметка янтарная — тем же цветом, что и строка
                 ниже. Иначе полоса и список живут отдельно, и связь
                 между отметкой и событием приходится искать. */
              <span
                key={entry.time}
                className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  isNight(entry.time)
                    ? 'bg-aurora-warm shadow-[0_0_10px_var(--color-aurora-warm)]'
                    : 'bg-chalk shadow-[0_0_8px_rgb(255_255_255/0.5)]'
                }`}
                style={{ left: `${dayFraction(entry.time) * 100}%` }}
              />
            ))}
          </div>

          <div className="mt-2 flex justify-between font-mono text-[9px] text-chalk-faint tabular-nums">
            {['00', '06', '12', '18', '24'].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
        </div>

        <ol className="divide-y divide-white/8">
          {entries.map((entry, i) => {
            const night = isNight(entry.time);
            return (
              <li
                key={i}
                className={`grid grid-cols-[3.5rem_1fr] gap-4 px-6 py-4 ${
                  night ? 'bg-aurora-warm/4' : ''
                }`}
              >
                <span className="flex items-baseline gap-1.5 pt-0.5 font-mono text-[11px] text-chalk-faint tabular-nums">
                  {/* Точка у ночных строк — та же, что на полосе выше.
                      Так видно, какая отметка какой строке принадлежит. */}
                  {night && (
                    <span
                      className="size-1 shrink-0 translate-y-[-2px] rounded-full bg-aurora-warm"
                      aria-hidden
                    />
                  )}
                  {entry.time}
                </span>
                <span>
                  <span className="block font-mono text-[10px] tracking-wider text-chalk-dim uppercase">
                    {entry.agent}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-chalk">
                    {entry.text}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-chalk-faint">{t('day.note')}</p>
    </div>
  );
}
