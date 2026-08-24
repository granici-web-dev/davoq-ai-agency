/**
 * Цены.
 *
 * Единственное место в проекте, где стоят суммы. Не в `messages`: число
 * одинаково по-румынски и по-английски, а лежащее в двух файлах сразу оно
 * однажды разъедется — и разъедется молча, потому что второй язык
 * открывают редко.
 *
 * Сейчас вместо сумм заглушки `{PRICE}`. Они видны на странице намеренно:
 * забытая заглушка бросается в глаза, забытый ноль — нет.
 *
 * Порядок массива — порядок колонок на странице и на `/pricing`.
 */
export interface Plan {
  id: 'starter' | 'pro' | 'enterprise';
  /** `null` — цены нет, показывается «по запросу» из messages. */
  price: string | null;
  /** Выделенная колонка. Ровно одна: две рекомендации — это уже не совет. */
  featured?: boolean;
  /** Ключи строк в `messages.pricing.plans.<id>.features.*`. */
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    price: '{PRICE}',
    features: ['oneAgent', 'oneSite', 'branding', 'email'],
  },
  {
    id: 'pro',
    price: '{PRICE}',
    featured: true,
    features: ['moreAgents', 'configurator', 'offerPdf', 'crm', 'priority'],
  },
  {
    id: 'enterprise',
    price: null,
    features: ['volume', 'ownRules', 'contract', 'sla'],
  },
];

/** Разовая плата за настройку. Берётся с плана `pro` и выше. */
export const SETUP_FEE = '{PRICE}';
