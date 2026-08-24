import { useTranslations } from 'next-intl';

interface DialogLine {
  role: 'agent' | 'client';
  text: string;
}

/**
 * Разговор в рамке телефона.
 *
 * Собран вёрсткой, а не снят скриншотом и не сгенерирован. Причина та же,
 * что и у макета портала: в сгенерированной картинке интерфейса текст
 * выходит нечитаемым, а снимок настоящего экрана пришлось бы переснимать
 * на каждую правку реплики и заново — для английской версии.
 *
 * Телефон, а не окно браузера: больше половины разговоров с агентом
 * начинаются с телефона, и показывать надо тот экран, на котором это
 * происходит.
 *
 * Список не скрыт от скринридера. Это не украшение, а самое содержательное
 * место страницы — но перед ним идёт невидимая подпись, иначе человек
 * услышит чужой диалог без объяснения, откуда он взялся.
 */
export function PhoneChat({ namespace }: { namespace: string }) {
  const t = useTranslations(namespace);
  const dialog = t.raw('dialog') as DialogLine[];

  return (
    <div className="relative mx-auto w-[19rem] max-w-full">
      {/* Свечение под корпусом. Телефон, лежащий на чёрном без него,
          выглядит вырезанным из другой картинки. */}
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-aurora-warm/8 blur-3xl"
        aria-hidden
      />

      {/* Корпус: две рамки одна в другой. Одна дала бы экран, наклеенный
          на прямоугольник; вторая — толщину, из-за которой это читается
          как предмет. */}
      <div className="rounded-[2.75rem] border border-white/12 bg-linear-to-b from-white/10 to-white/3 p-2.5 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)]">
        <div className="flex h-[34rem] flex-col overflow-hidden rounded-[2.25rem] border border-white/8 bg-ink-950">
          <div className="flex items-center gap-2.5 border-b border-white/8 px-5 py-4">
            <span
              className="size-1.5 rounded-full bg-aurora-warm shadow-[0_0_8px_var(--color-aurora-warm)]"
              aria-hidden
            />
            <span className="font-mono text-[10px] tracking-wider text-chalk-dim uppercase">
              {t('phoneHeader')}
            </span>
          </div>

          {/* Верхняя кромка растворяется: переписка, начинающаяся ровно
              под шапкой, выглядит начатой сию секунду, а она идёт. */}
          <ul className="flex flex-1 flex-col justify-end gap-2.5 overflow-hidden px-4 pb-4 [mask-image:linear-gradient(to_bottom,transparent,#000_3rem)]">
            <li className="sr-only">{t('conversationNote')}</li>
            {dialog.map((line, i) => (
              <li key={i} className={line.role === 'agent' ? 'mr-5' : 'ml-5 flex justify-end'}>
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

          {/* Строка ввода. Не работает и не должна: без неё экран
              читается как картинка переписки, а не как открытый чат. */}
          <div className="border-t border-white/8 px-4 py-3.5" aria-hidden>
            <div className="flex items-center justify-between gap-3 rounded-pill border border-white/10 bg-white/3 px-4 py-2.5">
              <span className="text-[13px] text-chalk-faint">{t('phonePlaceholder')}</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-chalk-faint">
                <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
