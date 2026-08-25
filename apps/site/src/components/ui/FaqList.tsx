'use client';

import { useTranslations } from 'next-intl';

/**
 * Список вопросов и ответов.
 *
 * Собран на `<details>`, а не на состоянии React. Браузер уже умеет
 * раскрывать такие блоки, водить по ним клавиатурой и объявлять
 * скринридеру, раскрыт ли текущий, — а ответы при этом лежат в разметке
 * всегда, и поисковик видит их без выполнения скриптов.
 *
 * Вынесен в общий компонент: тот же список стоит на главной и на каждой
 * странице агента. Написанный дважды, он к третьей странице разъезжается
 * по отступам, а плюсик начинает поворачиваться в разные стороны.
 */
export function FaqList({ namespace, count }: { namespace: string; count: number }) {
  const t = useTranslations(namespace);

  return (
    <div className="border-t border-white/8">
      {Array.from({ length: count }, (_, i) => (
        <details key={i} className="group border-b border-white/8">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 text-chalk transition-colors hover:text-chalk-dim [&::-webkit-details-marker]:hidden">
            <span className="text-h3 font-medium">{t(`${i}.q`)}</span>
            {/* Плюс, который поворачивается в минус. Стрелка на тёмном
                в мелком кегле теряется, а перекрестье видно всегда. */}
            <span className="relative mt-2 size-3.5 shrink-0 text-chalk-faint">
              <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-current" />
              <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
            </span>
          </summary>
          <p className="max-w-2xl pb-7 leading-relaxed text-chalk-dim">{t(`${i}.a`)}</p>
        </details>
      ))}
    </div>
  );
}
