/**
 * Тарифы.
 *
 * Одна ручка вместо трёх. Прежде тариф, уровень модели и потолок сообщений
 * стояли независимо друг от друга — и уже разъехались: у пилотного клиента
 * был куплен `business`, работала дешёвая модель, а потолка не было вовсе.
 * Так и должно было случиться: три значения, которые обязаны согласовываться,
 * но которые ничто не заставляет.
 *
 * Теперь тариф задаёт всё: какая модель отвечает, сколько сообщений в месяц,
 * сколько материалов можно загрузить и сколько это стоит.
 *
 * ── Про числа ──
 *
 * Цены и потолки — данные, а не истина. Они посчитаны от ЗАМЕРЕННОГО расхода
 * (5500 токенов входа и 200 выхода на сообщение) и проверяются командой
 * `npm run cost -- --plans`, которая показывает маржу каждого тарифа.
 *
 * Считать их надо вместе, а не по отдельности, и вот почему. Sonnet дороже
 * Haiku ровно втрое. Поэтому «верхний тариф = лучшая модель И больше сообщений»
 * съедает маржу быстрее, чем растёт цена: восемь тысяч сообщений на Sonnet
 * стоят дороже, чем двадцать тысяч на Haiku. Прежде чем менять число сообщений
 * в `business`, посмотрите, что станет с маржой.
 */

export type PlanId = 'starter' | 'pro' | 'business';

export interface Plan {
  id: PlanId;
  /** Как тариф называется для клиента. */
  name: string;
  /** Какая модель отвечает посетителям. */
  modelTier: 'base' | 'premium';
  /** Потолок сообщений в месяц. Достигнут — виджет предлагает оставить контакт. */
  monthlyMessages: number;
  maxDocuments: number;
  maxTotalBytes: number;
  maxChunks: number;
  /** Цена в евро за месяц. */
  priceEur: number;
  /**
   * Что тариф ВКЛЮЧАЕТ на самом деле.
   *
   * Не украшение списка, а то, что проверяется на сервере. Пока этого поля
   * не было, лестница была только текстом: Start получал и синхронизацию
   * с Drive, и коннекторы — всё, что обещано Business. Обещание, за которым
   * ничего не стоит, замечает первый же клиент, сравнивший два счёта.
   */
  features: {
    /** Папка Google Drive как источник материалов. */
    drive: boolean;
    /** Вызовы во внешние системы: CRM, склад, статус заказа. */
    connectors: boolean;
  };

  /**
   * Строки для панели: что входит в тариф, на языке клиента.
   *
   * Каждая строка обязана быть либо верной для всех, либо закрытой в features.
   * Отчёт о пробелах намеренно есть у всех: скрывать от клиента, на что бот
   * не смог ответить, — значит делать его бота хуже и лишать себя же обратной
   * связи. Тариф зарабатывает объёмом и Drive, а не спрятанной пользой.
   */
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Start',
    modelTier: 'base',
    monthlyMessages: 1_000,
    maxDocuments: 10,
    maxTotalBytes: 20 * 1024 * 1024,
    maxChunks: 2_000,
    priceEur: 49,
    features: { drive: false, connectors: false },
    highlights: [
      '1 000 de mesaje pe lună',
      '10 documente în baza de cunoștințe',
      'Formular de contact și notificări pe email',
      'Rapoarte despre întrebările fără răspuns',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    modelTier: 'base',
    monthlyMessages: 5_000,
    maxDocuments: 50,
    maxTotalBytes: 100 * 1024 * 1024,
    maxChunks: 10_000,
    priceEur: 99,
    features: { drive: true, connectors: false },
    highlights: [
      'Tot ce include Start',
      '5 000 de mesaje pe lună',
      '50 de documente în baza de cunoștințe',
      'Sincronizare cu Google Drive — puneți fișierul în dosar și gata',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    // Единственный тариф на старшей модели. Она отвечает точнее на длинных
    // и неоднозначных вопросах — и стоит втрое дороже, что и определяет цену.
    modelTier: 'premium',
    monthlyMessages: 8_000,
    maxDocuments: 200,
    maxTotalBytes: 500 * 1024 * 1024,
    maxChunks: 50_000,
    priceEur: 299,
    features: { drive: true, connectors: true },
    highlights: [
      'Tot ce include Pro',
      'Model avansat — răspunsuri mai precise la întrebări complexe',
      '8 000 de mesaje pe lună',
      '200 de documente în baza de cunoștințe',
      'Conectori către CRM și alte sisteme',
    ],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const isPlanId = (value: string): value is PlanId => value in PLANS;

/**
 * Тариф по идентификатору.
 *
 * Неизвестное значение падает на самый ДЕШЁВЫЙ тариф, а не на самый дорогой.
 * Ошибка в данных не должна молча выдавать клиенту старшую модель за наш счёт;
 * заниженный тариф он заметит и позвонит, завышенный — не заметит никто.
 */
export const planFor = (id: string | null | undefined): Plan =>
  (id && isPlanId(id) ? PLANS[id] : PLANS.starter);

/**
 * Потолок сообщений для клиента.
 *
 * `override` — осознанный запасной ход для особых договорённостей, а не вторая
 * ручка на каждый день: `null` означает «как в тарифе», и это обычный случай.
 */
export const messageCapFor = (planId: string | null, override: number | null): number =>
  override ?? planFor(planId).monthlyMessages;

/**
 * Экраны панели, которых у тарифа нет.
 *
 * Скрытие в панели — только половина: экран, скрытый рисованием, остаётся
 * доступен обычным запросом. Вторая половина — тот же список на сервере.
 */
export const screensNotInPlan = (planId: string | null | undefined): string[] => {
  const f = planFor(planId).features;
  const off: string[] = [];
  if (!f.drive) off.push('drive');
  if (!f.connectors) off.push('connectors');
  return off;
};
