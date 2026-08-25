'use client';

import { ctaClasses, type CtaSize, type CtaVariant } from './Cta';
import { DEMO_OPEN } from '@/components/contact/DemoDialog';

/**
 * Кнопка «запросить демонстрацию».
 *
 * Открывает окно с формой вместо перехода на отдельную страницу. Заявка,
 * ради которой человека уводят со страницы, теряет тех, кто не дочитал:
 * переход стирает контекст, а возврат назад мало кто делает.
 *
 * Связь с окном — через событие на `window`, а не через контекст React.
 * Кнопки стоят в шапке, в герое, в тарифах и в конце страницы; протягивать
 * провайдер через все эти уровни ради одного вызова — больше кода, чем
 * пользы, и он всё равно не понадобился бы никому другому.
 */
export function DemoButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  variant?: CtaVariant;
  size?: CtaSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(DEMO_OPEN))}
      className={`${ctaClasses(variant, size)} ${className}`}
    >
      {children}
    </button>
  );
}
