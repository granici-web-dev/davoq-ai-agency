import { assertRequired, assertShape, type Shape } from '../config/shape.js';

/**
 * Бланк оферты: что можно описать конфигом.
 *
 * Бланк описывается ДЕКЛАРАТИВНО и рендерится одним компонентом движка.
 * Компонент на клиента (`clients/<id>/pdf/template.tsx`) означал бы
 * разработчика, ревью и деплой на каждую продажу, а через год — столько
 * разошедшихся форков вёрстки, сколько клиентов. Поэтому набор блоков
 * ЗАКРЫТ: клиент выбирает из них и оформляет, но не заводит свои.
 *
 * Клиенту нужен блок, которого здесь нет, — это повод расширить набор,
 * а не сделать исключение для одного клиента.
 */

export const OFFER_BLOCKS = [
  'header',        // марка и реквизиты продавца
  'meta',          // номер, дата, срок действия
  'customer',      // кому
  'configuration', // что выбрано
  'pricing',       // разбивка цены, скидка, итог
  'legal',         // юртекст
  'footer',        // подпись страницы
] as const;

export type BlockId = (typeof OFFER_BLOCKS)[number];

const isBlockId = (v: string): v is BlockId => (OFFER_BLOCKS as readonly string[]).includes(v);

/**
 * Что обязано быть в текстах локали, если блок включён.
 *
 * Проверяется для КАЖДОЙ поддерживаемой локали. Пропущенный перевод иначе
 * доезжает до PDF словом `undefined` в шапке коммерческого документа —
 * и замечает это покупатель, а не мы.
 */
const REQUIRED_TEXT: Record<BlockId, string[]> = {
  header: ['company'],
  meta: ['title', 'number', 'date', 'validUntil'],
  customer: ['heading'],
  configuration: ['heading'],
  pricing: ['heading', 'total'],
  legal: [],
  footer: [],
};

export const OFFER_SHAPE: Shape = {
  blocks: true,
  page: { size: true, margins: { top: true, right: true, bottom: true, left: true } },
  theme: {
    fontFamily: true,
    fonts: { '[]': { family: true, src: true, weight: true, style: true } },
    colors: { text: true, muted: true, line: true, accent: true },
    fontSize: { title: true, heading: true, base: true, small: true },
  },
  logo: true,
  currency: { code: true, decimals: true },
  text: {
    '*': {
      header: { company: true, lines: true },
      meta: { title: true, number: true, date: true, validUntil: true },
      customer: { heading: true, name: true, phone: true, email: true },
      configuration: { heading: true, option: true, value: true },
      pricing: { heading: true, list: true, discount: true, total: true, disclaimer: true },
      legal: true,
      footer: true,
    },
  },
};

export interface FontFace { family: string; src: string; weight?: number; style?: string }

export interface OfferText {
  header?: { company: string; lines?: string[] };
  meta?: { title: string; number: string; date: string; validUntil: string };
  customer?: { heading: string; name?: string; phone?: string; email?: string };
  configuration?: { heading: string; option?: string; value?: string };
  pricing?: { heading: string; list?: string; discount?: string; total: string; disclaimer?: string };
  legal?: string;
  footer?: string;
}

export interface OfferTemplate {
  blocks: BlockId[];
  page: { size: string; margins: { top: number; right: number; bottom: number; left: number } };
  theme: {
    fontFamily: string;
    fonts: FontFace[];
    colors: { text: string; muted: string; line: string; accent: string };
    fontSize: { title: number; heading: number; base: number; small: number };
  };
  logo?: string;
  currency: { code: string; decimals: number };
  text: Record<string, OfferText>;
}

/**
 * Умолчания движка. Третий слой снизу: клиент без единой строки конфига
 * всё равно получает собирающийся бланк — иначе вертикаль обязана была бы
 * повторять оформление целиком, а «нейтральный шаблон» жил бы копипастой.
 */
export const OFFER_DEFAULTS = {
  blocks: [...OFFER_BLOCKS],
  page: { size: 'A4', margins: { top: 40, right: 40, bottom: 44, left: 40 } },
  // Geist, а не встроенная Helvetica: встроенные шрифты PDF не содержат
  // румынской диакритики и молча выедают её из текста. См. fonts.ts.
  theme: {
    fontFamily: 'Geist',
    fonts: [],
    colors: { text: '#111111', muted: '#6b7280', line: '#e5e7eb', accent: '#111111' },
    fontSize: { title: 20, heading: 11, base: 10, small: 8 },
  },
  currency: { code: 'RON', decimals: 2 },
  text: {},
} as const;

/** Проверка после слияния слоёв: недостающее мог дать любой из них. */
export function validateOffer(
  value: Record<string, unknown>, locales: string[], where: string,
): asserts value is OfferTemplate & Record<string, unknown> {
  assertShape(value, OFFER_SHAPE, where, 'offer');

  const blocks = value.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error(`${where}: offer.blocks — непустой список`);
  }
  const seen = new Set<string>();
  for (const b of blocks) {
    if (typeof b !== 'string' || !isBlockId(b)) {
      throw new Error(
        `${where}: блок «${String(b)}» движку неизвестен. ` +
        `Есть: ${OFFER_BLOCKS.join(', ')}. Нужен новый — он добавляется в движок, а не в конфиг клиента.`,
      );
    }
    if (seen.has(b)) throw new Error(`${where}: блок «${b}» указан дважды`);
    seen.add(b);
  }

  const text = (value.text ?? {}) as Record<string, Record<string, unknown>>;
  for (const locale of locales) {
    const t = text[locale];
    if (!t) throw new Error(`${where}: нет текстов для локали «${locale}» — она объявлена у клиента`);
    for (const block of blocks as BlockId[]) {
      const required = REQUIRED_TEXT[block];
      if (required.length === 0) continue;
      const section = t[block];
      if (!section || typeof section !== 'object') {
        throw new Error(`${where}: блок «${block}» включён, но text.${locale}.${block} не задан`);
      }
      assertRequired(section as Record<string, unknown>, required, where, `text.${locale}.${block}`);
    }
  }

  // Логотип рисуется как растр: react-pdf кладёт SVG только отдельным деревом
  // элементов, а не картинкой. Молча пропустить .svg значит отдать клиенту
  // бланк с пустым местом вместо марки.
  const logo = value.logo;
  if (typeof logo === 'string' && !/\.(png|jpe?g)$/i.test(logo)) {
    throw new Error(
      `${where}: логотип бланка — PNG или JPG («${logo}» не подходит). ` +
      'Вектор в PDF пойдёт после того, как движок научится инлайнить SVG.',
    );
  }
}
