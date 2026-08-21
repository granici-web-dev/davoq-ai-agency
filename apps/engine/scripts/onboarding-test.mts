/**
 * Заведение ВТОРОГО клиента.
 *
 *   npm run test:onboarding
 *
 * Проверяется то, что на одном клиенте не проявляется вовсе и потому не
 * проверялось: поиск тенанта, прерванное применение, переименование,
 * одноимённый второй клиент. Каждая из этих ошибок тихая — команда
 * рапортует «ПРИМЕНЕНО» и уходит.
 *
 * Тест заводит настоящего временного клиента и убирает его за собой.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeOwnerPool, pool, withOwner } from '../src/engine/db/pool.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };

const root = mkdtempSync(join(tmpdir(), 'onboarding-'));
process.env.CLIENTS_DIR = root;

const ID = `probe-${Date.now().toString(36)}`;
const dir = join(root, ID);
mkdirSync(dir, { recursive: true });

const config = (name: string, extra = ''): string => [
  'schema: 1', `id: ${ID}`, `name: ${name}`,
  'vertical: furniture', 'plan: starter',
  'locale:', '  default: ro', '  supported: [ro]',
  'channels:', '  web:', '    domains:', '      - probe.invalid',
  '    widget:', `      bot_name: ${name}`, '      preset: mono',
  '      welcome:', '        ro: Bună!',
  extra, '',
].join('\n');

const write = (text: string): void => writeFileSync(join(dir, 'config.yaml'), text);

const { loadClientConfig } = await import('../src/platform/onboarding/config.js');
const { applyClientConfig } = await import('../src/platform/onboarding/apply.js');
const apply = (opts = {}) => applyClientConfig(loadClientConfig(ID), opts);

const cleanup = async (): Promise<void> => {
  await withOwner((c) => c.query(
    "DELETE FROM tenants WHERE client_id = $1 OR name IN ('Probe Unu', 'Probe Doi', 'Probe Twin')",
    [ID]));
  rmSync(root, { recursive: true, force: true });
};

try {
  // ── 1. --dry-run на ещё не заведённом клиенте ловит ошибки ─────────────
  write(config('Probe Unu', 'panel:\n  hidden_screens: []').replace('preset: mono', 'preset: nu-exista'));
  try {
    await apply({ dryRun: true });
    bad('--dry-run на новом клиенте пропустил несуществующую тему');
  } catch (err) {
    if (/тема «nu-exista» не найдена/.test((err as Error).message)) {
      ok('--dry-run на новом клиенте ловит несуществующую тему');
    } else bad(`отказ не по той причине: ${(err as Error).message.slice(0, 120)}`);
  }

  write(config('Probe Unu'));
  const preview = await apply({ dryRun: true });
  if (preview.applied.length > 3) ok(`--dry-run показывает полный список: ${preview.applied.length} полей`);
  else bad(`--dry-run на новом клиенте показал ${preview.applied.length} строк вместо полного списка`);

  // ── 2. Заведение и повторное применение ───────────────────────────────
  const first = await apply();
  if (!first.created || !first.publicKey) bad('клиент не создан');
  else ok(`клиент заведён: ${first.tenantId.slice(0, 8)}…`);
  const tenantId = first.tenantId;
  const key = first.publicKey!;

  const second = await apply();
  if (second.applied.length === 0 && second.skipped.length === 0) ok('повторное применение ничего не меняет');
  else bad(`повторное применение тронуло ${second.applied.length} полей, пропустило ${second.skipped.length}`);

  // ── 3. Прерванное применение ──────────────────────────────────────────
  //
  // Тенант создан, снимок не дописан. Прежде повторный запуск объявлял
  // собственные же значения «правками клиента» и молча пропускал тему,
  // приветствие, профиль и сценарий квалификации.
  await withOwner((c) => c.query(
    `UPDATE tenants SET applied_config = '{"__pending": true}'::jsonb WHERE id = $1`, [tenantId]));
  await withOwner((c) => c.query(
    `UPDATE widget_configs SET welcome_message = '{}'::jsonb, preset_id = NULL WHERE tenant_id = $1`,
    [tenantId]));

  const third = await apply();
  const skippedNames = third.skipped.map((s) => s.field);
  if (skippedNames.length > 0) {
    bad(`после прерванного применения ${skippedNames.length} полей объявлены правками клиента: ${skippedNames.join(', ')}`);
  } else ok('после прерванного применения ничего не объявлено правками клиента');
  if (third.applied.some((a) => a.field === 'welcome')) ok('приветствие дописано');
  else bad('приветствие так и не применилось');

  // ── 4. Переименование не заводит второго тенанта ──────────────────────
  write(config('Probe Doi'));
  const renamed = await apply();
  if (renamed.tenantId !== tenantId) bad('переименование завело нового тенанта — сниппет на сайте указывает на старого');
  else if (renamed.publicKey) bad('переименование выдало новый публичный ключ');
  else ok('переименование меняет имя, а не клиента');

  const { rows: nameRows } = await withOwner((c) => c.query<{ public_key: string }>(
    'SELECT public_key FROM tenants WHERE id = $1', [tenantId]));
  if (nameRows[0]?.public_key === key) ok('публичный ключ не изменился');
  else bad('публичный ключ изменился — виджет на сайте клиента мёртв');

  // ── 5. Два одноимённых тенанта — отказ, а не выбор наугад ─────────────
  //
  // UNIQUE на имени нет и быть не должно: вывеска не идентификатор. Но выбрать
  // за оператора одного из двух — значит перезаписать домены и настройки чужого
  // клиента под отчёт «ПРИМЕНЕНО».
  for (const pk of ['pk_twin_probe_a0000000000', 'pk_twin_probe_b0000000000']) {
    await withOwner((c) => c.query(
      `INSERT INTO tenants (name, allowed_domains, locale_default, public_key, vertical, plan)
       VALUES ('Probe Twin', ARRAY['twin.invalid'], 'ro', $1, 'furniture', 'starter')`, [pk]));
  }
  const twinId = `${ID}-twin`;
  mkdirSync(join(root, twinId), { recursive: true });
  writeFileSync(join(root, twinId, 'config.yaml'),
    config('Probe Twin').replace(`id: ${ID}`, `id: ${twinId}`));
  try {
    await applyClientConfig(loadClientConfig(twinId), { dryRun: true });
    bad('два одноимённых тенанта — команда выбрала одного молча');
  } catch (err) {
    if (/client_id/.test((err as Error).message)) ok('два одноимённых тенанта: отказ с инструкцией, а не выбор наугад');
    else bad(`отказ не по той причине: ${(err as Error).message.slice(0, 140)}`);
  }

} finally {
  await cleanup();
  console.log(failed === 0 ? '\nОНБОРДИНГ OK' : `\nОНБОРДИНГ НАРУШЕН: ${failed}`);
  await pool.end();
  await closeOwnerPool();
  process.exit(failed === 0 ? 0 : 1);
}
