import { withTenant } from '../../../engine/db/pool.js';
import { put as storagePut, remove as storageRemove } from '../../../engine/ingest/storage.js';
import type { FlowConfig } from '../flow/schema.js';
import { resolveSelections, type ResolvedSelections, type Selections } from '../flow/select.js';
import { priceOf, type Discount, type PriceResult } from '../pricing/engine.js';
import type { Configurator } from '../load.js';
import { renderOffer, type OfferData, type OfferItem } from './render.js';
import type { OfferTemplate } from './schema.js';

/**
 * Выпуск оферты.
 *
 * Цена ПЕРЕСЧИТЫВАЕТСЯ здесь заново, из выбора. То, что виджет показывал
 * посетителю, сюда не приходит вовсе: сумма в коммерческом документе не может
 * зависеть от того, что прислал браузер. Совпадёт она с показанной по той же
 * причине, по какой совпадала на экране, — обе считает один и тот же движок.
 *
 * Номер выдаётся В ТРАНЗАКЦИИ, `UPDATE ... RETURNING` по строке тенанта.
 * Строка при этом блокируется, и два посетителя, нажавшие кнопку в одну
 * секунду, получают разные номера. Счётчик в конфиге для этого не годился бы
 * ни в каком виде: он читается, а не блокируется.
 *
 * Ошибка на любом шаге откатывает ВСЁ, включая номер: дыра в нумерации
 * коммерческих документов — это вопрос от бухгалтера клиента, на который
 * никто не сможет ответить.
 */

export interface IssueRequest {
  tenantId: string;
  /** Локаль оферты. Уже проверена: тенант её объявил. */
  locale: string;
  selections: Selections;
  contact: { name?: string; email?: string; phone?: string };
  /** Обязательное согласие уже проверено маршрутом — сюда приходит только факт. */
  consentMarketing: boolean;
  conversationId?: string | undefined;
  /** Подтверждённая человеком акция, если есть. */
  discount?: Discount | undefined;
  promoLabel?: string | undefined;
  promoId?: string | undefined;
  promoValidUntil?: string | null | undefined;
  now?: Date;
}

export interface IssuedOffer {
  id: string;
  leadId: string;
  number: string;
  price: PriceResult;
  storageKey: string;
  validUntil: Date;
  pdf: Buffer;
}

