import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { withOwner, withTenant } from '../../engine/db/pool.js';
import { get as storageGet, put as storagePut } from '../../engine/ingest/storage.js';
import { loadVertical } from '../../engine/prompt/vertical.js';
import { PRESETS } from '../../engine/shared/theme.js';
import { clientDir, type ClientConfig } from './config.js';

/**
 * Применение конфигурации клиента к базе.
 *
 * Идемпотентно и осторожно. Правило одно и оно важнее всех остальных:
 * **то, что клиент поменял сам, не затирается.** Приветствие, тему, адрес
 * для заявок директор по продажам правит из панели, и релиз не имеет права
 * возвращать их к тому, что было записано при заведении.
 *
 * Отличить «клиент поменял» от «мы ещё не применяли» позволяет снимок
 * последнего применения в tenants.applied_config: если текущее значение
 * в базе отличается от того, что мы записали в прошлый раз, — трогал клиент.
 */

export interface Change {
  field: string;
  from: unknown;
  to: unknown;
  /** Клиент поменял это сам после прошлого применения. */
  clientEdited?: boolean;
}

export interface ApplyResult {
  tenantId: string;
  created: boolean;
  publicKey?: string;
  applied: Change[];
  skipped: Change[];
}

export interface ApplyOptions {
  /** Показать, что изменится, и ничего не писать. */
  dryRun?: boolean;
  /** Перезаписать даже то, что клиент правил сам. */
  force?: boolean;
}

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function applyClientConfig(
  cfg: ClientConfig,
  { dryRun = false, force = false }: ApplyOptions = {},
): Promise<ApplyResult> {
  // Вертикаль загружается до всего: неизвестная ниша должна остановить
  // заведение здесь, а не оставить наполовину заведённого клиента.
  const vertical = loadVertical(cfg.vertical);

  // ── Всё, что может отказать, проверяется ДО создания тенанта ────────────
  //
  // Прежде проверки стояли после: неизвестный пресет, дубль поля квалификации
  // или отсутствующий логотип оставляли наполовину заведённого клиента —
  // тенант есть, снимок применённого пуст. Повторный запуск в такой ситуации
  // объявлял значения, поставленные при создании, «правками клиента»
  // и молча пропускал тему, приветствие, профиль и сценарий квалификации,
  // сообщая при этом неверную причину.
  const quoteFields = mergeQualification(cfg, vertical);

  const presetId = cfg.channels.web.widget.preset;
  const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
  if (presetId && !preset) {
    throw new Error(
      `тема «${presetId}» не найдена. Известные: ${PRESETS.map((p) => p.id).join(', ')}`,
    );
  }

  const logo = cfg.channels.web.widget.logo;
  let logoPath: string | undefined;
  let logoMime: string | undefined;
  if (logo) {
    logoPath = join(clientDir(cfg.id), logo);
    if (!existsSync(logoPath)) throw new Error(`логотип не найден: ${logoPath}`);
    logoMime = MIME_BY_EXT[extname(logoPath).toLowerCase()];
    if (!logoMime) throw new Error(`логотип может быть .svg, .png или .webp: ${logo}`);
  }

  const desired = desiredFields(cfg, quoteFields, preset);

  // ── Поиск тенанта ───────────────────────────────────────────────────────
  //
  // По устойчивому идентификатору клиента, а не по имени: имя не уникально
  // и меняется. Поиск по имени остался только для тенантов, заведённых до
  // появления этого столбца, и требует ровно одного совпадения — иначе
  // выбирать за оператора значило бы перезаписать чужого клиента молча.
  const existing = await withOwner(async (client) => {
    const byId = await client.query<{ id: string }>(
      'SELECT id FROM tenants WHERE client_id = $1', [cfg.id]);
    if (byId.rows[0]) return byId.rows[0].id;

    const byName = await client.query<{ id: string; client_id: string | null }>(
      'SELECT id, client_id FROM tenants WHERE name = $1 AND client_id IS NULL', [cfg.name]);
    if (byName.rows.length > 1) {
      throw new Error(
        `клиентов с именем «${cfg.name}» в базе ${byName.rows.length}, и ни у одного ` +
        `не проставлен client_id. Проставьте его вручную тому, который соответствует ` +
        `clients/${cfg.id}: UPDATE tenants SET client_id = '${cfg.id}' WHERE id = '…';`,
      );
    }
    const match = byName.rows[0];
    if (match) {
      // Разовое присвоение: дальше клиент находится по нему.
      await client.query('UPDATE tenants SET client_id = $2 WHERE id = $1', [match.id, cfg.id]);
      return match.id;
    }
    return undefined;
  });

  const created = !existing;
  let tenantId = existing;
  let publicKey: string | undefined;

  if (!tenantId) {
    if (dryRun) {
      // Полный список того, что будет записано, а не одна строчка «tenant».
      // Прежде выход отсюда стоял до всех проверок вовсе: --dry-run на новом
      // клиенте не ловил ни битого пресета, ни отсутствующего логотипа
      // и не показывал диффа. Проверки выше уже отработали.
      return {
        tenantId: '(будет создан)', created: true,
        applied: [
          { field: 'tenant', from: null, to: cfg.name },
          ...desired.map((d) => ({ field: d.field, from: null, to: d.value })),
          ...(logo ? [{ field: 'logo', from: null, to: logo }] : []),
        ],
        skipped: [],
      };
    }
    publicKey = `pk_${randomBytes(16).toString('hex')}`;
    tenantId = await withOwner(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO tenants (client_id, name, allowed_domains, locale_default, public_key,
                              vertical, plan, applied_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [cfg.id, cfg.name, cfg.channels.web.domains, cfg.locale.default, publicKey,
         cfg.vertical, cfg.plan,
         // Пометка «заведён, но не донастроен». Если следующие шаги упадут,
         // повторный запуск увидит её и не примет собственные же значения
         // за правки клиента.
         JSON.stringify({ __pending: true })],
      );
      const id = rows[0]!.id;
      await client.query(
        `INSERT INTO widget_configs (tenant_id, bot_name) VALUES ($1, $2)`,
        [id, cfg.channels.web.widget.botName ?? cfg.name],
      );
      return id;
    });
  }

  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT t.name, t.vertical, t.plan, t.locale_default, t.allowed_domains,
              t.price_guidance, t.quote_fields, t.lead_notify_email, t.lead_notify_from,
              t.hidden_screens, t.profile, t.retrieval_overrides, t.monthly_message_cap,
              t.supported_locales,
              t.applied_config,
              w.bot_name, w.position, w.welcome_message, w.ai_disclosure_text,
              w.preset_id, w.theme
         FROM tenants t LEFT JOIN widget_configs w ON w.tenant_id = t.id
        WHERE t.id = $1`,
      [tenantId],
    );
    const now = rows[0] ?? {};
    const stored = (now.applied_config as Record<string, unknown> | null) ?? null;

    // Пометка «заведён, но не донастроен». Ставится при создании тенанта и
    // снимается только успешным завершением. Пока она стоит, правок клиента
    // существовать не может — трогать было некому, — и защита от перезаписи
    // не просто не нужна, а вредна: именно она молча пропускала тему,
    // приветствие, профиль и сценарий квалификации после прерванного запуска.
    const pending = stored?.__pending === true;
    const last = pending ? null : stored;
    const treatAsNew = created || pending;


    const applied: Change[] = [];
    const skipped: Change[] = [];
    const snapshot: Record<string, unknown> = {};

    for (const d of desired) {
      const current = now[d.column];
      snapshot[d.field] = d.value;

      if (same(current, d.value)) continue;

      // Снимок хранит НАШЕ намерение — что онбординг записал в прошлый раз, —
      // а не то, что сейчас в базе. Разница принципиальна: если записать сюда
      // значение клиента, следующее применение решит, что это мы его и писали,
      // и спокойно затрёт. Проверено, именно так и происходило.
      const knownField = last !== null && d.field in last;
      const clientEdited = !treatAsNew && (
        knownField
          // Мы это поле писали, а в базе теперь другое — трогал клиент.
          ? !same(current, last[d.field])
          // Поле мы ещё не писали, а у существующего тенанта в нём что-то есть.
          // Может быть и наследство, и правка клиента — различить нельзя,
          // поэтому не трогаем и показываем. Осознанный выбор в пользу
          // «лучше не применить, чем затереть чужое».
          : current !== null && current !== undefined && current !== ''
      );

      if (clientEdited && !force) {
        skipped.push({ field: d.field, from: current, to: d.value, clientEdited: true });
        // Намерение остаётся прежним: то, что мы писали раньше, или ничего.
        if (knownField) snapshot[d.field] = last[d.field];
        else delete snapshot[d.field];
        continue;
      }

      applied.push({ field: d.field, from: current, to: d.value });
      if (dryRun) continue;

      const value = isJsonColumn(d.column) ? JSON.stringify(d.value) : d.value;
      if (d.table === 'tenants') {
        await client.query(`UPDATE tenants SET ${d.column} = $2 WHERE id = $1`, [tenantId, value]);
      } else {
        await client.query(
          `INSERT INTO widget_configs (tenant_id, ${d.column}) VALUES ($1, $2)
           ON CONFLICT (tenant_id) DO UPDATE SET ${d.column} = EXCLUDED.${d.column},
                                                 updated_at = now()`,
          [tenantId, value],
        );
      }
    }

    // Логотип — файл, а не поле: сравнивать нечего, кладём если указан.
    // Существование и формат проверены до создания тенанта.
    if (logo && logoPath && logoMime) {
      const path = logoPath;
      const mime = logoMime;
      // Логотип сверяется по содержимому, а не по имени: иначе каждое
      // применение сообщало бы об изменении файла, который не менялся.
      const key = `${tenantId}/brand/logo${extname(path).toLowerCase()}`;
      const wanted = await readFile(path);
      const stored = await storageGet(key).catch(() => null);
      if (!stored || !stored.equals(wanted)) {
        if (!dryRun) {
          await storagePut(key, wanted);
          await client.query('UPDATE tenants SET logo_key = $2, logo_mime = $3 WHERE id = $1',
            [tenantId, key, mime]);
        }
        applied.push({ field: 'logo', from: stored ? '(другой файл)' : null, to: logo });
      }
    }

    if (!dryRun) {
      await client.query('UPDATE tenants SET applied_config = $2 WHERE id = $1',
        [tenantId, JSON.stringify(snapshot)]);
    }

    return {
      tenantId: tenantId!,
      created,
      ...(publicKey ? { publicKey } : {}),
      applied,
      skipped,
    };
  });
}

/**
 * Что онбординг вообще имеет право писать. Всё, чего здесь нет, — территория
 * клиента, и apply её не касается.
 *
 * Вынесено из основного тела ради `--dry-run` на ещё не заведённом клиенте:
 * список нужен до того, как тенант появится, иначе показать нечего.
 */
function desiredFields(
  cfg: ClientConfig,
  quoteFields: Array<{ key: string; label: string; description: string }>,
  preset: (typeof PRESETS)[number] | undefined,
): Array<{ field: string; column: string; table: 'tenants' | 'widget'; value: unknown }> {
  return [
  { field: 'name', column: 'name', table: 'tenants', value: cfg.name },
  { field: 'vertical', column: 'vertical', table: 'tenants', value: cfg.vertical },
  { field: 'plan', column: 'plan', table: 'tenants', value: cfg.plan },
  { field: 'locale', column: 'locale_default', table: 'tenants', value: cfg.locale.default },
  { field: 'supportedLocales', column: 'supported_locales', table: 'tenants', value: cfg.locale.supported },
  { field: 'domains', column: 'allowed_domains', table: 'tenants', value: cfg.channels.web.domains },
  { field: 'priceGuidance', column: 'price_guidance', table: 'tenants', value: cfg.catalog.priceGuidance ?? '' },
  { field: 'quoteFields', column: 'quote_fields', table: 'tenants', value: quoteFields },
  { field: 'leadEmail', column: 'lead_notify_email', table: 'tenants', value: cfg.notifications.leads.email ?? null },
  { field: 'leadFrom', column: 'lead_notify_from', table: 'tenants', value: cfg.notifications.leads.from ?? null },
  { field: 'hiddenScreens', column: 'hidden_screens', table: 'tenants', value: cfg.panel.hiddenScreens },
  { field: 'profile', column: 'profile', table: 'tenants', value: cfg.profile },
  { field: 'retrieval', column: 'retrieval_overrides', table: 'tenants', value: cfg.retrieval },
  { field: 'messageCap', column: 'monthly_message_cap', table: 'tenants', value: cfg.monthlyMessageCap },
  { field: 'botName', column: 'bot_name', table: 'widget', value: cfg.channels.web.widget.botName ?? cfg.name },
  // Тема ставится пресетом, а не набором цветов: подобранные пары уже
  // прошли проверку контраста, а шесть шестнадцатеричных значений
  // в конфиге — приглашение получить нечитаемый виджет.
  ...(preset
    ? [
        { field: 'preset', column: 'preset_id', table: 'widget' as const, value: preset.id },
        { field: 'theme', column: 'theme', table: 'widget' as const, value: preset.theme },
      ]
    : []),
  ...(cfg.channels.web.widget.position
    ? [{ field: 'position', column: 'position', table: 'widget' as const, value: cfg.channels.web.widget.position }]
    : []),
  ...(cfg.channels.web.widget.welcome
    ? [{ field: 'welcome', column: 'welcome_message', table: 'widget' as const, value: cfg.channels.web.widget.welcome }]
    : []),
  ...(cfg.channels.web.widget.aiDisclosure
    ? [{ field: 'aiDisclosure', column: 'ai_disclosure_text', table: 'widget' as const, value: cfg.channels.web.widget.aiDisclosure }]
    : []),
  ];
}

/**
 * Сценарий квалификации: наследуем поля ниши и правим только своё.
 * Порядок остаётся порядком ниши — это порядок брифа у продавца, и клиент
 * не должен его случайно перетасовать, дописав одно поле.
 */
function mergeQualification(
  cfg: ClientConfig,
  vertical: ReturnType<typeof loadVertical>,
): Array<{ key: string; label: string; description: string }> {
  const base = cfg.qualification.inherit ? vertical.qualification.fields : [];
  const merged = base
    .filter((f) => !cfg.qualification.drop.includes(f.key))
    .map((f) => {
      const o = cfg.qualification.override.find((x) => x.key === f.key);
      return o ? { ...f, ...(o.label ? { label: o.label } : {}), ...(o.description ? { description: o.description } : {}) } : f;
    });

  for (const extra of cfg.qualification.extra) {
    if (merged.some((f) => f.key === extra.key)) {
      throw new Error(`qualification.extra: поле «${extra.key}» уже есть в нише — используйте override`);
    }
    merged.push(extra);
  }
  return merged;
}

const JSON_COLUMNS = new Set([
  'quote_fields', 'profile', 'retrieval_overrides', 'welcome_message', 'ai_disclosure_text',
  'theme',
]);
const isJsonColumn = (c: string): boolean => JSON_COLUMNS.has(c);

/**
 * Сравнение по значению. Ключи объектов сортируются: приветствие приходит
 * из YAML в одном порядке, а из базы — в другом, и без нормализации
 * применение вечно показывало бы изменение там, где ничего не менялось.
 */
const same = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

const canon = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as object).sort(([x], [y]) => x.localeCompare(y)))
      : val,
  );
