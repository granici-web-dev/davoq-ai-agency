/**
 * Каталог агентов и индустрий.
 *
 * Один источник для навигации, гридов на главной, ссылок «применимо к»
 * и sitemap. Пока список жил бы в трёх местах, четвёртая страница
 * появилась бы в двух из них — и обнаружилось бы это на демонстрации.
 *
 * Здесь ТОЛЬКО структура: слаги, статусы, порядок. Все тексты живут
 * в `messages/{locale}.json` под ключами `agents.<slug>.*`
 * и `industries.<slug>.*` — иначе перевод пришлось бы править в коде.
 */

export const AGENT_SLUGS = [
  'chatbot',
  'configurator',
  'crm-assistant',
  'follow-up',
  'order-status',
  'content-engine',
] as const;

export type AgentSlug = (typeof AGENT_SLUGS)[number];

/** `available` — продаётся сейчас. `soon` — в разработке, демо по запросу. */
export type AgentStatus = 'available' | 'soon';

export interface Agent {
  slug: AgentSlug;
  status: AgentStatus;
  /** Индустрии, где сценарий агента отработан лучше всего. Не ограничение. */
  industries: IndustrySlug[];
}

export const AGENTS: Agent[] = [
  {
    slug: 'chatbot',
    status: 'available',
    industries: ['mobilier', 'constructii', 'imobiliare', 'auto', 'energie', 'clinici'],
  },
  {
    slug: 'configurator',
    status: 'soon',
    industries: ['mobilier', 'constructii', 'energie'],
  },
  {
    slug: 'crm-assistant',
    status: 'soon',
    industries: ['imobiliare', 'auto', 'constructii'],
  },
  {
    slug: 'follow-up',
    status: 'soon',
    industries: ['mobilier', 'imobiliare', 'auto', 'clinici'],
  },
  {
    slug: 'order-status',
    status: 'soon',
    industries: ['mobilier', 'constructii', 'energie'],
  },
  {
    slug: 'content-engine',
    status: 'soon',
    industries: ['mobilier', 'imobiliare', 'clinici'],
  },
];

export const INDUSTRY_SLUGS = [
  'mobilier',
  'constructii',
  'imobiliare',
  'auto',
  'energie',
  'clinici',
] as const;

export type IndustrySlug = (typeof INDUSTRY_SLUGS)[number];

export interface Industry {
  slug: IndustrySlug;
  /** Агенты, которые в этой нише дают результат первыми. Порядок — приоритет. */
  agents: AgentSlug[];
}

export const INDUSTRIES: Industry[] = [
  { slug: 'mobilier', agents: ['chatbot', 'configurator', 'follow-up', 'order-status'] },
  { slug: 'constructii', agents: ['chatbot', 'configurator', 'crm-assistant'] },
  { slug: 'imobiliare', agents: ['chatbot', 'crm-assistant', 'follow-up'] },
  { slug: 'auto', agents: ['chatbot', 'crm-assistant', 'follow-up'] },
  { slug: 'energie', agents: ['chatbot', 'configurator', 'order-status'] },
  { slug: 'clinici', agents: ['chatbot', 'follow-up', 'content-engine'] },
];

export const agentBySlug = (slug: string): Agent | undefined =>
  AGENTS.find((a) => a.slug === slug);

export const industryBySlug = (slug: string): Industry | undefined =>
  INDUSTRIES.find((i) => i.slug === slug);

/** Пути для sitemap и статической генерации. Строятся из каталога, не руками. */
export const agentPaths = (): string[] => AGENTS.map((a) => `/agents/${a.slug}`);
export const industryPaths = (): string[] => INDUSTRIES.map((i) => `/industries/${i.slug}`);

export const STATIC_PATHS = [
  '/',
  '/agents',
  '/industries',
  '/pricing',
  '/about',
  '/contact',
] as const;
