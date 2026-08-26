'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';


/**
 * Просит ли человек обойтись без движения.
 *
 * Через `useSyncExternalStore`, а не через эффект с `setState`: медиа-запрос —
 * это внешний источник, а не производное состояние. На сервере снимок всегда
 * `false`, что совпадает с разметкой, поэтому расхождения при гидратации не
 * возникает; читать `matchMedia` прямо в инициализаторе `useState` его как раз
 * и создало бы, ведь от ответа зависит атрибут в разметке.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/**
 * Проявление при прокрутке.
 *
 * Скрытое состояние стоит прямо в разметке, а не навешивается после
 * монтирования: навесить его позже — значит показать содержимое, тут же
 * спрятать и показать снова. Такое мигание видно на первом же экране.
 *
 * Цена этого решения — при выключенном JavaScript страница осталась бы
 * пустой. Поэтому в разметке лежит `<noscript>`, который отменяет скрытие
 * целиком. Оно же отменяется при `prefers-reduced-motion`.
 *
 * Наблюдатель отключается после первого срабатывания: секция, которая
 * заново прячется при прокрутке вверх, превращает чтение в аттракцион.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  /** Задержка в миллисекундах — для соседних блоков в одном ряду. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [seen, setSeen] = useState(false);
  const shown = seen || reduced;

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;

    /* Нижний отступ в 10%: блок считается увиденным, когда он вошёл
       в экран заметно, а не краем в один пиксель. Иначе анимация
       начинается за пределами взгляда и человек видит уже конец. */
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // `shown` в зависимостях намеренно: когда блок показан, уборка отключает
    // наблюдателя, а повторный проход выходит сразу. Наблюдать больше нечего.
  }, [shown]);

  return (
    <div
      ref={ref}
      className="reveal"
      data-state={shown ? 'shown' : 'hidden'}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
