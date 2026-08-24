import type { ReactNode } from 'react';

/**
 * Шапка секции продуктовой страницы.
 *
 * Лейбл над линейкой, заголовок слева, лид справа — тот же приём, что
 * в секциях индустрий и портала на главной. Повторён здесь намеренно:
 * страница агента должна читаться как та же система, а не как отдельный
 * сайт, случайно оказавшийся по соседству.
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  icon,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  icon?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/8 pb-5">
        {icon}
        <span className="eyebrow">{eyebrow}</span>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-16">
        <h2 className="text-h2 font-medium">{title}</h2>
        {lead && <p className="leading-relaxed text-chalk-dim lg:pt-2">{lead}</p>}
      </div>
    </>
  );
}
