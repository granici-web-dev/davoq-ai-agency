import { useTranslations } from 'next-intl';
import {
  COMMERCE,
  annualMonthly,
  annualPrice,
  type Product,
  type Tier,
  type TierName,
} from '@assistwidget/contract';
import { Link } from '@/i18n/routing';
import { ctaClasses } from '@/components/ui/Cta';
import { DemoButton } from '@/components/ui/DemoButton';

export type Billing = 'monthly' | 'annual';

/**
 * Карточка вилки. Одна на страницу цен и на страницы агентов.
 *
 * Ни одного числа в разметке: цена, потолки и плата за заведение приходят
 * из контракта, то есть из манифеста рядом с кодом агента. Годовая
 * СЧИТАЕТСЯ из месячной, а не хранится: двенадцать годовых чисел рядом
 * с двенадцатью месячными обязаны согласовываться, и ничто их к этому
 * не принуждает — достаточно поправить одно и забыть про другое, и на
 * витрине появится скидка, которой нет.
 */
/** Неразрывный пробел между тысячами: «1 430 €» не должно ломаться по строке. */
const fmt = (n: number) => n.toLocaleString('ro-RO').replace(/\s/g, '\u00a0');

export function PricingCard({
  product,
  name,
  tier,
  billing,
}: {
  product: Product;
  name: TierName;
  tier: Tier;
  billing: Billing;
}) {
  const t = useTranslations('agentPricing');
  /* Возможности агента лежат в его собственном разделе — там, где они
     описаны для страницы. Второй хук вместо копий в `agentPricing`. */
  const tPage = useTranslations(`agentPage.${product.id}.features`);
  const featured = name === 'pro';
  const shipped = product.status === 'shipped';

  /* Годовая — только у того, что уже вышло. У агента в разработке год
     означал бы предоплату за то, чего нет; вместо цены он предлагает
     закрепить цену запуска. */
  const annual = billing === 'annual' && shipped;
  const notYetAnnual = billing === 'annual' && !shipped;

  const copy = (kind: 'limits' | 'features', key: string) => {
    if (t.has(`${product.id}.${kind}.${key}`)) return t(`${product.id}.${kind}.${key}`);
    if (t.has(`shared.${kind}.${key}`)) return t(`shared.${kind}.${key}`);
    /* Пункты Basic — это возможности агента, уже описанные на его странице.
       Требовать для карточки второй текст про то же самое значило бы
       плодить копии ровно там, где мы их выводим. */
    return tPage(`${key}.title`);
  };

  return (
    <div className={`flex flex-col p-7 sm:p-8 ${featured ? 'bg-white/4' : ''}`}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] tracking-wider text-chalk uppercase">
          {t(featured ? 'proName' : 'basicName')}
        </h3>
        {featured && (
          <span className="rounded-pill border border-aurora-warm/30 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-chalk uppercase">
            {t('recommended')}
          </span>
        )}
      </div>

      {notYetAnnual ? (
        /* Ступенью ниже месячной цены: это не сумма, а сообщение,
           и кеглем цифр оно бы кричало. */
        <p className="mt-6 text-h3 leading-tight font-medium text-chalk-dim">{t('annualAtLaunch')}</p>
      ) : (
        <>
          <p className="flex items-baseline gap-1.5 mt-6">
            <span className="text-h2 font-medium">
              {annual ? annualMonthly(tier.price) : tier.price} €
            </span>
            <span className="text-sm text-chalk-faint">{t('perMonth')}</span>
          </p>

          {annual ? (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-chalk-faint">
              {/* Через строку, а не через интерполяцию next-intl: та форматирует
                  число по локали сообщения, и в en вышло бы «1,430 €»
                  вместо «1 430 €». Разделитель тут один на оба языка —
                  это сумма в евро, а не текст. */}
              <span>{t('billedAnnually', { total: fmt(annualPrice(tier.price)) })}</span>
              {/* Зачёркнутая месячная — единственный способ показать, от чего
                  считается скидка. Без неё «119 €» выглядит просто ценой. */}
              <s className="text-chalk-faint/60">{t('insteadOf', { price: tier.price })}</s>
            </p>
          ) : (
            <p className="mt-2 text-xs text-chalk-faint">
              {t('annualHint', { percent: Math.round(COMMERCE.annualDiscount * 100) })}
            </p>
          )}
        </>
      )}

      {/* Заведение не скидкуется и потому одинаково в обоих режимах. */}
      <p className="mt-3 text-xs text-chalk-faint">
        {t('setupOnCard', { fee: COMMERCE.setup.first })}
      </p>

      <ul className="mt-7 flex flex-col gap-3.5 border-t border-white/8 pt-6">
        {featured && (
          <li className="flex gap-3 text-sm leading-relaxed text-chalk">
            <CheckIcon />
            <span>{t('allFromBasic')}</span>
          </li>
        )}
        {Object.entries(tier.limits).map(([key, value]) => (
          <li key={key} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
            <CheckIcon />
            <span>
              <span className="text-chalk">{value.toLocaleString('ro-RO')}</span>{' '}
              {copy('limits', key)}
            </span>
          </li>
        ))}
        {tier.features.map((key) => (
          <li key={key} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
            <CheckIcon />
            <span>{copy('features', key)}</span>
          </li>
        ))}
      </ul>

      {/* mt-auto держит кнопки на одной линии: у вилок разное число строк. */}
      <div className="mt-auto pt-8">
        {shipped ? (
          <DemoButton variant={featured ? 'primary' : 'ghost'} className="w-full">
            {t('cta')}
          </DemoButton>
        ) : (
          /* Не окно с демонстрацией, а страница контакта с уже выбранным
             агентом: человек закрепляет цену на КОНКРЕТНОГО, и терять
             это в общей форме нельзя. */
          <Link
            href={{ pathname: '/contact', query: { agent: product.id } }}
            className={`${ctaClasses(featured ? 'primary' : 'ghost')} w-full`}
          >
            {t('reserveLaunchPrice')}
          </Link>
        )}
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
