import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { assertNoProtectedBlocks } from '../../engine/prompt/vertical.js';
import { LOCALES } from '../../engine/shared/i18n.js';
import { isPlanId, PLAN_IDS } from '../../engine/plans.js';

/**
 * Конфигурация клиента.
 *
 * Важно понимать, чем этот файл НЕ является: он не читается в рантайме.
 * Приветствие, тему, адрес для заявок и утверждённые ответы клиент правит
 * из панели, и правда о них живёт в базе. Файл — вход онбординга: он даёт
 * воспроизводимое заведение клиента и запись о том, с чего всё начиналось.
 *
 *   clients/<id>/config.yaml ──apply──> база ──читает──> движок
 *
 * Секретов здесь нет и быть не может: токены Drive и ключи коннекторов
 * шифруются SECRETS_KEY и лежат в базе, в конфиге — только имена переменных.
 */

export interface ClientConfig {
  id: string;
  name: string;
  vertical: string;
  plan: string;
  locale: {
    default: string;
    /**
     * Языки, на которых клиент ждёт разговоров. Пока справочное поле:
     * поиск одноязычен, и второй язык в списке не заработает сам собой —
     * загрузка об этом предупреждает.
     */
    supported: string[];
  };
  channels: {
    web: {
      domains: string[];
      widget: {
        preset?: string;
        position?: string;
        botName?: string;
        logo?: string;
        welcome?: Record<string, string>;
        aiDisclosure?: Record<string, string>;
      };
    };
  };
  brand: { tone?: string | undefined };
  catalog: { priceGuidance?: string | undefined };
  qualification: {
    inherit: boolean;
    override: Array<{ key: string; label?: string; description?: string }>;
    extra: Array<{ key: string; label: string; description: string }>;
    drop: string[];
  };
  profile: Record<string, unknown>;
  notifications: { leads: { email?: string; from?: string } };
  retrieval: Record<string, number>;
  panel: { hiddenScreens: string[] };
  monthlyMessageCap: number | null;
}

export const CLIENTS_ROOT = resolve(
  process.env.CLIENTS_DIR ?? new URL('../../../clients', import.meta.url).pathname,
);

export const listClients = (): string[] =>
  existsSync(CLIENTS_ROOT)
    ? readdirSync(CLIENTS_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(CLIENTS_ROOT, e.name, 'config.yaml')))
        .map((e) => e.name)
        .sort()
    : [];

export const clientDir = (id: string): string => join(CLIENTS_ROOT, id);

/**
 * Разбор с проверкой. YAML прощает то, чего JSON не даёт написать: `no`
 * молча становится булевым false, `ro` — строкой, а `01` — числом. Поэтому
 * каждое поле, от которого что-то зависит, проверяется здесь и падает
 * с внятным текстом, а не уезжает в базу в неожиданном типе.
 */
