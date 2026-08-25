import { useTranslations } from 'next-intl';
import { productById, PAID_TIERS, type Tier } from '@assistwidget/contract';
import { DemoButton } from '@/components/ui/DemoButton';

/**
 * Цена агента — на странице самого агента.
 *
 * Агент продаётся сам по себе, поэтому и цена стоит там, где человек про
 * него читает, а не на общей странице тарифов через два клика. Решение
 * «беру» созревает в конце страницы агента; отправлять человека за ценой
 * куда-то ещё — значит терять его ровно в этот момент.
 *
 * Числа берутся из контракта, то есть из манифеста рядом с кодом агента.
 * Подписи к ним — из messages, потому что «оферты в месяц» на двух языках
 * пишутся по-разному, а 600 на обоих одинаково. Сборка проверяет, что
 * подпись нашлась для каждого ключа: иначе на витрину вылезет сырой
 * `limits.offers`, и увидит это клиент.
 *
 * Разграфлённый блок, а не три отдельные карточки — как на общей странице
 * цен. Причина там же: три карточки читаются как три товара, между которыми
 * выбирают, а одна таблица — как лестница, по которой поднимаются.
 */
export function AgentPricing({ slug }: { slug: string }) {
  const t = useTranslations('agentPricing');
  const product = productById(slug);

  /* Агент без посчитанных вилок цену не показывает. Это законное состояние
     — заведён, но не продаётся, — и сборка следит, чтобы оно не совпало
     с `shipped`. */
  if (!product?.tiers) return null;

  const paid = PAID_TIERS.map((name) => ({ name, tier: product.tiers![name] }));

  return (
    <section className="px-6 py-section sm:px-8">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-h2 font-medium">{t('title')}</h2>
        <p className="mt-4 max-w-xl text-body text-chalk-dim">{t('lead')}</p>

        <div className="reveal mt-12 grid divide-y divide-white/8 overflow-hidden rounded-card border border-white/8 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {paid.map(({ name, tier }) => (
            <PaidColumn key={name} slug={slug} name={name} tier={tier} />
          ))}
          <IndividualColumn />
        </div>
      </div>
    </section>
  );
}

function PaidColumn({ slug, name, tier }: { slug: string; name: 'starter' | 'pro'; tier: Tier }) {
  const t = useTranslations('agentPricing');
  const featured = name === 'pro';

  return (
    /* Выделение заливкой, а не рамкой: рамка внутри уже разграфлённого
       блока читается как сбой вёрстки. */
    <div className={`flex flex-col p-7 sm:p-8 ${featured ? 'bg-white/4' : ''}`}>
      {/* Фиксированная высота: бейдж выше названия, и без неё колонка Pro
          опустила бы цену ниже двух соседних. Три цены не на одной линии —
          первое, что видно в таблице. */}
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] tracking-wider text-chalk uppercase">
          {t(featured ? 'proName' : 'starterName')}
        </h3>
        {featured && (
          <span className="rounded-pill border border-aurora-warm/30 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-chalk uppercase">
            {t('recommended')}
          </span>
        )}
      </div>

      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="text-h2 font-medium">{tier.price} €</span>
        <span className="text-sm text-chalk-faint">{t('perMonth')}</span>
      </p>

      {/* Заведение стоит прямо под ценой и мельче: это вторая сумма
          в решении, и узнать о ней на созвоне — худший момент. */}
      <p className="mt-2 text-xs text-chalk-faint">{t('setup', { fee: tier.setup })}</p>

      <ul className="mt-7 flex flex-col gap-3.5 border-t border-white/8 pt-6">
        {Object.entries(tier.limits).map(([key, value]) => (
          <li key={key} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
            <CheckIcon />
            <span>
              <span className="text-chalk">{value.toLocaleString('ro-RO')}</span>{' '}
              {t(`${slug}.limits.${key}`)}
            </span>
          </li>
        ))}
        {tier.features.map((key) => (
          <li key={key} className="flex gap-3 text-sm leading-relaxed text-chalk-dim">
            <CheckIcon />
            <span>{t(`${slug}.features.${key}`)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 pt-2">
        <DemoButton>{t('cta')}</DemoButton>
      </div>
    </div>
  );
}

/**
 * Третья колонка — одна на всех агентов.
 *
 * Содержание не зависит от агента и живёт в messages один раз. Цены у неё
 * нет и быть не может: заказная разработка, сайт, SEO и маркетинг не
 * продаются подпиской с потолком, который кто-то считает.
 */
function IndividualColumn() {
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

      <div className="mt-8 pt-2">
        <DemoButton>{t('cta')}</DemoButton>
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
