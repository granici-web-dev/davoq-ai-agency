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
  'voice-assistant',
  'configurator',
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
  /**
   * Полные тексты страницы написаны.
   *
   * Это НЕ то же самое, что `status`. Агент может ещё не выйти, но
   * страница у него уже настоящая: он входит в оплаченный пакет, и
   * человек имеет право прочитать, что именно он покупает. Без этого
   * различия «в разработке» означало бы «страницы нет», и половина
   * пакета Growth продавалась бы одной строкой описания.
   */
  full?: boolean;
}

export const AGENTS: Agent[] = [
  { slug: 'chatbot', status: 'available', full: true },
  { slug: 'voice-assistant', status: 'soon', full: true },
  { slug: 'configurator', status: 'soon', full: true },
  { slug: 'follow-up', status: 'soon', full: true },
  { slug: 'order-status', status: 'soon', full: true },
  { slug: 'content-engine', status: 'soon', full: true },
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
  /**
   * Полные тексты страницы написаны.
   *
   * То же самое, что `full` у агента, и по той же причине. Ниша заводится
   * одной строкой в этом списке, а тексты под неё пишутся позже; до тех
   * пор страница обязана собраться из того, что есть, а не упасть
   * посреди раздела.
   *
   * Раньше этот признак жил двумя одинаковыми множествами — в компоненте
   * и в `generateMetadata`. Они разошлись на первой же правке: страницы
   * стали полными, а заголовки в поиске остались короткими, и заметить
   * это можно было только сравнив `<title>` с содержимым.
   */
  full?: boolean;
}

export const INDUSTRIES: Industry[] = [
  {
    slug: 'mobilier',
    full: true,
    agents: ['chatbot', 'voice-assistant', 'configurator', 'follow-up', 'order-status', 'content-engine'],
  },
  {
    slug: 'constructii',
    full: true,
    // Ремонт идёт месяцами, и «где моя квартира» здесь спрашивают чаще,
    // чем что-либо ещё после цены. «До и после» — второй по силе повод.
    agents: ['chatbot', 'voice-assistant', 'configurator', 'order-status', 'content-engine'],
  },
  {
    slug: 'imobiliare',
    full: true,
    // Продаёт показ, а показ приводит контент: объекты, планировки, ход
    // стройки. Статус — про стадию сделки и про дом, который ещё строится.
    agents: ['chatbot', 'voice-assistant', 'follow-up', 'content-engine', 'order-status'],
  },
  {
    slug: 'auto',
    full: true,
    // Машину из заказа ждут месяцами: статус закрывает самый частый
    // звонок. Контент — склад, поставки, выдачи.
    agents: ['chatbot', 'voice-assistant', 'follow-up', 'order-status', 'content-engine'],
  },
  {
    slug: 'energie',
    full: true,
    // Монтаж фотографируется сам собой, и это лучший материал в нише:
    // объект, цифры экономии, срок.
    agents: ['chatbot', 'voice-assistant', 'configurator', 'order-status', 'content-engine'],
  },
  {
    slug: 'clinici',
    full: true,
    // Статус здесь про работу лаборатории — коронка, элайнеры, протез.
    // Ждут неделями и звонят узнать, пришло ли.
    agents: ['chatbot', 'voice-assistant', 'follow-up', 'content-engine', 'order-status'],
  },
];

/**
 * Ниши, в которых работает агент.
 *
 * Считается из `INDUSTRIES`, а не хранится у агента вторым списком.
 * Пока списка было два, они разошлись молча: `content-engine` считал
 * мебель своей нишей, а мебель его своим агентом — нет. Страница агента
 * и страница ниши показывали разное, и заметить это можно было, только
 * открыв обе подряд.
 *
 * Теперь связь одна и лежит у ниши: порядок в её списке — это порядок
 * приоритета именно для неё, и он у каждой ниши свой.
 */
export const industriesForAgent = (slug: AgentSlug): IndustrySlug[] =>
  INDUSTRIES.filter((i) => (i.agents as readonly AgentSlug[]).includes(slug)).map((i) => i.slug);

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