export async function issueOffer(
  cfg: Configurator, template: OfferTemplate, req: IssueRequest,
): Promise<IssuedOffer> {
  const resolved = resolveSelections(cfg.flow, req.selections, 'выпуск оферты');
  const price = priceOf(cfg.flow, cfg.pricing, req.selections, req.discount, 'выпуск оферты');

  const now = req.now ?? new Date();
  const validUntil = new Date(now.getTime() + template.validDays * 86400_000);

  let storageKey = '';
  try {
    return await withTenant(req.tenantId, async (client) => {
      const { rows: numbered } = await client.query<{ n: number; fmt: string }>(
        `UPDATE tenants
            SET offer_number_next = offer_number_next + 1
          WHERE id = $1
        RETURNING offer_number_next - 1 AS n, offer_number_format AS fmt`,
        [req.tenantId],
      );
      const allocated = numbered[0];
      if (!allocated) throw new Error('выпуск оферты: тенант не найден');
      const number = formatNumber(allocated.fmt, allocated.n, now);

      const data = offerData(cfg.flow, template, resolved, price, {
        locale: req.locale, number, date: now, validUntil,
        customer: req.contact, promoLabel: req.promoLabel,
      });
      const pdf = await renderOffer(template, data);

      const { rows: leads } = await client.query<{ id: string }>(
        `INSERT INTO leads (tenant_id, conversation_id, name, email, phone, product, payload)
         VALUES ($1, $2, $3, $4, $5, 'configurator', $6)
         RETURNING id`,
        [
          req.tenantId, req.conversationId ?? null,
          req.contact.name ?? null, req.contact.email ?? null, req.contact.phone ?? null,
          // Согласия с отметкой времени — вместе с заявкой, а не отдельным
          // журналом: доказывать придётся именно про этот контакт.
          JSON.stringify({
            selections: req.selections,
            // Читаемая конфигурация лежит рядом с сырым выбором.
            // Директор в панели смотрит на заявку, а не на конфиг: `model:
            // free-comfort` ему ничего не говорит, а расшифровывать
            // идентификаторы панель не сможет — прайса у неё нет, да и
            // конфиг к тому времени поменяется.
            summary: summaryOf(cfg.flow, resolved, req.locale),
            listPriceBani: price.listPriceBani,
            // Сумма строкой — по той же причине, что и `summary`: панель не
            // знает ни валюты клиента, ни числа знаков после запятой, и
            // форматировать ей нечем.
            totalFormatted: new Intl.NumberFormat(req.locale, {
              style: 'currency', currency: template.currency.code,
              minimumFractionDigits: template.currency.decimals,
              maximumFractionDigits: template.currency.decimals,
            }).format(price.totalBani / 10 ** template.currency.decimals),
            discountBani: price.discountBani,
            totalBani: price.totalBani,
            locale: req.locale,
            consent: { required: true, marketing: req.consentMarketing, at: now.toISOString() },
            /**
             * Условия акции НА МОМЕНТ РАСЧЁТА, а не ссылка на неё.
             * Акция потом изменится или истечёт, а оферта останется, и
             * объяснять покупателю придётся ту скидку, которую он видел.
             */
            ...(req.promoLabel ? {
              appliedPromo: {
                id: req.promoId ?? null,
                label: req.promoLabel,
                validUntil: req.promoValidUntil ?? null,
                discountBani: price.discountBani,
              },
            } : {}),
          }),
        ],
      );
      const leadId = leads[0]!.id;

      const { rows: offers } = await client.query<{ id: string }>(
        `INSERT INTO offers
           (tenant_id, lead_id, number, locale, selections, pricing, total_bani, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          req.tenantId, leadId, number, req.locale,
          JSON.stringify(req.selections), JSON.stringify(price),
          price.totalBani, validUntil,
        ],
      );
      const id = offers[0]!.id;

      // Ключ строится из uuid оферты: имя файла не должно содержать ни номера,
      // ни имени покупателя — по каталогу хранилища не должно читаться, кто
      // и что заказал.
      storageKey = `${req.tenantId}/offers/${id}.pdf`;
      await storagePut(storageKey, pdf);
      await client.query('UPDATE offers SET storage_key = $2 WHERE id = $1', [id, storageKey]);

      return { id, leadId, number, price, storageKey, validUntil, pdf };
    });
  } catch (err) {
    // Файл записан, транзакция не прошла: строки на него не осталось, значит
    // и файла быть не должно. Иначе он лежит вечно и о нём никто не знает.
    if (storageKey) await storageRemove(storageKey).catch(() => undefined);
    throw err;
  }
}

/**
 * Конфигурация словами, на языке оферты.
 *
 * Порядок — порядок шагов, а не порядок, в котором посетитель отвечал:
 * продавец читает её как бриф, и бриф должен читаться одинаково каждый раз.
 * Подписи берутся из ФЛОУ: числовые шаги в `picks` не попадают, и без флоу
 * вместо «Lățimea (cm): 310 cm» вышло бы «width: 310».
 */
export function summaryOf(flow: FlowConfig, resolved: ResolvedSelections, locale: string): string[] {
  const label = (map: Record<string, string>): string => map[locale] ?? Object.values(map)[0] ?? '';
  return flow.steps.flatMap((step) => {
    const chosen = resolved.picks.filter((p) => p.step.id === step.id);
    if (chosen.length > 0) {
      return [`${label(step.title)}: ${chosen.map((p) => label(p.option.label)).join(', ')}`];
    }
    const n = resolved.numbers[step.id];
    if (n !== undefined) {
      return [`${label(step.title)}: ${n}${step.input?.unit ? ' ' + step.input.unit : ''}`];
    }
    const text = resolved.texts[step.id];
    return text ? [`${label(step.title)}: ${text}`] : [];
  });
}

/** `{n}` — счётчик, `{year}` — год. Счётчик сквозной и не сбрасывается. */
function formatNumber(format: string, n: number, now: Date): string {
  return format
    .replace('{n}', String(n))
    .replace('{year}', String(now.getUTCFullYear()));
}

interface Meta {
  locale: string;
  number: string;
  date: Date;
  validUntil: Date;
  customer: { name?: string; email?: string; phone?: string };
  promoLabel?: string | undefined;
}

/**
 * Из выбора — в бланк.
 *
 * Одна конфигурация даёт ОДНУ позицию: посетитель собрал одно изделие.
 * Многопозиционная оферта из их практики (девять моделей на квартиру)
 * собирается продавцом из нескольких таких — бланк это умеет, конфигуратор
 * пока нет, и притворяться, что умеет, значит показать пустую таблицу.
 */
export function offerData(
  flow: FlowConfig, template: OfferTemplate,
  resolved: ResolvedSelections, price: PriceResult, meta: Meta,
): OfferData {
  const locale = meta.locale;
  const label = (map: Record<string, string>): string => map[locale] ?? Object.values(map)[0] ?? '';

  // Заголовок позиции — первый выбор с базовой ценой: это и есть изделие.
  const main = resolved.picks.find((p) => p.option.priceEffect?.kind === 'base');
  const lines = resolved.picks
    .filter((p) => p !== main)
    .map((p) => `${label(p.step.title)}: ${label(p.option.label)}`);

  // Размеры и пожелания идут в характеристики, а не в строку позиции:
  // в бланке под них есть блок, и менеджер читает их именно там.
  const specs = flow.steps.flatMap((step) => {
    const n = resolved.numbers[step.id];
    if (n !== undefined) {
      return [{ label: label(step.title), value: `${n}${step.input?.unit ? ' ' + step.input.unit : ''}` }];
    }
    const text = resolved.texts[step.id];
    return text ? [{ label: label(step.title), value: text }] : [];
  });

  const item: OfferItem = {
    title: main ? label(main.option.label) : label(flow.steps[0]?.title ?? {}),
    lines,
    quantity: price.breakdown.units.quantity,
    totalBani: price.finalPriceBani,
  };

  return {
    locale,
    number: meta.number,
    date: meta.date,
    validUntil: meta.validUntil,
    customer: meta.customer,
    specs,
    items: [item],
    pricing: {
      subtotalBani: price.listPriceBani,
      discountBani: price.discountBani,
      ...(price.vatRate > 0 ? { vatBani: price.vatBani, vatRate: price.vatRate / 100 } : {}),
      totalBani: price.totalBani,
      ...(meta.promoLabel ? { promo: { label: meta.promoLabel } } : {}),
    },
  };
}
