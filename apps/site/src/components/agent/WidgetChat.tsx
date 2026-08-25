import { useTranslations } from 'next-intl';

interface DialogLine {
  role: 'agent' | 'client';
  text: string;
}

/**
 * Разговор в окне виджета.
 *
 * Именно виджет, а не телефон и не окно браузера: продукт живёт на сайте
 * клиента в этой форме, и показывать надо её. Телефон говорил бы «это
 * приложение», а приложения мы не продаём.
 *
 * Под окном — кружок запуска. Он и делает из панели виджет: без него это
 * просто карточка с перепиской, с ним сразу видно, откуда она берётся и
 * что на сайте в закрытом виде это одна кнопка в углу.
 *
 * Собрано вёрсткой, а не снято скриншотом и не сгенерировано. Снимок
 * настоящего экрана пришлось бы переснимать на каждую правку реплики
 * и отдельно для английской версии, а в сгенерированной картинке
 * интерфейса текст выходит нечитаемым.
 *
 * Список не скрыт от скринридера. Это не украшение, а самое содержательное
 * место страницы — но перед ним идёт невидимая подпись, иначе человек
 * услышит чужой диалог без объяснения, откуда он взялся.
 */
export function WidgetChat({ namespace }: { namespace: string }) {
  const t = useTranslations(namespace);
  const dialog = t.raw('dialog') as DialogLine[];

  return (
    <div className="relative mx-auto w-[22rem] max-w-full">
      {/* Свечение под окном. Виджет, лежащий на чёрном без него,
          выглядит вырезанным из другой картинки. */}
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      <div className="flex h-[30rem] flex-col overflow-hidden rounded-2xl border border-white/12 bg-ink-900 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.85)]">
        <div className="flex items-center gap-3 border-b border-white/8 bg-white/3 px-4 py-3.5">
          {/* Кружок с инициалом вместо аватара: у агента нет лица, и
              рисовать ему лицо значит обещать человека на том конце. */}
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-aurora-warm/30 to-aurora-warm/10 font-mono text-[11px] text-chalk"
            aria-hidden
          >
            {t('widgetInitial')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-chalk">{t('widgetTitle')}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-chalk-faint">
              <span
                className="size-1.5 rounded-full bg-aurora-warm shadow-[0_0_6px_var(--color-aurora-warm)]"
                aria-hidden
              />
              {t('widgetStatus')}
            </span>
          </span>
          <span className="shrink-0 text-chalk-faint" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        {/* Верхняя кромка растворяется: переписка, начинающаяся ровно
            под шапкой, выглядит начатой сию секунду, а она идёт. */}
        <ul className="flex flex-1 flex-col justify-end gap-2.5 overflow-hidden px-4 pb-4 [mask-image:linear-gradient(to_bottom,transparent,#000_3rem)]">
          <li className="sr-only">{t('conversationNote')}</li>
          {dialog.map((line, i) => (
            <li key={i} className={line.role === 'agent' ? 'mr-6' : 'ml-6 flex justify-end'}>
              <p
                className={
                  line.role === 'agent'
                    ? 'rounded-2xl rounded-bl-md border border-white/10 bg-white/6 px-3.5 py-2.5 text-[13px] leading-relaxed text-chalk'
                    : 'rounded-2xl rounded-br-md bg-chalk px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-950'
                }
              >
                {line.text}
              </p>
            </li>
          ))}
        </ul>

        {/* Строка ввода. Не работает и не должна: без неё окно читается
            как картинка переписки, а не как открытый чат. */}
        <div className="border-t border-white/8 px-4 py-3.5" aria-hidden>
          <div className="flex items-center justify-between gap-3 rounded-pill border border-white/10 bg-white/3 px-4 py-2.5">
            <span className="text-[13px] text-chalk-faint">{t('widgetPlaceholder')}</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-chalk-faint">
              <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Кнопка запуска — то, что видно на сайте, когда окно закрыто. */}
      <div className="mt-4 flex justify-end" aria-hidden>
        <span className="flex size-14 items-center justify-center rounded-full border border-white/12 bg-linear-to-b from-white/12 to-white/4 shadow-[0_12px_28px_rgb(0_0_0/0.6)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-chalk">
            <path
              d="M4.5 5.5h15a1 1 0 011 1v8a1 1 0 01-1 1H10l-4.5 3.5V15.5h-1a1 1 0 01-1-1v-8a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
