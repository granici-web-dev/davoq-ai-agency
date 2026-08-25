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
}

export const SERVICES: Service[] = [
  { slug: 'site-web', includes: 6, steps: 4, faq: 4 },
  { slug: 'seo', includes: 5, steps: 4, faq: 4 },
  { slug: 'marketing-digital', includes: 5, steps: 4, faq: 4 },
  { slug: 'automatizari', includes: 5, steps: 4, faq: 4 },
];

export const serviceBySlug = (slug: string): Service | undefined =>
  SERVICES.find((s) => s.slug === slug);
