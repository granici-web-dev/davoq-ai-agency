/**
 * Оферты: перенос конфигуратора в базу, выпуск, нумерация, удаление.
 *
 *   npm run db:up && npm run test:offers
 *
 * Требует базы: всё, что здесь проверяется, — про транзакции, номера и сроки
 * хранения, и без базы проверять их нечем. Тенант заводится свой и удаляется
 * в конце: тест, который требует ручной подготовки, не запускается, а значит
 * не защищает.
 */
import '../src/engine/env.js';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeOwnerPool, pool, withOwner, withTenant } from '../src/engine/db/pool.js';
import { absolute } from '../src/engine/ingest/storage.js';
import { purge } from '../src/engine/billing/retention.js';
import { configuratorLayer } from '../src/products/configurator/onboarding.js';
import { tenantConfigurator } from '../src/products/configurator/tenant.js';
import { issueOffer } from '../src/products/configurator/offer/issue.js';

let failed = 0;
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const bad = (m: string): void => { console.error(`  ✗ ${m}`); failed++; };
const eq = (got: unknown, want: unknown, m: string): void =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m)
    : bad(`${m}\n      получено: ${JSON.stringify(got)}\n      ожидалось: ${JSON.stringify(want)}`);
async function throwsAsync(fn: () => Promise<unknown>, contains: string, m: string): Promise<void> {
  try { await fn(); bad(`${m} — ошибки не было`); }
  catch (e) {
    const text = (e as Error).message;
    text.includes(contains) ? ok(m) : bad(`${m}\n      текст ошибки: ${text}`);
  }
}

const clients = join(process.cwd(), process.env.CLIENTS_DIR ?? 'clients');
const created: string[] = [];

