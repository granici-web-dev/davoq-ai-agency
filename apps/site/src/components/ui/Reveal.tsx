'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    /* Нижний отступ в 10%: блок считается увиденным, когда он вошёл
       в экран заметно, а не краем в один пиксель. Иначе анимация
       начинается за пределами взгляда и человек видит уже конец. */
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
