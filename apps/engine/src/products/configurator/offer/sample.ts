import type { OfferData, OfferItem } from './render.js';

/**
 * Выдуманные данные для предпросмотра бланка.
 *
 * Намеренно выдуманные, а не данные пилота: сверка бланка идёт до того, как
 * существует расчёт, и класть настоящие имя с телефоном в файл, который уедет
 * в переписку, незачем.
 *
 * По составу образец повторяет НАСТОЯЩИЙ документ пилота: несколько моделей,
 * доставка и монтаж отдельными позициями, скидка на товары, НДС строкой.
 * Оферта на одну конфигурацию не покрыла бы ни одного их реального заказа.
 */

/** Ставка НДС в Румынии с августа 2025 года. */
const VAT_RATE = 21;
const DISCOUNT_PERCENT = 18;

interface Draft { title: string; lines: string[]; qty: number; unitBani: number; discountable: boolean }

const DRAFTS: Record<string, Draft[]> = {
  ro: [
    { title: 'Pat Allure Life 180×200', qty: 1, unitBani: 732_600, discountable: true,
      lines: ['Înălțime tetieră 92 cm', 'Grosime cadru 7 cm', 'Structură lemn stratificat', 'Garanție 12/36 luni'] },
    { title: 'Perete tapițat Antonia 220×247 cm', qty: 1, unitBani: 543_400, discountable: true,
      lines: ['Dimensiuni conform schiței', 'Material structură PAL cantuit'] },
    { title: 'Canapea Life', qty: 1, unitBani: 787_600, discountable: true,
      lines: ['Înălțime spătar 70 cm', 'Șezut spumă poliuretanică + spumă cu memorie', 'Extensibil: nu'] },
    { title: 'Canapea Lofty', qty: 1, unitBani: 2_764_600, discountable: true,
      lines: ['Tapițerie conform schiței', 'Tip cusătură decorativă'] },
    { title: 'Livrare 100–200 km', qty: 1, unitBani: 60_000, discountable: false, lines: [] },
    { title: 'Manipulare și montaj per produs', qty: 4, unitBani: 30_000, discountable: false,
      lines: ['Se calculează pentru fiecare produs din comandă'] },
  ],
  ru: [
    { title: 'Кровать Allure Life 180×200', qty: 1, unitBani: 732_600, discountable: true,
      lines: ['Высота изголовья 92 см', 'Толщина каркаса 7 см', 'Гарантия 12/36 месяцев'] },
    { title: 'Стеновая панель Antonia 220×247 см', qty: 1, unitBani: 543_400, discountable: true, lines: [] },
    { title: 'Диван Life', qty: 1, unitBani: 787_600, discountable: true,
      lines: ['Высота спинки 70 см', 'Пена + memory foam'] },
    { title: 'Диван Lofty', qty: 1, unitBani: 2_764_600, discountable: true, lines: [] },
    { title: 'Доставка 100–200 км', qty: 1, unitBani: 60_000, discountable: false, lines: [] },
    { title: 'Подъём и сборка', qty: 4, unitBani: 30_000, discountable: false, lines: [] },
  ],
  en: [
    { title: 'Allure Life bed 180×200', qty: 1, unitBani: 732_600, discountable: true,
      lines: ['Headboard height 92 cm', 'Frame thickness 7 cm', 'Warranty 12/36 months'] },
    { title: 'Antonia upholstered wall 220×247 cm', qty: 1, unitBani: 543_400, discountable: true, lines: [] },
    { title: 'Life sofa', qty: 1, unitBani: 787_600, discountable: true,
      lines: ['Backrest height 70 cm', 'PU foam + memory foam seat'] },
    { title: 'Lofty sofa', qty: 1, unitBani: 2_764_600, discountable: true, lines: [] },
    { title: 'Delivery 100–200 km', qty: 1, unitBani: 60_000, discountable: false, lines: [] },
    { title: 'Handling and assembly', qty: 4, unitBani: 30_000, discountable: false, lines: [] },
  ],
};

const PROMO: Record<string, string> = {
  ro: `Reducere de campanie −${DISCOUNT_PERCENT}%`,
  ru: `Скидка по акции −${DISCOUNT_PERCENT}%`,
  en: `Campaign discount −${DISCOUNT_PERCENT}%`,
};

export function sampleOffer(locale: string): OfferData {
  const drafts = DRAFTS[locale] ?? DRAFTS.ro!;

  // Считается целыми: образец заодно показывает, что итог сходится без дробей.
  let subtotalBani = 0;
  let discountBani = 0;
  const items: OfferItem[] = drafts.map((d) => {
    const gross = d.unitBani * d.qty;
    const off = d.discountable ? Math.round((gross * DISCOUNT_PERCENT) / 100) : 0;
    subtotalBani += gross;
    discountBani += off;
    return {
      title: d.title,
      ...(d.lines.length > 0 ? { lines: d.lines } : {}),
      quantity: d.qty,
      unitBani: d.unitBani,
      ...(off > 0 ? { discountBani: off, discountPercent: DISCOUNT_PERCENT } : {}),
      totalBani: gross - off,
    };
  });

  const net = subtotalBani - discountBani;
  const vatBani = Math.round((net * VAT_RATE) / 100);

  return {
    locale,
    number: '2026-0148',
    date: new Date('2026-03-17T10:00:00Z'),
    validUntil: new Date('2026-04-16T10:00:00Z'),
    customer: { name: 'Ion Popescu', phone: '+40 700 000 000', email: 'client@example.com' },
    items,
    pricing: {
      subtotalBani, discountBani, vatBani, vatRate: VAT_RATE,
      totalBani: net + vatBani,
      promo: { label: PROMO[locale] ?? PROMO.ro!, validUntil: new Date('2026-03-31T23:59:59Z') },
    },
  };
}
