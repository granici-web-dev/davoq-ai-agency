import { Link } from '@/i18n/routing';

/**
 * Кнопка-ссылка.
 *
 * Отдельный компонент, а не набор классов на месте: главная кнопка сайта
 * встречается в шапке, в герое, в конце каждой страницы и в тарифах.
 * Написанная заново в пяти местах, она к пятому разъезжается по радиусу
 * и высоте — и это видно даже тому, кто не знает, почему.
 *
 * Вариантов ровно два. Третий понадобился бы, только если бы на экране
 * стояли три равнозначных действия, а это уже не выбор, а меню.
 */
export function Cta({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  href: string;
  variant?: 'primary' | 'ghost';
  /** `sm` — только для шапки, где кнопка стоит в одной строке с пунктами меню. */
  size?: 'md' | 'sm';
  className?: string;
  children: React.ReactNode;
}) {
  const base =
    'inline-flex items-center justify-center rounded-pill text-sm font-medium transition-all duration-200';
  const padding = size === 'sm' ? 'px-5 py-2.5' : 'px-6 py-3.5';

  /* Главная кнопка — белая заливка, не акцентный цвет. Акценты на этом
     сайте живут только в свете и градиентах; как только янтарь становится
     заливкой кнопки, он перестаёт быть светом и делается краской. */
  const styles =
    variant === 'primary'
      ? 'bg-chalk text-ink-950 hover:scale-[1.03] hover:bg-white'
      : 'border border-white/12 text-chalk backdrop-blur-sm hover:border-white/25 hover:bg-white/5';

  return (
    <Link href={href} className={`${base} ${padding} ${styles} ${className}`}>
      {children}
    </Link>
  );
}
