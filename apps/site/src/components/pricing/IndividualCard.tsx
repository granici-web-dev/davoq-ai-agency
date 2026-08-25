import { useTranslations } from 'next-intl';
import { DemoButton } from '@/components/ui/DemoButton';

/**
 * Третья колонка — одна на всех агентов.
 *
 * Содержание не зависит от агента и живёт в messages один раз. Цены у неё
 * нет и быть не может: заказная разработка, сайт, SEO и маркетинг не
 * продаются подпиской с потолком, который кто-то считает.
 */
export function IndividualCard() {
  const t = useTranslations('agentPricing.individual');
  const items = t.raw('items') as string[];

  return (
    <div className="flex flex-col p-7 sm:p-8">
      <div className="flex min-h-7 items-center">
        <h3 className="font-mono text-[11px] tracking-wider text-chalk uppercase">{t('name')}</h3>
      </div>

      {/* Слова кеглем цифр выглядят кричаще: «249 €» в том размере читается
          как сумма, «La cerere» — как заголовок. Ступень ниже возвращает
          третьей колонке её вес. */}
      <p className="mt-6 flex items-baseline">
        <span className="text-h3 font-medium">{t('price')}</span>
      </p>

      {/* Пустая строка вместо платы за заведение: без неё список в третьей
          колонке поднялся бы выше двух соседних. */}
      <p className="mt-2 text-xs text-chalk-faint">&nbsp;</p>

      <p className="mt-5 text-sm leading-relaxed text-chalk-dim">{t('lead')}</p>

      <ul className="mt-7 flex flex-col gap-3.5 border-t border-white/8 pt-6">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
            <CheckIcon />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <DemoButton variant="ghost" className="w-full">
          {t('cta')}
        </DemoButton>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-4 w-4 shrink-0 text-aurora-warm/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}
