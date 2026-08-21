/**
 * Работа с клиентами: заведение, применение конфига, список.
 *
 *   npm run client new <id> --name "…" --vertical furniture --domain example.com --locale ro
 *   npm run client apply <id> [--dry-run] [--force]
 *   npm run client list
 */
import '../../engine/env.js';
import { closeOwnerPool, pool } from '../../engine/db/pool.js';
import { listVerticals } from '../../engine/prompt/vertical.js';
import { applyClientConfig } from '../onboarding/apply.js';
import { listClients, loadClientConfig } from '../onboarding/config.js';
import { scaffoldClient } from '../onboarding/scaffold.js';

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

    default:
      console.error('команды: new | apply | list');
      console.error(`вертикали: ${listVerticals().join(', ') || '—'}`);
      process.exitCode = 1;
  }
} finally {
  await pool.end();
  await closeOwnerPool();
}
