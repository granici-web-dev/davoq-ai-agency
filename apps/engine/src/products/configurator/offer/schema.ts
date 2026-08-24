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
  'hero',          // обложка: фото, марка, кому, номер и дата поверх
  'header',        // марка и реквизиты продавца (сухая альтернатива обложке)
  'meta',          // номер, дата, срок действия, консультант
  'customer',      // кому
  'items',         // позиции заказа: что выбрано и почём
  'pricing',       // разбивка цены, скидка, итог
  'specs',         // характеристики изделия парами
  'notes',         // условия: доставка, подъём, монтаж
  'gallery',       // материалы и фактуры фотографиями
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
  hero: ['title'],
  header: ['company'],
  // `number` необязателен: если включена обложка, номер стоит на ней,
  // и второй раз печатать его в строке реквизитов незачем.
  meta: ['title', 'date', 'validUntil'],
  customer: ['heading'],
  items: ['heading'],
  pricing: ['heading', 'total'],
  specs: ['heading'],
  notes: ['heading'],
  gallery: [],
  legal: [],
  footer: [],
};

export const OFFER_SHAPE: Shape = {
  blocks: true,
  page: {
    size: true, orientation: true,
    margins: { top: true, right: true, bottom: true, left: true },
  },
  theme: {
    fontFamily: true,
    fonts: { '[]': { family: true, src: true, weight: true, style: true } },
    colors: { text: true, muted: true, line: true, accent: true, page: true, onAccent: true },
    fontSize: { title: true, heading: true, base: true, small: true },
  },
  logo: true,
  hero: { image: true, height: true, logo: true, scrim: true },
  gallery: true,
  currency: { code: true, decimals: true },
  text: {
    '*': {
      hero: { title: true, numberLabel: true, lines: true },
      header: { company: true, lines: true },
      meta: { title: true, number: true, date: true, validUntil: true, consultant: true },
      customer: { heading: true, name: true, phone: true, email: true },
      items: {
        heading: true, product: true, quantity: true,
        unitPrice: true, discount: true, total: true,
      },
      pricing: {
        heading: true, subtotal: true, discount: true, vat: true,
        total: true, disclaimer: true,
      },
      specs: { heading: true, label: true, value: true },
      notes: { heading: true, items: true },
      gallery: { heading: true },
      legal: true,
      footer: true,
    },
  },
};

export interface FontFace { family: string; src: string; weight?: number; style?: string }

export interface OfferText {
  hero?: { title: string; numberLabel?: string; lines?: string[] };
  header?: { company: string; lines?: string[] };
  meta?: {
    title: string; number?: string; date: string; validUntil: string; consultant?: string;
  };
  customer?: { heading: string; name?: string; phone?: string; email?: string };
  items?: {
    heading: string; product?: string; quantity?: string;
    unitPrice?: string; discount?: string; total?: string;
  };
  pricing?: {
    heading: string; subtotal?: string; discount?: string; vat?: string;
    total: string; disclaimer?: string;
  };
  specs?: { heading: string; label?: string; value?: string };
  /** `items` здесь — строки условий, а не позиции заказа: это статический текст клиента. */
  notes?: { heading: string; items?: string[] };
  gallery?: { heading?: string };
  legal?: string;
  footer?: string;
}

export interface OfferTemplate {
  blocks: BlockId[];
  /** `size` — имя формата («A4») либо [ширина, высота] в пунктах: у бланка может быть свой. */
  page: {
    size: string | [number, number];
    orientation?: 'portrait' | 'landscape';
    margins: { top: number; right: number; bottom: number; left: number };
  };
  theme: {
    fontFamily: string;
    fonts: FontFace[];
    colors: {
      text: string; muted: string; line: string; accent: string;
      /** Фон страницы: у бланка пилота он бежевый, а не белый. */
      page: string;
      /** Текст поверх акцентной заливки. */
      onAccent: string;
    };
    fontSize: { title: number; heading: number; base: number; small: number };
  };
  logo?: string;
  hero?: {
    image?: string;
    height?: number;
    logo?: string;
    /**
     * Затемнение фотографии под текстом обложки, 0…1.
     *
     * Поверх фотографии стоит белый текст, а фотографию выбирает клиент.
     * Без затемнения светлый снимок — а у мебельщиков они почти все светлые —
     * съедает заголовок и номер оферты. Умолчание не ноль по той же причине,
     * по которой шрифт бланка проверяется на диакритику: нечитаемый документ
     * уходит покупателю молча.
     */
    scrim?: number;
  };
  /** Фотографии материалов: пути к файлам в каталоге клиента. */
  gallery?: string[];
  currency: { code: string; decimals: number };
  text: Record<string, OfferText>;
}

/**
 * Умолчания движка. Третий слой снизу: клиент без единой строки конфига
 * всё равно получает собирающийся бланк — иначе вертикаль обязана была бы
 * повторять оформление целиком, а «нейтральный шаблон» жил бы копипастой.
 */
export const OFFER_DEFAULTS = {
  /**
   * Умолчание — СУХОЙ документ, а не все блоки подряд.
   *
   * `[...OFFER_BLOCKS]` здесь стояло с самого начала и было ошибкой: пока
   * блоков было семь и все они нужны любому бланку, это сходило с рук.
   * Стоило добавить обложку и галерею — и клиент без ниши начал требовать
   * тексты для блоков, которые ему не нужны.
   *
   * Обложка, характеристики, условия и материалы — выбор ниши или клиента,
   * а не то, что движок навязывает всем.
   */
  blocks: ['header', 'meta', 'customer', 'items', 'pricing', 'legal', 'footer'],
  page: { size: 'A4', orientation: 'portrait', margins: { top: 40, right: 40, bottom: 44, left: 40 } },
  // Geist, а не встроенная Helvetica: встроенные шрифты PDF не содержат
  // румынской диакритики и молча выедают её из текста. См. fonts.ts.
  theme: {
    fontFamily: 'Geist',
    fonts: [],
    colors: {
      text: '#111111', muted: '#6b7280', line: '#e5e7eb', accent: '#111111',
      page: '#ffffff', onAccent: '#ffffff',
    },
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

  const hero = (value.hero ?? {}) as Record<string, unknown>;
  // Марка — растр или вектор: SVG движок инлайнит фигурами (см. svg.ts).
  assetKind(value.logo, RASTER_OR_VECTOR, 'offer.logo', where);
  assetKind(hero.logo, RASTER_OR_VECTOR, 'offer.hero.logo', where);
  // Фотография — только растр: за «векторным фото» стоит либо путаница
  // в файлах, либо SVG с растром внутри, который движок не развернёт.
  assetKind(hero.image, RASTER, 'offer.hero.image', where);
  const gallery = value.gallery;
  if (Array.isArray(gallery)) {
    gallery.forEach((file, i) => assetKind(file, RASTER, `offer.gallery[${i}]`, where));
  }

  const scrim = hero.scrim;
  if (scrim !== undefined && (typeof scrim !== 'number' || scrim < 0 || scrim > 1)) {
    throw new Error(`${where}: offer.hero.scrim — число от 0 до 1 («${String(scrim)}» не подходит)`);
  }
}

const RASTER = { test: /\.(png|jpe?g)$/i, what: 'PNG или JPG' };
const RASTER_OR_VECTOR = { test: /\.(png|jpe?g|svg)$/i, what: 'PNG, JPG или SVG' };

function assetKind(
  value: unknown, kind: { test: RegExp; what: string }, path: string, where: string,
): void {
  if (typeof value !== 'string' || kind.test.test(value)) return;
  throw new Error(`${where}: ${path} — ${kind.what} («${value}» не подходит)`);
}
