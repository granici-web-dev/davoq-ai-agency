'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ContactForm } from './ContactForm';

/** Событие, которым любая кнопка на сайте просит открыть окно. */
export const DEMO_OPEN = 'demo:open';

/**
 * Окно с формой заявки.
 *
 * Собрано на нативном `<dialog>` с `showModal()`. Он сам удерживает фокус
 * внутри, закрывается по Escape, прячет остальную страницу от скринридера
 * и рисует подложку. Написанное вручную на `div` с `position: fixed`, всё
 * это заняло бы вдвое больше кода и первое, что бы в нём сломалось, —
 * возврат фокуса на кнопку после закрытия.
 *
 * Окно одно на весь сайт и живёт в макете. Форма, размноженная по каждой
 * кнопке, — это четыре копии одного состояния, из которых три открыты
 * одновременно.
 */
export function DemoDialog() {
  const t = useTranslations('contact.dialog');
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => {
      ref.current?.showModal();
      setOpen(true);
    };
    window.addEventListener(DEMO_OPEN, show);
    return () => window.removeEventListener(DEMO_OPEN, show);
  }, []);

  /* Прокрутку страницы за окном приходится глушить вручную: `showModal`
     делает фон неактивным, но не запрещает ему скроллиться, и на телефоне
     страница уезжает под пальцем вместо содержимого окна. */
  useEffect(() => {
    if (!open) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);

  const close = () => {
    ref.current?.close();
    setOpen(false);
  };

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      /* Клик по подложке засчитывается только если он пришёлся на сам
         `<dialog>`: его содержимое лежит во вложенном блоке, поэтому клик
         внутри формы сюда не долетает и окно не закрывается под рукой. */
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-labelledby="demo-dialog-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] bg-transparent p-0 text-chalk backdrop:bg-ink-950/80 backdrop:backdrop-blur-sm"
    >
      <div className="card max-h-[85dvh] overflow-y-auto p-7 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 id="demo-dialog-title" className="text-h3 font-medium">
              {t('title')}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-chalk-dim">{t('text')}</p>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-chalk-dim transition-colors hover:border-white/25 hover:text-chalk"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-7">
          {/* bare: внутри окна карточка в карточке выглядит вложенной
              коробкой, а рамка уже нарисована самим окном. */}
          <ContactForm bare />
        </div>
      </div>
    </dialog>
  );
}
