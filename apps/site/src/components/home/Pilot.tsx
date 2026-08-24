import { useTranslations } from 'next-intl';

/** Порядок — от того, что клиент видит первым, к тому, чего не видит вовсе. */
const RUNNING = ['chatbot', 'configurator', 'offer', 'isolation'] as const;
const FACTS = ['industry', 'showrooms', 'status'] as const;

/**
 * Пилотная программа.
 *
 * Эта секция стоит на месте, где у всех остальных логотипы клиентов, отзывы
 * и «300+ команд доверяют нам». Ничего этого нет, и выдумывать нельзя:
 * первый же настоящий разговор с клиентом это вскроет.
 *
 * Поэтому здесь только проверяемое — что именно работает у пилотного клиента
 * прямо сейчас. Ни одного показателя, ни одного процента: сказать «подняли
 * конверсию на 40%» было бы ровно тем враньём, ради отказа от которого
 * секция и написана. Единственное число на экране — три шоурума.
 *
 * Визуально это сводка состояния, а не карточки и не список: раздел
 * отвечает на вопрос «что у вас работает сегодня», и вид приборной панели
 * отвечает на него раньше, чем прочитан первый заголовок.
 */
export function Pilot() {
  const t = useTranslations('home.pilot');

  return (
    <section id="pilot" className="relative px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="mt-6 max-w-3xl text-h2 font-medium">{t('title')}</h2>
        <p className="mt-6 max-w-xl leading-relaxed text-chalk-dim">{t('lead')}</p>

        {/* Паспорт пилота. Мелкий mono-лейбл над значением — так подписывают
            факты, а не рекламируют их.

            Разделители меняют направление вместе с сеткой: на телефоне
            колонки становятся строками, и вертикальная линия между ними
            превратилась бы в линию поперёк ничего. */}
        <dl className="mt-14 grid overflow-hidden rounded-card border border-white/8 divide-y divide-white/8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {FACTS.map((key) => (
            <div key={key} className="px-6 py-5">
              <dt className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                {t(`facts.${key}.label`)}
              </dt>
              <dd className="mt-1.5 text-chalk">{t(`facts.${key}.value`)}</dd>
            </div>
          ))}
        </dl>

        {/* Волосяные линии сделаны зазором в один пиксель поверх светлого
            фона списка, а не рамками ячеек: рамки на стыке удваиваются
            и дают линию в два пикселя, заметную именно там, где её быть
            не должно. */}
        <ul className="mt-4 grid gap-px overflow-hidden rounded-card border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-4">
          {RUNNING.map((key) => (
            <li key={key} className="bg-ink-950 px-6 py-7">
              <span className="flex items-center gap-2.5">
                <span
                  className="size-1.5 shrink-0 rounded-full bg-aurora-warm shadow-[0_0_8px_var(--color-aurora-warm)]"
                  aria-hidden
                />
                <span className="font-mono text-[10px] tracking-wider text-chalk-faint uppercase">
                  {t('liveLabel')}
                </span>
              </span>
              <h3 className="mt-4 font-medium">{t(`running.${key}.title`)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-chalk-dim">
                {t(`running.${key}.text`)}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-2xl border-l-2 border-aurora-warm/40 pl-5 leading-relaxed text-chalk-dim">
          {t('honesty')}
        </p>
      </div>
    </section>
  );
}
