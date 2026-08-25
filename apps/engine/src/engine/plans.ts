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

export type PlanId = 'starter' | 'pro' | 'business' | 'enterprise';

export interface Plan {
  id: PlanId;
  /** Как тариф называется для клиента. */
  name: string;
  /** Какая модель отвечает посетителям. */
  modelTier: 'base' | 'premium';
  /** Потолок сообщений в месяц. Достигнут — виджет предлагает оставить контакт. */
  monthlyMessages: number;
  /**
   * Потолок оферт в месяц. Ноль — конфигуратора нет вовсе.
   *
   * Это КОММЕРЧЕСКИЙ рычаг, а не защита от расхода: сам PDF почти ничего
   * не стоит, а разговор посетителя с агентом уже посчитан в `monthlyMessages`.
   * Числа держатся щедрыми намеренно — упереться в них должен тот, кто продаёт
   * много, а не тот, кто пробует.
   *
   * TODO(цифры): подтвердить `npm run cost -- --plans` после первого месяца
   * настоящих диалогов конфигуратора — до тех пор это оценка, а не замер.
   */
  monthlyOffers: number;
  maxDocuments: number;
  maxTotalBytes: number;
  maxChunks: number;
  /** Цена в евро за месяц. */
  priceEur: number;
  /**
   * Цена за год. Минус два месяца — то есть десять месячных.
   *
   * Ноль означает «не продаётся годом»: у тарифа без цены его нет и быть
   * не может.
   */
  priceEurYearly: number;
  /**
   * Разовая плата за заведение. Ноль — заведение входит в подписку.
   *
   * ── Откуда число ──
   *
   * Полтора дня работы на клиента в УЖЕ ЗАВЕДЁННОЙ нише: созвон и вытащить
   * каталог с ценами (2–3 ч), флоу и формула в конфиг (2 ч), ассеты (1–2 ч),
   * бланк со сверкой и одной итерацией (2–3 ч), материалы в базу знаний
   * (1–2 ч), встройка на сайт (1 ч).
   *
   * Декларативный бланк убрал из этого списка компонент на клиента, ревью
   * и деплой — но не убрал главного: вытащить из мебельщика прайс, которого
   * у него нет в структурированном виде. Это переговоры, а не набор текста,
   * и быстрее они не становятся.
   *
   * ── Почему одно число, а не «от и до» ──
   *
   * Вилка в прайсе — это приглашение торговаться до её нижней границы ещё
   * до того, как клиент сказал, что ему нужно. Одно число обсуждается
   * по существу: что входит и что нет.
   *
   * ── Почему не дешевле ──
   *
   * Плата за заведение не окупает наши часы — она покупает обязательство.
   * Клиент, не заплативший за онбординг, не соберёт материалы и пропадёт
   * на третьей неделе, а полтора дня к тому времени уже потрачены.
   *
   * Второй клиент в той же нише обходится нам заметно дешевле — ниша уже
   * написана. Скидка живёт ТАМ и даётся осознанно, а не получается сама
   * из вилки в прайсе.
   */
  setupFeeEur: number;
  /**
   * Можно ли купить прямо сейчас.
   *
   * Лестница видна целиком — клиент должен понимать, куда он растёт, — но
   * то, чего мы ещё не построили, не имеет цены в Stripe и кнопки «оплатить».
   * Продать нереализованное — не «предпродажа», а долг, который отдаёт
   * поддержка.
   */
  purchasable: boolean;
  /**
   * Что тариф ВКЛЮЧАЕТ на самом деле.
   *
   * Не украшение списка, а то, что проверяется на сервере. Пока этого поля
   * не было, лестница была только текстом: Start получал и синхронизацию
   * с Drive, и коннекторы — всё, что обещано Business. Обещание, за которым
   * ничего не стоит, замечает первый же клиент, сравнивший два счёта.
   */
  features: PlanFeatures;

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

/**
 * Что тариф включает.
 *
 * Объект с булевыми полями, а не список строк, — и это отступление от спеки
 * намеренное. Со списком опечатка `'configurator'` → `'configuratr'` молча
 * закрывает фичу у всех, и заметит это клиент. С объектом её не пропустит
 * компилятор.
 *
 * `drive` и `connectors` остаются рядом с новыми: спека их не перечисляла,
 * но замки́ по ним уже работают, и убрать их означало бы отдать Starter
 * синхронизацию с Drive, за которую платят на Pro.
 */
export interface PlanFeatures {
  /** Чат-бот на сайте. Есть у всех: это основа продукта, а не надбавка. */
  chatbot: boolean;
  /** Конфигуратор с расчётом цены и PDF-офертой. */
  configurator: boolean;
  /** Папка Google Drive как источник материалов. */
  drive: boolean;
  /** Вызовы во внешние системы: CRM, склад, статус заказа. */
  connectors: boolean;
  /** Дожим по email и SMS после оферты. НЕ РЕАЛИЗОВАНО. */
  followup: boolean;
  /** Этапы производства с фотографиями для покупателя. НЕ РЕАЛИЗОВАНО. */
  productionUpdates: boolean;
  /** Кросспостинг в соцсети. НЕ РЕАЛИЗОВАНО. */
  social: boolean;
  /**
   * Телефонный агент: принимает звонок и записывает на приём. НЕ РЕАЛИЗОВАНО.
   *
   * Заведён раньше кода намеренно: витрина продаёт агентов поштучно, а
   * манифест продукта обязан сослаться на существующий ключ — иначе сборка
   * контракта не пройдёт. Так голосовой попадает в каталог со статусом
   * `planned` и честной пометкой, вместо того чтобы жить обещанием
   * на сайте и ничем в коде.
   */
  voice: boolean;
  /**
   * Аналитик продаж и маркетинга: читает CRM, считает воронку и раз в сутки
   * пишет разбор с планом действий. НЕ РЕАЛИЗОВАНО В ЭТОМ ДВИЖКЕ.
   *
   * Формулировка не случайная. У остальных «не реализовано» значит «кода
   * нет». Здесь код есть — но он отдельный продукт на своём стеке
   * (Python/FastAPI, своя база, свой кабинет), и этим движком не
   * запускается. Ключ заведён, потому что манифест обязан сослаться на
   * существующую возможность; сам агент живёт своей жизнью, пока его не
   * перенесут в монорепозиторий.
   */
  analytics: boolean;
}

export type Feature = keyof PlanFeatures;

/** Ничего, кроме чат-бота. Отправная точка для каждого тарифа. */
const BASE_FEATURES: PlanFeatures = {
  chatbot: true, configurator: false, drive: false, connectors: false,
  followup: false, productionUpdates: false, social: false, voice: false,
  analytics: false,
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Start',
    modelTier: 'base',
    monthlyMessages: 1_000,
    monthlyOffers: 0,
    maxDocuments: 10,
    maxTotalBytes: 20 * 1024 * 1024,
    maxChunks: 2_000,
    priceEur: 79,
    priceEurYearly: 790,
    // Заведение чат-бота — это материалы и виджет на страницу. Клиент делает
    // это сам за вечер, и брать за это отдельно значит продавать ему помощь,
    // которая ему не нужна.
    setupFeeEur: 0,
    purchasable: true,
    features: { ...BASE_FEATURES },
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
    monthlyOffers: 200,
    maxDocuments: 50,
    maxTotalBytes: 100 * 1024 * 1024,
    maxChunks: 10_000,
    priceEur: 199,
    priceEurYearly: 1_990,
    setupFeeEur: 490,
    purchasable: true,
    features: { ...BASE_FEATURES, configurator: true, drive: true },
    highlights: [
      'Tot ce include Start',
      'Configurator cu preț și ofertă PDF pe formularul dumneavoastră',
      'Configurare inițială 490 € — o singură dată',
      '5 000 de mesaje pe lună',
      '50 de documente în baza de cunoștințe',
      'Sincronizare cu Google Drive — puneți fișierul în dosar și gata',
    ],
  },
  /**
   * Business и Enterprise ВИДНЫ, но не покупаются.
   *
   * Лестница нужна целиком: клиент решает, брать ли Pro, глядя на то, куда
   * он растёт. Но их фичи не написаны, цен в Stripe у них нет, и кнопки
   * «оплатить» тоже: продать нереализованное — не предпродажа, а долг,
   * который отдаёт поддержка.
   */
  business: {
    id: 'business',
    name: 'Business',
    // Единственный тариф на старшей модели. Она отвечает точнее на длинных
    // и неоднозначных вопросах — и стоит втрое дороже, что и определяет цену.
    modelTier: 'premium',
    monthlyMessages: 8_000,
    monthlyOffers: 600,
    maxDocuments: 200,
    maxTotalBytes: 500 * 1024 * 1024,
    maxChunks: 50_000,
    priceEur: 349,
    priceEurYearly: 3_490,
    // Заведение follow-up и этапов производства обсуждается вместе с самим
    // тарифом: их ещё нет, и оценивать нечего.
    setupFeeEur: 0,
    purchasable: false,
    features: {
      ...BASE_FEATURES, configurator: true, drive: true, connectors: true,
      followup: true, productionUpdates: true,
    },
    highlights: [
      'Tot ce include Pro',
      'Follow-up automat pe email și SMS după ofertă',
      'Etapele producției cu fotografii pentru cumpărător',
      'Model avansat — răspunsuri mai precise la întrebări complexe',
      '8 000 de mesaje pe lună',
      'Conectori către CRM și alte sisteme',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    modelTier: 'premium',
    monthlyMessages: 30_000,
    monthlyOffers: 3_000,
    maxDocuments: 1_000,
    maxTotalBytes: 2 * 1024 * 1024 * 1024,
    maxChunks: 200_000,
    // Ноль означает «цена по запросу», а не «бесплатно»: у тарифа
    // с индивидуальной ценой её в коде и не должно быть.
    priceEur: 0,
    priceEurYearly: 0,
    setupFeeEur: 0,
    purchasable: false,
    features: {
      chatbot: true, configurator: true, drive: true, connectors: true,
      followup: true, productionUpdates: true, social: true, voice: true,
      // Единственное `false` в тарифе, где всё остальное `true`, — и это
      // не забывчивость. Аналитик не запускается этим движком, поэтому
      // движок его и не может выдать: он отдельный продукт со своим
      // кабинетом и своей подпиской. Поставить здесь `true` значило бы
      // пообещать доступ, которого код не откроет.
      analytics: false,
    },
    highlights: [
      'Tot ce include Business',
      'Postare automată în rețele sociale',
      'Mai multe showroom-uri și roluri de acces',
      'Integrări la comandă',
    ],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Что можно купить прямо сейчас. Всё остальное — «Cere acces anticipat». */
export const PURCHASABLE_PLAN_IDS = PLAN_IDS.filter((id) => PLANS[id].purchasable);

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
export const screensNotInPlan = (planId: string | null | undefined): string[] =>
  Object.entries(SCREEN_FEATURE)
    .filter(([, feature]) => !hasFeature(planId, feature))
    .map(([screen]) => screen);

/**
 * Какому экрану какая фича нужна.
 *
 * Таблицей, а не цепочкой `if`: новый экран под фичей забыть здесь труднее,
 * чем дописать ещё одну ветку и не заметить, что она не сработала.
 */
const SCREEN_FEATURE: Record<string, Feature> = {
  drive: 'drive',
  connectors: 'connectors',
  promotions: 'configurator',
};

/**
 * Единая точка проверки доступа к фиче.
 *
 * Одна на API и на портал. Пока проверок было две, они разъезжались:
 * экран скрывался, а маршрут отвечал — и наоборот.
 *
 * ВАЖНО: здесь проверяется только тариф. Действует ли подписка — вопрос
 * `entitlementOf`, и складывать их надо у вызывающего: тенант в grace-периоде
 * тариф не терял, а автоматизацию теряет.
 */
export const hasFeature = (planId: string | null | undefined, feature: Feature): boolean =>
  planFor(planId).features[feature];

/** Потолок оферт: индивидуальный, если задан, иначе тарифный. */
export const offerCapFor = (planId: string | null | undefined, override: number | null): number =>
  override ?? planFor(planId).monthlyOffers;
