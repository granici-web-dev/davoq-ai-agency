import { withTenant } from '../../../engine/db/pool.js';
import type { Discount } from '../pricing/engine.js';
import {
  fingerprint, type Promotion, type PromoDiscount, type PromoSource,
  type PromoState, type PromoTerms,
} from './schema.js';

/**
 * Хранение акций.
 *
 * Главное правило здесь одно: повторный проход НЕ ТРОГАЕТ состояние акции,
 * условия которой не изменились. Отклонённая не возвращается каждые шесть
 * часов, подтверждённая не сбрасывается в черновики. Подтверждение, которое
 * показывают снова и снова, перестают читать — а потом подтверждают не глядя,
 * и защита превращается в лишний клик.
 */

interface Row {
  id: string; source: PromoSource; state: PromoState;
  label: Record<string, string>; scope: 'sitewide' | 'models';
  model_ids: string[]; discount: PromoDiscount; valid_until: string | Date | null;
  fingerprint: string; source_url: string | null;
  created_at: Date; decided_at: Date | null;
}

const toPromotion = (r: Row): Promotion => ({
  id: r.id, source: r.source, state: r.state,
  label: r.label, scope: r.scope, modelIds: r.model_ids,
  discount: r.discount,
  validUntil: r.valid_until ? day(r.valid_until) : null,
  fingerprint: r.fingerprint,
  ...(r.source_url ? { sourceUrl: r.source_url } : {}),
  createdAt: r.created_at.toISOString(),
  ...(r.decided_at ? { decidedAt: r.decided_at.toISOString() } : {}),
});

const day = (v: string | Date): string =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

export async function listPromotions(tenantId: string): Promise<Promotion[]> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT * FROM promotions
        ORDER BY (state = 'pending') DESC, created_at DESC`,
    );
    return rows.map(toPromotion);
  });
}

export type UpsertOutcome = 'created' | 'unchanged';

/**
 * Заводит акцию, если таких условий ещё не было.
 *
 * Совпал отпечаток — не делаем НИЧЕГО: ни состояния, ни названия. Название
 * тоже не обновляем намеренно: клиент подтверждал ту формулировку, которую
 * видел, и подменять её задним числом нельзя.
 */
export async function upsertPromotion(
  tenantId: string, terms: PromoTerms, source: PromoSource, sourceUrl?: string,
): Promise<UpsertOutcome> {
  const fp = fingerprint(terms);
  // Заведённое руками — это уже решение человека, второй раз спрашивать не за чем.
  const state: PromoState = source === 'config' ? 'active' : 'pending';

  return withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query(
      `INSERT INTO promotions
         (tenant_id, source, state, label, scope, model_ids, discount, valid_until,
          fingerprint, source_url, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_id, fingerprint) DO NOTHING`,
      [
        tenantId, source, state, JSON.stringify(terms.label), terms.scope,
        terms.modelIds, JSON.stringify(terms.discount), terms.validUntil,
        fp, sourceUrl ?? null, state === 'active' ? new Date() : null,
      ],
    );
    return rowCount === 1 ? 'created' : 'unchanged';
  });
}

/** Решение человека. Возвращает false, если акции нет или переход запрещён. */
export async function decidePromotion(
  tenantId: string, id: string, state: 'active' | 'rejected' | 'expired', adminId: string | null,
): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    // Из `expired` не поднимают: срок истёк, и «включить обратно» означало бы
    // поставить в оферту условия, которых на сайте больше нет.
    const { rowCount } = await client.query(
      `UPDATE promotions
          SET state = $2, decided_by = $3, decided_at = now()
        WHERE id = $1 AND state <> 'expired'`,
      [id, state, adminId],
    );
    return rowCount === 1;
  });
}

/**
 * Акции, которых на сайте больше нет, уходят в `expired`.
 *
 * Только `scrape`: заведённое руками с сайта не читается и исчезнуть оттуда
 * не может. Стереть чужую ручную акцию потому, что парсер её не нашёл, —
 * ровно то, чего клиент от нас не ждёт.
 */
export async function expireMissing(
  tenantId: string, seen: string[],
): Promise<number> {
  return withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE promotions
          SET state = 'expired'
        WHERE source = 'scrape'
          AND state IN ('pending', 'active')
          AND NOT (fingerprint = ANY($1::text[]))`,
      [seen],
    );
    return rowCount ?? 0;
  });
}

/**
 * Синхронизация акций из конфига.
 *
 * Заведённые руками приходят подтверждёнными: YAML правит человек, и второй
 * раз спрашивать его в панели не за чем. Убранные из конфига гасятся —
 * но только свои, `config`: снимать подтверждённую вручную акцию потому,
 * что её нет в YAML, было бы правильно, а снимать вычитанную с сайта —
 * нет, её туда никто и не писал.
 */
export async function syncConfigPromotions(
  tenantId: string, items: PromoTerms[],
): Promise<{ created: number; expired: number }> {
  let created = 0;
  for (const terms of items) {
    if (await upsertPromotion(tenantId, terms, 'config') === 'created') created += 1;
  }
  const expired = await withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE promotions
          SET state = 'expired'
        WHERE source = 'config'
          AND state IN ('pending', 'active')
          AND NOT (fingerprint = ANY($1::text[]))`,
      [items.map(fingerprint)],
    );
    return rowCount ?? 0;
  });
  return { created, expired };
}

/**
 * Акции, применимые к этой модели ПРЯМО СЕЙЧАС.
 *
 * Срок проверяется здесь, а не в момент подтверждения: клиент подтвердил
 * акцию в июле, она кончилась в августе, и оферта в сентябре обязана уйти
 * без неё без всякого нашего участия.
 */
export async function applicablePromotions(
  tenantId: string, modelId: string | undefined,
): Promise<Promotion[]> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT * FROM promotions
        WHERE state = 'active'
          AND (valid_until IS NULL OR valid_until >= current_date)
          AND (scope = 'sitewide' OR $1::text = ANY(model_ids))`,
      [modelId ?? null],
    );
    return rows.map(toPromotion);
  });
}

/**
 * Одна наибольшая скидка.
 *
 * Сравнивать проценты с фиксированными суммами в отрыве от цены нельзя:
 * 10% на диван за 20 000 больше, чем 500 лей, а на пуф за 600 — меньше.
 * Поэтому обе приводятся к баням от конкретного `listPrice`.
 */
export function bestPromotion(
  promos: Promotion[], listPriceBani: number,
): { promo: Promotion; discount: Discount } | null {
  let best: { promo: Promotion; discount: Discount; bani: number } | null = null;
  for (const promo of promos) {
    const bani = 'percent' in promo.discount
      ? Math.round((listPriceBani * promo.discount.percent) / 10000)
      : promo.discount.bani;
    if (bani <= 0) continue;
    if (!best || bani > best.bani) {
      best = {
        promo, bani,
        discount: 'percent' in promo.discount
          // Движок цены принимает проценты, а не сотые доли: 1800 → 18.
          ? { percent: promo.discount.percent / 100 }
          : { bani: promo.discount.bani },
      };
    }
  }
  return best ? { promo: best.promo, discount: best.discount } : null;
}
