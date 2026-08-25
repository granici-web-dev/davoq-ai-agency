/**
 * Каталог услуг.
 *
 * Это то, что уже обещано на витрине третьей вилкой — Individual. Там оно
 * стоит четырьмя строчками без всякого продолжения: человек читает
 * «сайт, SEO, маркетинг» и идёт в форму, не узнав ни что именно делается,
 * ни как. Раздел услуг — то же самое обещание, но с ответом.
 *
 * Список ровно тот же и в том же порядке. Разойтись им нельзя: карточка
 * Individual и этот каталог описывают одну услугу, и если тут появится
 * пятая строка, а там останется четыре, узнать об этом будет неоткуда.
 *
 * Здесь ТОЛЬКО структура: слаги и порядок. Тексты живут в
 * `messages/{locale}.json` под ключами `services.<slug>.*`
 * и `servicePage.<slug>.*`.
 */

export const SERVICE_SLUGS = ['site-web', 'seo', 'marketing-digital', 'automatizari'] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

/**
 * Направление внутри услуги: закупка в соцсетях, Google Ads.
 *
 * Появилось у маркетинга, потому что «digital-маркетинг» одним списком —
 * это не ответ на вопрос «что вы делаете». Закупка в соцсетях и поиск —
 * разная работа, разные площадки и разный разговор с клиентом, и человек
 * приходит за одним из двух, а не за обоими сразу.
 *
 * Названия площадок лежат ЗДЕСЬ, а не в переводах. Instagram и Performance
 * Max не переводятся, а список в двух файлах разошёлся бы молча: в одном
 * четыре площадки, в другом три, и увидеть это можно было бы только
 * открыв обе версии страницы подряд.
 */
export interface ServiceChannel {
  /** Ключ перевода: `servicePage.<slug>.channels.<key>.{title,text}`. */
  key: string;
  /** Площадки. Имена собственные — не переводятся. */
  platforms: string[];
}

export interface Service {
  slug: ServiceSlug;
  /**
   * Сколько разделов «что входит» у этой услуги.
   *
   * Числом, а не длиной массива в переводах: страница читает списки через
   * `t.raw`, и промах в числе даёт пустую строку вместо ошибки. Здесь его
   * видно рядом со слагом, и оно одно на оба языка — а значит, забыв
   * дописать пункт в английский, вы получите падение сборки, а не
   * молчаливо короткий список для половины посетителей.
   */
  includes: number;
  steps: number;
  faq: number;
  /** Направления. Нет — раздел не выводится вовсе. */
  channels?: ServiceChannel[];
}

export const SERVICES: Service[] = [
  { slug: 'site-web', includes: 6, steps: 4, faq: 4 },
  { slug: 'seo', includes: 5, steps: 4, faq: 4 },
  {
    slug: 'marketing-digital',
    includes: 6,
    steps: 4,
    faq: 5,
    channels: [
      {
        key: 'social',
        platforms: ['Instagram', 'Facebook', 'TikTok', 'LinkedIn'],
      },
      {
        key: 'google',
        /* Типы кампаний, а не «Google Ads» одним словом: за этими
           названиями стоит разная работа и разные деньги, и клиент,
           который уже покупал рекламу, читает именно их. */
        platforms: ['Search', 'Performance Max', 'YouTube', 'Display'],
      },
    ],
  },
  { slug: 'automatizari', includes: 5, steps: 4, faq: 4 },
];

export const serviceBySlug = (slug: string): Service | undefined =>
  SERVICES.find((s) => s.slug === slug);
