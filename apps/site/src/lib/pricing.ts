import type { AgentSlug } from './catalog';

/**
 * Тарифы.
 *
 * Единственное место, где живут суммы, состав пакетов и связь агентов
 * с пакетами. Карточки на главной, полная страница цен, матрица сравнения
 * и бейджи «входит в Growth» на страницах агентов читают отсюда. Написанные
 * в четырёх местах, они разойдутся на первой же правке цены — и разойдутся
 * молча, потому что все четыре одновременно никто не открывает.
 *
 * Названия и описания пунктов лежат в `messages`: они переводятся. Суммы
 * не переводятся и потому здесь.
 */
export type PlanId = 'start' | 'growth' | 'platform';

export interface PlanFeature {
  /** Ключ строки в `messages.plans.<plan>.features.<key>`. */
  key: string;
  /** Агент ещё не вышел. Пакет подключается, агент включается позже. */
  soon?: boolean;
}

export interface Plan {
  id: PlanId;
  /** Евро в месяц. `null` — цена по запросу. */
  price: number | null;
  /** Разовая настройка, евро. `null` — по договорённости. */
  setup: number | null;
  /** Выделенный пакет. Ровно один: две рекомендации — уже не совет. */
  featured?: boolean;
  features: PlanFeature[];
}

export const PLANS: Plan[] = [
  {
    id: 'start',
    price: 199,
    setup: 490,
    features: [
      { key: 'chatbot' },
      { key: 'contacts' },
      { key: 'qualify' },
      { key: 'portal' },
      { key: 'limit' },
      { key: 'language' },
    ],
  },
  {
    id: 'growth',
    price: 449,
    setup: 890,
    featured: true,
    features: [
      { key: 'inherits' },
      { key: 'scenario' },
      { key: 'languages' },
      { key: 'configurator', soon: true },
      { key: 'crm', soon: true },
      { key: 'followUp', soon: true },
      { key: 'orderStatus', soon: true },
      { key: 'content', soon: true },
      { key: 'priority' },
    ],
  },
  {
    id: 'platform',
    price: null,
    setup: null,
    features: [
      { key: 'inherits' },
      { key: 'customAgent' },
      { key: 'automation' },
      { key: 'website' },
      { key: 'seo' },
      { key: 'marketing' },
      { key: 'sla' },
    ],
  },
];

/**
 * С какого пакета агент доступен.
 *
 * Пакеты вложены друг в друга, поэтому хранится нижняя ступень: агент из
 * `growth` есть и в `platform`. Хранить полный список пакетов у каждого
 * агента значило бы повторять вложенность шесть раз и однажды ошибиться
 * в одном месте из шести.
 *
 * Все шесть готовых агентов помещаются в первые два пакета. Третий — не
 * следующая ступень по количеству агентов, а другая работа: заказная
 * разработка, сайт, SEO, маркетинг.
 */
export const PLAN_FOR_AGENT: Record<AgentSlug, PlanId> = {
  chatbot: 'start',
  configurator: 'growth',
  'crm-assistant': 'growth',
  'follow-up': 'growth',
  'order-status': 'growth',
  'content-engine': 'growth',
};

/** Порядок ступеней — для сравнения «доступен начиная с». */
const ORDER: PlanId[] = ['start', 'growth', 'platform'];

export const planIncludesAgent = (plan: PlanId, agent: AgentSlug) =>
  ORDER.indexOf(plan) >= ORDER.indexOf(PLAN_FOR_AGENT[agent]);

/**
 * Строки матрицы сравнения.
 *
 * `true` — есть, `false` — нет, строка — значение. `soon` помечает то,
 * что входит в пакет, но ещё не вышло: пакет подключается сегодня по
 * сегодняшней цене, агент включается по мере готовности.
 */
export interface MatrixRow {
  key: string;
  start: boolean | 'value';
  growth: boolean | 'value';
  platform: boolean | 'value';
  soon?: boolean;
}

export const MATRIX: MatrixRow[] = [
  { key: 'conversations', start: 'value', growth: 'value', platform: 'value' },
  { key: 'chatbot', start: true, growth: true, platform: true },
  { key: 'scenario', start: 'value', growth: 'value', platform: 'value' },
  { key: 'languages', start: 'value', growth: 'value', platform: 'value' },
  { key: 'qualify', start: true, growth: true, platform: true },
  { key: 'contacts', start: true, growth: true, platform: true },
  { key: 'portal', start: true, growth: true, platform: true },
  { key: 'configurator', start: false, growth: true, platform: true, soon: true },
  { key: 'crm', start: false, growth: true, platform: true, soon: true },
  { key: 'followUp', start: false, growth: true, platform: true, soon: true },
  { key: 'orderStatus', start: false, growth: true, platform: true, soon: true },
  { key: 'content', start: false, growth: true, platform: true, soon: true },
  { key: 'priority', start: false, growth: true, platform: true },
  { key: 'customAgent', start: false, growth: false, platform: true },
  { key: 'automation', start: false, growth: false, platform: true },
  { key: 'website', start: false, growth: false, platform: true },
  { key: 'seo', start: false, growth: false, platform: true },
  { key: 'marketing', start: false, growth: false, platform: true },
  { key: 'sla', start: false, growth: false, platform: true },
  { key: 'setup', start: 'value', growth: 'value', platform: 'value' },
];