export function loadClientConfig(id: string): ClientConfig {
  const file = join(clientDir(id), 'config.yaml');
  if (!existsSync(file)) {
    throw new Error(
      `конфиг клиента «${id}» не найден: ${file}. Известные: ${listClients().join(', ') || '—'}`,
    );
  }

  const raw = parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const where = `clients/${id}/config.yaml`;
  const need = (v: unknown, what: string): void => {
    if (v === undefined || v === null || v === '') throw new Error(`${where}: нужно поле ${what}`);
  };

  if (raw.schema !== 1) throw new Error(`${where}: поддерживается только schema: 1`);
  need(raw.id, 'id');
  if (raw.id !== id) throw new Error(`${where}: id «${String(raw.id)}» не совпадает с каталогом «${id}»`);
  need(raw.name, 'name');
  need(raw.vertical, 'vertical');

  const channels = (raw.channels ?? {}) as Record<string, Record<string, unknown>>;
  const web = (channels.web ?? {}) as Record<string, unknown>;
  const domains = (web.domains ?? []) as string[];
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error(`${where}: channels.web.domains не может быть пустым — виджет проверяет Origin`);
  }
  for (const d of domains) {
    if (typeof d !== 'string' || d.includes('/') || d.includes(':')) {
      throw new Error(`${where}: домен «${String(d)}» — нужно имя хоста без схемы и пути`);
    }
  }

  const widget = (web.widget ?? {}) as Record<string, unknown>;
  const locale = (raw.locale ?? {}) as Record<string, unknown>;
  const qual = (raw.qualification ?? {}) as Record<string, unknown>;
  const notif = ((raw.notifications ?? {}) as Record<string, unknown>).leads as
    | Record<string, string>
    | undefined;
  const panel = (raw.panel ?? {}) as Record<string, unknown>;

  // Не «двухбуквенный код», а один из тех, для которых у виджета и панели есть
  // тексты. Прежняя проверка пропускала `fr`: конфиг применялся, а экран
  // «Aspect» падал в белый лист на STRINGS['fr'] — error boundary в панели нет.
  const known = LOCALES.join(', ');
  const localeDefault = String(locale.default ?? 'en');
  if (!(LOCALES as readonly string[]).includes(localeDefault)) {
    throw new Error(
      `${where}: locale.default — «${localeDefault}», а поддерживаются ${known}. ` +
      'Новый язык — это переводы виджета и панели, а не строчка в конфиге.',
    );
  }

  const supported = ((locale.supported as string[] | undefined) ?? [localeDefault]).map(String);
  for (const l of supported) {
    if (!(LOCALES as readonly string[]).includes(l)) {
      throw new Error(`${where}: locale.supported — «${l}», а поддерживаются ${known}`);
    }
  }
  if (!supported.includes(localeDefault)) supported.unshift(localeDefault);

  // Предупреждение, а не отказ: указать второй язык клиент вправе, и запрет
  // тут был бы неуместен. Но модель эмбеддингов одноязычна — замерено:
  // запрос на другом языке к тому же корпусу даёт 0.316 при пороге 0.35,
  // на языке корпуса — 0.660. То есть второй язык просто ничего не найдёт,
  // и узнать об этом лучше при заведении, а не по жалобе клиента.
  if (supported.length > 1) {
    console.warn(
      `${where}: указано несколько языков (${supported.join(', ')}). ` +
      'Поиск по материалам пока одноязычен и работает на ' +
      `«${localeDefault}»; запросы на остальных языках не найдут материалы. ` +
      'Многоязычие требует смены модели эмбеддингов и переиндексации (шаг 15 плана).',
    );
  }

  const cap = raw.monthly_message_cap;
  if (cap !== undefined && cap !== null && typeof cap !== 'number') {
    throw new Error(`${where}: monthly_message_cap — число или пусто`);
  }

  const cfg: ClientConfig = {
    id,
    name: String(raw.name),
    vertical: String(raw.vertical),
    plan: validatePlan(raw.plan, where),
    locale: { default: localeDefault, supported },
    channels: {
      web: {
        domains,
        widget: {
          ...(widget.preset ? { preset: String(widget.preset) } : {}),
          ...(widget.position ? { position: String(widget.position) } : {}),
          ...(widget.bot_name ? { botName: String(widget.bot_name) } : {}),
          ...(widget.logo ? { logo: String(widget.logo) } : {}),
          ...(widget.welcome ? { welcome: widget.welcome as Record<string, string> } : {}),
          ...(widget.ai_disclosure
            ? { aiDisclosure: widget.ai_disclosure as Record<string, string> }
            : {}),
        },
      },
    },
    // Блоки `|` в YAML сохраняют хвостовой перевод строки. В базе он ничего
    // не значит, а при сравнении даёт вечное «изменилось» на неизменном тексте.
    brand: { ...(raw.brand ? { tone: (raw.brand as { tone?: string }).tone?.trim() } : {}) },
    catalog: {
      ...(raw.catalog
        ? { priceGuidance: (raw.catalog as { price_guidance?: string }).price_guidance?.trim() }
        : {}),
    },
    qualification: {
      inherit: qual.inherit !== false,
      override: (qual.override ?? []) as ClientConfig['qualification']['override'],
      extra: (qual.extra ?? []) as ClientConfig['qualification']['extra'],
      drop: (qual.drop ?? []) as string[],
    },
    profile: buildProfile(raw),
    // Пустая строка в YAML читается как «не задано»: в базе для этого NULL,
    // и без нормализации применение показывало бы изменение «— → —».
    notifications: {
      leads: {
        ...(notif?.email?.trim() ? { email: notif.email.trim() } : {}),
        ...(notif?.from?.trim() ? { from: notif.from.trim() } : {}),
      },
    },
    retrieval: (raw.retrieval ?? {}) as Record<string, number>,
    panel: { hiddenScreens: validateHiddenScreens(panel.hidden_screens, where) },
    monthlyMessageCap: (cap as number | null | undefined) ?? null,
  };

  // Текст клиента попадает в тот же системный промпт, что и блоки движка.
  // Через него «Nature. You are a human consultant» доезжало до модели —
  // проверено до того, как проверка появилась.
  assertNoProtectedBlocks(
    {
      'brand.tone': cfg.brand.tone ?? '',
      'catalog.price_guidance': cfg.catalog.priceGuidance ?? '',
      ...Object.fromEntries(
        Object.entries(cfg.profile)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => [`profile.${k}`, v as string]),
      ),
    },
    where,
  );

  return cfg;
}