async function newTenant(vertical: string | null): Promise<string> {
  const id = await withOwner(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, allowed_domains, locale_default, supported_locales,
                            public_key, status, vertical)
       VALUES ('__offers_probe__', ARRAY['probe.invalid'], 'ro', ARRAY['ro'],
               'pk_offers_' || substr(md5(random()::text), 1, 22), 'active', $1)
       RETURNING id`, [vertical],
    );
    return rows[0]!.id;
  });
  created.push(id);
  return id;
}

try {
  console.log('\nПеренос конфигуратора в базу');

  const tenantId = await newTenant('furniture');
  const built = configuratorLayer(join(clients, 'sofabelle'), tenantId);
  if (!built) throw new Error('слой конфигуратора у пилота не собрался');

  const wire = JSON.stringify(built.layer);
  !wire.includes('file:') ? ok('«file:» развёрнуто в содержимое — на сервере файла нет')
                          : bad('в базу уехала ссылка «file:»');
  wire.includes('assets/hero.jpg') ? bad('в базу уехал относительный путь к картинке')
                                   : ok('пути к файлам развёрнуты — относительных не осталось');
  built.assets.length >= 2 ? ok(`ассеты собраны для хранилища: ${built.assets.length}`)
                           : bad(`ассетов собрано ${built.assets.length}, ожидалось хотя бы 2`);
  new Set(built.assets.map((a) => a.key)).size === built.assets.length
    ? ok('имена в хранилище не сталкиваются')
    : bad('два разных файла получили один ключ');
  // У пилота своего промпта агента нет — он приходит из ниши, и в слой
  // клиента попадать не должен. А вот если клиент его переопределит, файл
  // обязан лечь ТЕКСТОМ: каталога клиента на сервере не существует.
  built.layer.agent === undefined
    ? ok('пилот не переопределяет промпт агента — в слой клиента он не уехал')
    : bad('в слой клиента попал промпт, которого клиент не задавал');

  const own = mkdtempSync(join(tmpdir(), 'cfg-own-'));
  writeFileSync(join(own, 'tone.md'), 'Speak plainly and never promise a discount.');
  writeFileSync(join(own, 'configurator.yaml'), 'schema: 1\nagent:\n  prompt: tone.md\n');
  const overridden = configuratorLayer(own, tenantId);
  String((overridden?.layer.agent as { prompt?: string } | undefined)?.prompt ?? '')
    .includes('never promise a discount')
    ? ok('свой промпт клиента лёг текстом, а не путём')
    : bad('промпт клиента не развёрнут в содержимое');
  rmSync(own, { recursive: true, force: true });

  // Путь наружу каталога клиента — попытка прочитать чужой файл при онбординге.
  const escape = mkdtempSync(join(tmpdir(), 'cfg-'));
  mkdirSync(join(escape, 'sub'), { recursive: true });
  writeFileSync(join(escape, 'sub', 'configurator.yaml'),
    'schema: 1\noffer:\n  logo: ../../../etc/hosts\n');
  await throwsAsync(async () => configuratorLayer(join(escape, 'sub'), tenantId),
    'выходит за каталог клиента', 'путь за пределы каталога клиента — ошибка онбординга');
  rmSync(escape, { recursive: true, force: true });

  console.log('\nВыпуск оферты');

  await withOwner((client) => client.query(
    `UPDATE tenants SET configurator = $2, offer_number_next = 987, offer_number_format = '{n}'
      WHERE id = $1`, [tenantId, JSON.stringify(built.layer)]));
  for (const a of built.assets) {
    const { put } = await import('../src/engine/ingest/storage.js');
    await put(a.key, a.content);
  }

  const cfg = await tenantConfigurator(tenantId, ['ro']);
  if (!cfg) throw new Error('конфигуратор тенанта не собрался из базы');
  ok('конфигуратор собран из jsonb базы, без каталога клиента');

  // Промпт ниши живёт файлами в репозитории и на сервер едет со сборкой,
  // а не через базу. После загрузки он обязан быть на месте.
  (cfg.configurator.agent.prompt ?? '').includes('HR foam')
    ? ok('промпт агента пришёл из ниши, минуя слой клиента')
    : bad('после загрузки из базы промпта агента нет');

  const selections = {
    model: 'free-comfort', width: 310, seat: 'hr-memory',
    fabric: 'veluxe', colour: 'veluxe-31-taupe', extras: ['puf'],
  };
  const contact = { name: 'Ion Probe', email: 'ion@probe.invalid', phone: '+40700000000' };

  const first = await issueOffer(cfg.configurator, cfg.offer, {
    tenantId, locale: 'ro', selections, contact, consentMarketing: true,
  });
  eq(first.number, '987', 'номер продолжает ряд клиента, а не начинается с единицы');
  first.pdf.subarray(0, 5).toString() === '%PDF-' ? ok('получился настоящий PDF')
                                                  : bad('на выходе не PDF');
  existsSync(absolute(first.storageKey)) ? ok('PDF лёг в хранилище тенанта')
                                         : bad('файла оферты нет на диске');

  const { extractText, getDocumentProxy } = await import('unpdf');
  const proxy = await getDocumentProxy(new Uint8Array(first.pdf));
  const { text } = await extractText(proxy, { mergePages: true });
  const flat = (Array.isArray(text) ? text.join(' ') : text).replace(/\s+/g, ' ');
  flat.includes('987') ? ok('номер напечатан в самом документе')
                       : bad('номера нет в PDF');
  flat.includes('Ion Probe') ? ok('имя покупателя дошло до бланка')
                             : bad('имени покупателя нет в PDF');

  // Два одновременных запроса обязаны получить разные номера: строка тенанта
  // блокируется на UPDATE ... RETURNING, и второй ждёт первого.
  const [a, b] = await Promise.all([
    issueOffer(cfg.configurator, cfg.offer, { tenantId, locale: 'ro', selections, contact, consentMarketing: false }),
    issueOffer(cfg.configurator, cfg.offer, { tenantId, locale: 'ro', selections, contact, consentMarketing: false }),
  ]);
  a.number !== b.number ? ok(`одновременные выпуски получили разные номера (${a.number} и ${b.number})`)
                        : bad(`оба выпуска получили номер ${a.number}`);

  // Неверный выбор не должен ни выпустить документ, ни сжечь номер.
  const before = await withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ n: number }>(
      'SELECT offer_number_next AS n FROM tenants WHERE id = $1', [tenantId]);
    return rows[0]!.n;
  });
  await throwsAsync(
    () => issueOffer(cfg.configurator, cfg.offer, {
      tenantId, locale: 'ro', selections: { ...selections, model: 'нет-такой' },
      contact, consentMarketing: false,
    }),
    'нет варианта', 'подменённый id варианта — отказ, а не оферта на несуществующий товар',
  );
  const after = await withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ n: number }>(
      'SELECT offer_number_next AS n FROM tenants WHERE id = $1', [tenantId]);
    return rows[0]!.n;
  });
  eq(after, before, 'неудачный выпуск не оставляет дыры в нумерации');

  const stored = await withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{
      total_bani: string; product: string; payload: Record<string, unknown>;
    }>(`SELECT o.total_bani, l.product, l.payload
          FROM offers o JOIN leads l ON l.id = o.lead_id WHERE o.id = $1`, [first.id]);
    return rows[0]!;
  });
  eq(Number(stored.total_bani), first.price.totalBani, 'в базе лежит сумма, посчитанная сервером');
  eq(stored.product, 'configurator', 'заявка помечена продуктом, а не свалена к чат-боту');
  eq((stored.payload.consent as { marketing: boolean }).marketing, true,
    'маркетинговое согласие записано отдельным флагом');

  console.log('\nСроки хранения');

  // Заявке год, срок хранения — день: PDF обязан уйти вместе с контактом.
  await withOwner((client) => client.query(
    `UPDATE tenants SET lead_retention_days = 1 WHERE id = $1`, [tenantId]));
  await withOwner((client) => client.query(
    `UPDATE leads SET created_at = now() - interval '400 days' WHERE tenant_id = $1`, [tenantId]));

  const key = first.storageKey;
  const result = await purge();
  result.leads >= 3 ? ok(`просроченные заявки удалены: ${result.leads}`)
                    : bad(`удалено заявок ${result.leads}, ожидалось не меньше трёх`);
  !existsSync(absolute(key))
    ? ok('PDF удалён вместе с заявкой — иначе имя и телефон остались бы на диске')
    : bad('файл оферты пережил удаление заявки');

  const survivor = await withOwner(async (client) => {
    const { rows } = await client.query<{ number: string; storage_key: string; lead_id: string | null }>(
      'SELECT number, storage_key, lead_id FROM offers WHERE id = $1', [first.id]);
    return rows[0]!;
  });
  eq([survivor.number, survivor.storage_key, survivor.lead_id], ['987', '', null],
    'оферта осталась номером и суммой, но без файла и без контакта');

  console.log(failed === 0 ? '\nВсё сошлось.\n' : `\nНе сошлось: ${failed}\n`);
} finally {
  for (const id of created) {
    await withOwner((client) => client.query('DELETE FROM tenants WHERE id = $1', [id]));
  }
  await pool.end();
  await closeOwnerPool();
}

process.exit(failed === 0 ? 0 : 1);
