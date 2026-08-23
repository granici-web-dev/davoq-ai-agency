import type { OfferData } from './render.js';

/**
 * Выдуманные данные для предпросмотра бланка.
 *
 * Намеренно выдуманные, а не «данные пилота»: сверка бланка идёт до того,
 * как существует расчёт, а класть настоящие имя и телефон в файл, который
 * потом улетит в переписку с клиентом, незачем.
 *
 * Числа подобраны так, чтобы бланк показал всё сразу: скидку (значит,
 * зачёркнутую цену), надбавки в разбивке и длинное название опции —
 * именно на длинном названии ломается вёрстка колонок.
 */
export function sampleOffer(locale: string): OfferData {
  const date = new Date('2026-03-17T10:00:00Z');
  const validUntil = new Date('2026-04-16T10:00:00Z');

  const byLocale: Record<string, Array<[string, string]>> = {
    ro: [
      ['Produs', 'Canapea de colț pe comandă'],
      ['Dimensiuni', '2.80 × 1.90 m, colț pe stânga'],
      ['Umplutură', 'Spumă HR 35 kg/m³ cu strat de puf'],
      ['Tapițerie', 'Țesătură antipată, categoria 3'],
      ['Culoare', 'Grafit'],
      ['Opțiuni', 'Funcție de dormit, ladă de depozitare'],
    ],
    ru: [
      ['Изделие', 'Угловой диван на заказ'],
      ['Размеры', '2.80 × 1.90 м, угол слева'],
      ['Наполнитель', 'Пена HR 35 кг/м³ со слоем пуха'],
      ['Обивка', 'Ткань антикоготь, категория 3'],
      ['Цвет', 'Графит'],
      ['Опции', 'Спальное место, короб для белья'],
    ],
    en: [
      ['Product', 'Made-to-order corner sofa'],
      ['Dimensions', '2.80 × 1.90 m, left corner'],
      ['Filling', 'HR foam 35 kg/m³ with a down layer'],
      ['Upholstery', 'Scratch-resistant fabric, category 3'],
      ['Colour', 'Graphite'],
      ['Options', 'Sleeping function, storage box'],
    ],
  };

  const lines = byLocale[locale] ?? byLocale.ro!;
  const prices = [0, 0, 45_000, 0, 0, 120_000];

  return {
    locale,
    number: '2026-0148',
    date,
    validUntil,
    customer: { name: 'Ion Popescu', phone: '+40 700 000 000', email: 'client@example.com' },
    configuration: lines.map(([label, value], i) => ({
      label, value,
      ...(prices[i] ? { priceBani: prices[i]! } : {}),
    })),
    pricing: {
      listBani: 1_845_000,
      discountBani: 184_500,
      totalBani: 1_660_500,
      promo: {
        label: ({
          ro: 'Reducere de sezon −10%',
          ru: 'Сезонная скидка −10%',
          en: 'Seasonal discount −10%',
        } as Record<string, string>)[locale] ?? 'Reducere de sezon −10%',
        validUntil: new Date('2026-03-31T23:59:59Z'),
      },
    },
  };
}
