import { withTenant } from '../../engine/db/pool.js';
import type { FlowConfig } from './flow/schema.js';

/**
 * Воронка конфигуратора.
 *
 * Счётчики за сутки, без следа посетителя. Вопрос, ради которого всё это
 * заводится, один: где люди перестают отвечать. Ответ на него не требует
 * знать, кто именно ушёл, — и значит хранить это незачем.
 *
 * События приходят из браузера, то есть от кого угодно. Всё, что здесь
 * записывается, проверено против конфига: имя события из закрытого списка,
 * идентификатор шага — из флоу тенанта. Иначе счётчики накручиваются
 * обычным запросом, и клиент видит воронку, которой не было.
 */

export const STAT_EVENTS = [
  'open', 'step_view', 'step_select', 'price_shown', 'offer_created',
] as const;
export type StatEvent = (typeof STAT_EVENTS)[number];

const isStatEvent = (v: unknown): v is StatEvent =>
  typeof v === 'string' && (STAT_EVENTS as readonly string[]).includes(v);

/**
 * События, привязанные к шагу. У остальных шаг ОТБРАСЫВАЕТСЯ, а не хранится.
 *
 * Иначе «открытие» с приложенным шагом уезжает в отдельную ячейку, воронка
 * его не находит, и число открытий занижается ровно на столько, сколько
 * лишних полей прислал браузер.
 */
const STEP_EVENTS: readonly StatEvent[] = ['step_view', 'step_select'];

/** Потолок на пачку: событий у одного посетителя единицы, а не сотни. */
const MAX_BATCH = 20;

export interface StatHit { event: string; stepId?: string }

/**
 * Запись пачки. Возвращает, сколько принято: всё, что не прошло проверку,
 * молча отбрасывается — отвечать браузеру подробностями о том, какие имена
 * шагов существуют, незачем.
 */
export async function recordStats(
  tenantId: string, flow: FlowConfig, hits: unknown,
): Promise<number> {
  if (!Array.isArray(hits) || hits.length === 0) return 0;

  const steps = new Set(flow.steps.map((s) => s.id));
  const counted = new Map<string, number>();

  for (const raw of hits.slice(0, MAX_BATCH)) {
    const hit = raw as StatHit;
    if (!hit || typeof hit !== 'object' || !isStatEvent(hit.event)) continue;
    const stepScoped = STEP_EVENTS.includes(hit.event);
    const stepId = stepScoped && typeof hit.stepId === 'string' && steps.has(hit.stepId)
      ? hit.stepId : '';
    // Шаг обязателен там, где без него событие бессмысленно: «просмотр шага»
    // без шага не считается ни в одну колонку воронки.
    if (stepScoped && !stepId) continue;
    const key = `${hit.event} ${stepId}`;
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }
  if (counted.size === 0) return 0;

  await withTenant(tenantId, async (client) => {
    for (const [key, n] of counted) {
      const [event, stepId] = key.split(' ') as [string, string];
      await client.query(
        `INSERT INTO configurator_stats (tenant_id, date, event, step_id, count)
         VALUES ($1, current_date, $2, $3, $4)
         ON CONFLICT (tenant_id, date, event, step_id)
         DO UPDATE SET count = configurator_stats.count + EXCLUDED.count`,
        [tenantId, event, stepId, n],
      );
    }
  });

  return [...counted.values()].reduce((a, b) => a + b, 0);
}

export interface FunnelStep {
  stepId: string;
  title: string;
  views: number;
  selects: number;
  /** Сколько дошло до следующего шага. У последнего — сколько увидело цену. */
  next: number;
}

export interface Funnel {
  days: number;
  opened: number;
  priceShown: number;
  offers: number;
  steps: FunnelStep[];
}

/**
 * Воронка за период.
 *
 * Порядок шагов берётся из ФЛОУ, а не из данных: шаг, который никто ни разу
 * не увидел, обязан стоять в воронке нулём на своём месте. Собранная
 * по данным, она молча пропустила бы его — а это и есть самая интересная
 * строка.
 */
export async function funnel(
  tenantId: string, flow: FlowConfig, locale: string, days = 30,
): Promise<Funnel> {
  const rows = await withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ event: string; step_id: string; total: string }>(
      `SELECT event, step_id, sum(count) AS total
         FROM configurator_stats
        WHERE date >= current_date - ($1::int - 1)
        GROUP BY event, step_id`,
      [days],
    );
    return rows;
  });

  const at = (event: string, stepId = ''): number =>
    Number(rows.find((r) => r.event === event && r.step_id === stepId)?.total ?? 0);

  const priceShown = at('price_shown');
  const steps: FunnelStep[] = flow.steps.map((step, i) => {
    const nextStep = flow.steps[i + 1];
    return {
      stepId: step.id,
      title: step.title[locale] ?? Object.values(step.title)[0] ?? step.id,
      views: at('step_view', step.id),
      selects: at('step_select', step.id),
      next: nextStep ? at('step_view', nextStep.id) : priceShown,
    };
  });

  return { days, opened: at('open'), priceShown, offers: at('offer_created'), steps };
}
