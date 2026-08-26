/**
 * Работа с клиентами: заведение, применение конфига, список.
 *
 *   npm run client new <id> --name "…" --vertical furniture --domain example.com --locale ro
 *   npm run client apply <id> [--dry-run] [--force]
 *   npm run client list
 *   npm run client offers <id> --next 987 [--format '{n}']
 */
import '../../engine/env.js';
import { closeOwnerPool, pool, withOwner } from '../../engine/db/pool.js';
import { syncPlanGrants } from '../../engine/billing/agents.js';
import { listVerticals } from '../../engine/prompt/vertical.js';
import { applyClientConfig } from '../onboarding/apply.js';
import { listClients, loadClientConfig } from '../onboarding/config.js';
import { scaffoldClient } from '../onboarding/scaffold.js';
import { isPlanId, PLAN_IDS, PLANS } from '../../engine/plans.js';

const [cmd, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};
const has = (name: string): boolean => rest.includes(`--${name}`);

/** Значения печатаются коротко: diff должен читаться, а не разворачиваться на экран. */
const brief = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 70 ? `${oneLine.slice(0, 67)}…` : oneLine;
};

try {
  switch (cmd) {
    case 'new': {
      const id = positional[0];
      const name = flag('name');
      const domain = flag('domain');
      if (!id || !name || !domain) {
        throw new Error(
          'usage: client new <id> --name "Название" --domain example.com' +
          ' [--vertical furniture] [--locale ro]',
        );
      }
      const vertical = flag('vertical') ?? listVerticals()[0];
      if (!vertical) throw new Error('нет ни одной вертикали в src/verticals');

      const r = await scaffoldClient(id, {
        name, domain, vertical, locale: flag('locale') ?? 'en',
      });

      console.log(`\nклиент «${name}» заготовлен: ${r.dir}\n`);
      console.log('Дальше:');
      console.log(`  1. заполнить ${r.configPath} — всё, где стоит TODO`);
      console.log(`  2. сложить материалы в ${r.dir}/knowledge/`);
      console.log(`  3. npm run client apply ${id}\n`);
      console.log('Запросить у клиента:');
      for (const item of r.checklist) console.log(`  [ ] ${item}`);
      console.log('\nБез этих материалов бот будет честно отвечать «уточните у менеджера»,');
      console.log('и выяснится это на третьей неделе пилота.\n');
      break;
    }

    case 'apply': {
      const id = positional[0];
      if (!id) throw new Error('usage: client apply <id> [--dry-run] [--force]');
      const dryRun = has('dry-run');
      const cfg = loadClientConfig(id);
      const r = await applyClientConfig(cfg, { dryRun, force: has('force') });

      console.log(`\n${dryRun ? 'ЧТО ИЗМЕНИТСЯ' : 'ПРИМЕНЕНО'} · ${cfg.name} · ${r.tenantId}`);
      if (r.created) console.log(`  тенант создан${r.publicKey ? `, ключ ${r.publicKey}` : ''}`);

      if (r.applied.length === 0) console.log('  изменений нет');
      for (const c of r.applied) console.log(`  ~ ${c.field}: ${brief(c.from)} → ${brief(c.to)}`);

      if (r.skipped.length > 0) {
        console.log('\n  пропущено — клиент правил это сам из панели:');
        for (const c of r.skipped) {
          console.log(`  ! ${c.field}: в базе ${brief(c.from)}, в конфиге ${brief(c.to)}`);
        }
        console.log('  перезаписать: --force');
      }
      console.log();
      break;
    }

    case 'metrics': {
      // Все метрики лежат с tenant_id, поэтому одна и та же выборка работает
      // для любого клиента — и для сводки по всем сразу.
      const days = Number(flag('days') ?? 30);
      const { rows } = await withOwner((client) =>
        client.query<{
          name: string; conversations: string; contacts: string; leads: string;
          messages: string; widget_loads: string; lang_retried: string; lang_leak: string;
        }>(
          `SELECT t.name,
                  (SELECT count(*) FROM conversations c
                    WHERE c.tenant_id = t.id AND c.started_at >= now() - ($1 || ' days')::interval)
                    AS conversations,
                  (SELECT count(*) FROM leads l
                    WHERE l.tenant_id = t.id AND l.created_at >= now() - ($1 || ' days')::interval
                      AND (l.email IS NOT NULL OR l.phone IS NOT NULL)) AS contacts,
                  (SELECT count(*) FROM leads l
                    WHERE l.tenant_id = t.id AND l.notified_at IS NOT NULL
                      AND l.created_at >= now() - ($1 || ' days')::interval) AS leads,
                  coalesce((SELECT sum(u.messages) FROM usage_daily u
                    WHERE u.tenant_id = t.id AND u.date >= current_date - $1::int), 0) AS messages,
                  coalesce((SELECT sum(u.widget_loads) FROM usage_daily u
                    WHERE u.tenant_id = t.id AND u.date >= current_date - $1::int), 0) AS widget_loads,
                  (SELECT count(*) FROM messages m
                    WHERE m.tenant_id = t.id AND m.language_flag = 'retried'
                      AND m.created_at >= now() - ($1 || ' days')::interval) AS lang_retried,
                  (SELECT count(*) FROM messages m
                    WHERE m.tenant_id = t.id AND m.language_flag = 'leak'
                      AND m.created_at >= now() - ($1 || ' days')::interval) AS lang_leak
             FROM tenants t WHERE t.status = 'active' ORDER BY t.created_at`,
          [days],
        ),
      );
      console.log(`\nза ${days} дн.\n`);
      console.log('  клиент               показы  разговоры  контакты  переданы  сообщения');
      for (const r of rows) {
        console.log(
          `  ${r.name.padEnd(20)} ${String(r.widget_loads).padStart(6)}` +
          ` ${String(r.conversations).padStart(10)} ${String(r.contacts).padStart(9)}` +
          ` ${String(r.leads).padStart(9)} ${String(r.messages).padStart(10)}`,
        );
      }

      // Язык отдельной строкой, а не колонкой: это наша служебная цифра,
      // а не показатель клиента. Ноль в обеих — то, как должно быть.
      const retried = rows.reduce((s, r) => s + Number(r.lang_retried), 0);
      const leaked = rows.reduce((s, r) => s + Number(r.lang_leak), 0);
      const total = rows.reduce((s, r) => s + Number(r.messages), 0);
      if (retried + leaked > 0) {
        const share = total > 0 ? ((retried + leaked) / total * 100).toFixed(1) : '—';
        console.log(
          `\n  язык: перехвачено ${retried}, просочилось ${leaked}` +
          ` — ${share}% от ${total} ответов`,
        );
      }
      console.log();
      break;
    }

    /**
     * Нумерация оферт.
     *
     * Отдельной командой, а не полем конфига. Номер — это СОСТОЯНИЕ счётчика:
     * если бы его переносил `apply`, повторное применение конфига через месяц
     * откатывало бы нумерацию к начальному значению, и клиент выдал бы вторую
     * оферту с номером уже выданной. У покупателя на руках оказались бы два
     * разных документа под одним номером.
     *
     * Ставится один раз при заведении — продолжением ряда, который у клиента
     * уже есть.
     */
    case 'offers': {
      const id = positional[0];
      const next = flag('next');
      if (!id || !next) {
        throw new Error("usage: client offers <id> --next 987 [--format '{n}']");
      }
      const n = Number(next);
      if (!Number.isInteger(n) || n < 1) throw new Error('--next — целое число ≥ 1');
      const format = flag('format');
      if (format && !format.includes('{n}')) {
        throw new Error("--format обязан содержать {n}: без счётчика номера не уникальны");
      }

      const updated = await withOwner(async (client) => {
        const { rows } = await client.query<{ name: string; offer_number_next: number; offer_number_format: string }>(
          `UPDATE tenants
              SET offer_number_next = $2,
                  offer_number_format = COALESCE($3, offer_number_format)
            WHERE client_id = $1
        RETURNING name, offer_number_next, offer_number_format`,
          [id, n, format ?? null],
        );
        return rows[0];
      });
      if (!updated) throw new Error(`клиент «${id}» не заведён в базе — сначала apply`);

      console.log(
        `\n${updated.name}: следующая оферта — ` +
        `${updated.offer_number_format.replace('{n}', String(updated.offer_number_next))}\n`,
      );
      console.log('Проверьте у клиента, что номер продолжает его ряд, а не начинает второй.\n');
      break;
    }

    case 'list': {
      const clients = listClients();
      if (clients.length === 0) {
        console.log('клиентов нет. Завести: npm run client new <id> --name "…" --domain …');
        break;
      }
      for (const id of clients) {
        try {
          const cfg = loadClientConfig(id);
          console.log(`  ${id.padEnd(20)} ${cfg.name} · ${cfg.vertical} · ${cfg.locale.default}`);
        } catch (err) {
          console.log(`  ${id.padEnd(20)} ⚠ ${(err as Error).message}`);
        }
      }
      break;
    }

    /**
     * Ссылка на оплату. Создаём мы, а не клиент: тариф переключаем мы,
     * иначе он выберет Business сам и без нас.
     */
    case 'checkout': {
      const [clientId, planId] = rest;
      if (!clientId || !planId) throw new Error('usage: checkout <клиент> <starter|pro|business>');
      if (!isPlanId(planId)) throw new Error(`тариф «${planId}» не существует. Есть: ${PLAN_IDS.join(', ')}`);

      const tenant = await withOwner(async (c) => {
        const { rows } = await c.query<{ id: string; name: string; subscription_status: string }>(
          'SELECT id, name, subscription_status FROM tenants WHERE client_id = $1', [clientId]);
        if (!rows[0]) throw new Error(`клиент «${clientId}» не заведён — сначала apply`);
        return rows[0];
      });

      const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3779';
      const { createCheckout } = await import('../billing/stripe.js');
      const { url } = await createCheckout({
        tenantId: tenant.id,
        plan: planId,
        successUrl: `${base}/admin#subscription`,
        cancelUrl: `${base}/admin#subscription`,
      });
      console.log(`\n${tenant.name} · ${PLANS[planId].name} · ${PLANS[planId].priceEur} €/мес`);
      console.log(`\n${url}\n`);
      console.log('Ссылка живёт около суток. Тариф переключится сам, вебхуком,');
      console.log('после успешной оплаты — руками менять ничего не нужно.');
      break;
    }

    /**
     * Смена тарифа без оплаты: для пилотов и особых договорённостей.
     * Обычный путь — checkout, он же и переключит.
     */
    case 'plan': {
      const [clientId, planId] = rest;
      if (!clientId || !planId) throw new Error('usage: plan <клиент> <starter|pro|business>');
      if (!isPlanId(planId)) throw new Error(`тариф «${planId}» не существует. Есть: ${PLAN_IDS.join(', ')}`);

      const changed = await withOwner(async (c) => {
        const { rows } = await c.query<{ id: string; name: string; plan: string }>(
          'UPDATE tenants SET plan = $2 WHERE client_id = $1 RETURNING id, name, plan', [clientId, planId]);
        const row = rows[0];
        // Тариф сменился — сменился и набор агентов. Права, купленные
        // поштучно, при этом не трогаются: тариф о них не знает, и отбирать
        // оплаченное понижением тарифа нельзя.
        if (row) await syncPlanGrants(c, row.id, planId);
        return row;
      });
      if (!changed) throw new Error(`клиент «${clientId}» не заведён`);
      const plan = PLANS[planId];
      console.log(`${changed.name}: тариф ${plan.name}, модель ${plan.modelTier}, ` +
                  `${plan.monthlyMessages} сообщений в месяц`);
      if (plan.modelTier === 'premium') {
        console.log('Внимание: старшая модель втрое дороже. Расход на модель вырастет соответственно.');
      }
      console.log('Не забудьте про clients/' + clientId + '/config.yaml — иначе следующий apply вернёт прежний тариф.');
      break;
    }

    default:
      console.error('команды: new | apply | list | metrics | checkout | plan');
      console.error(`вертикали: ${listVerticals().join(', ') || '—'}`);
      process.exitCode = 1;
  }
} finally {
  await pool.end();
  await closeOwnerPool();
}
