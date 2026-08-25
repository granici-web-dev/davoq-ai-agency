import { withOwner, withTenant } from '../../../engine/db/pool.js';
import { send } from '../../../engine/notify/email.js';
import { buildConfigurator } from '../load.js';
import type { Json } from '../config/layers.js';
import { scrapePromotions, type ScrapeResult } from './scrape.js';

/**
 * Один проход скрейпа для тенанта.
 *
 * Собирает конфиг, ходит на сайт, кладёт черновики — и, если появилось что
 * подтверждать, пишет клиенту. НЕ ЧАЩЕ РАЗА В СУТКИ и только когда есть что
 * подтверждать: клиент, которому пишут шесть раз в день, заводит правило
 * «в архив», и вместе с шумом туда уезжают письма, которые он ждал.
 */

interface TenantRow {
  id: string; name: string; vertical: string | null;
  locale_default: string; supported_locales: string[] | null;
  configurator: Record<string, Json>;
  lead_notify_email: string | null;
  lead_notify_from: string | null;
  promo_notified_at: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runPromoScrape(tenantId: string): Promise<ScrapeResult> {
  const empty: ScrapeResult = { created: 0, unchanged: 0, expired: 0, rejected: [], stale: 0 };

  // Владельцем: проход идёт из воркера, вне запроса тенанта.
  const { rows } = await withOwner((client) =>
    client.query<TenantRow>(
      `SELECT id, name, vertical, locale_default, supported_locales, configurator,
              lead_notify_email, lead_notify_from, promo_notified_at
         FROM tenants WHERE id = $1`, [tenantId]),
  );
  const tenant = rows[0];
  if (!tenant || Object.keys(tenant.configurator ?? {}).length === 0) return empty;

  const locales = tenant.supported_locales?.length
    ? tenant.supported_locales : [tenant.locale_default];

  const cfg = buildConfigurator({
    verticalId: tenant.vertical, clientLayer: tenant.configurator as Json,
    locales, where: `акции тенанта ${tenantId}`,
  });
  if (!cfg.promotions.scrape) return empty;

  const result = await scrapePromotions({
    tenantId, tenantName: tenant.name, config: cfg.promotions, locale: locales[0]!,
    modelIds: cfg.flow.steps.flatMap((s) => s.options?.map((o) => o.id) ?? []),
  });

  if (result.created > 0) await notifyPending(tenant, result.created);
  return result;
}

async function notifyPending(tenant: TenantRow, created: number): Promise<void> {
  const to = tenant.lead_notify_email;
  if (!to) return;

  const recent = tenant.promo_notified_at
    && Date.now() - tenant.promo_notified_at.getTime() < DAY_MS;
  if (recent) return;

  // Сколько всего ждёт решения, а не сколько нашлось сейчас: клиент открывает
  // экран и видит очередь целиком, и число в письме должно совпасть с ней.
  const pending = await withTenant(tenant.id, async (client) => {
    const { rows } = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM promotions WHERE state = 'pending'");
    return Number(rows[0]?.n ?? 0);
  });
  if (pending === 0) return;

  const text = [
    `Найдено новых акций: ${created}. Всего ждут подтверждения: ${pending}.`,
    '',
    'Пока акция не подтверждена, она не попадает в оферты — они уходят',
    'без скидки. Подтвердить или отклонить можно на экране «Promoții».',
  ].join('\n');

  try {
    await send({
      ...(tenant.lead_notify_from ? { from: tenant.lead_notify_from } : {}),
      to, subject: `Новые акции ждут подтверждения (${pending})`,
      text, html: `<pre style="font:14px/1.5 system-ui">${text}</pre>`,
    });
    await withOwner((client) => client.query(
      'UPDATE tenants SET promo_notified_at = now() WHERE id = $1', [tenant.id]));
  } catch (err) {
    // Не ушло — отметку не ставим: завтрашний проход попробует снова.
    console.error(`письмо об акциях не ушло: ${(err as Error).message}`);
  }
}