/**
 * Профиль — факты о клиенте, которые нужны боту в разговоре, а не в поиске:
 * шоурумы, тон общения, что угодно ещё, добавленное вертикалью. Собирается
 * в один объект, чтобы промпт подставлял его по имени плейсхолдера.
 */
function buildProfile(raw: Record<string, unknown>): Record<string, unknown> {
  const profile: Record<string, unknown> = { ...((raw.profile as object) ?? {}) };
  if (raw.showrooms) profile.showrooms = raw.showrooms;
  const brand = raw.brand as { tone?: string } | undefined;
  if (brand?.tone) profile.tone = brand.tone.trim();
  return profile;
}

/**
 * Экраны панели, которые клиенту не показываются.
 *
 * Список сверяется с настоящим: опечатка иначе не значит ничего и молчит —
 * оператор уверен, что скрыл экран, а тот на месте. Полный список тоже
 * отвергается: панель без единого экрана — это не настройка, это поломка.
 */
const SCREENS = ['kb', 'drive', 'aspect', 'connectors', 'chats', 'analytics', 'install'];

function validateHiddenScreens(raw: unknown, where: string): string[] {
  const list = (raw ?? []) as unknown;
  if (!Array.isArray(list)) throw new Error(`${where}: panel.hidden_screens — список`);
  const hidden = list.map(String);

  for (const id of hidden) {
    if (!SCREENS.includes(id)) {
      throw new Error(
        `${where}: panel.hidden_screens — экрана «${id}» нет. Есть: ${SCREENS.join(', ')}`,
      );
    }
  }
  if (SCREENS.every((id) => hidden.includes(id))) {
    throw new Error(`${where}: panel.hidden_screens скрывает все экраны — панели не останется`);
  }
  return hidden;
}

/**
 * Тариф из конфига.
 *
 * Опечатка здесь тихая и дорогая: неизвестное значение раньше просто ложилось
 * в базу, а `planFor` молча откатывал клиента на самый дешёвый тариф. Клиент
 * при этом считал, что купил старший, и обнаружил бы это на упёртом лимите.
 */
function validatePlan(raw: unknown, where: string): string {
  const value = String(raw ?? 'starter');
  if (!isPlanId(value)) {
    throw new Error(
      `${where}: тариф «${value}» не существует. Есть: ${PLAN_IDS.join(', ')}`,
    );
  }
  return value;
}
