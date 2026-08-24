import { withTenant } from '../../engine/db/pool.js';
import type { Json } from './config/layers.js';
import { buildConfigurator, type Configurator } from './load.js';
import { buildOfferTemplate } from './offer/load.js';
import type { OfferTemplate } from './offer/schema.js';

/**
 * Конфигуратор тенанта: слой ниши из репозитория, слой клиента из базы.
 *
 * Слой клиента здесь jsonb, а не YAML с диска. Каталог `clients/<id>` — это
 * ВХОД онбординга, а не источник правды в рантайме: на сервере его нет вовсе.
 * Ровно так же устроены приветствие, тема и реквизиты — конфигуратор не заводит
 * второй механизм.
 *
 * Пути к файлам в этом слое уже абсолютные: их развернул `client apply`,
 * когда складывал картинки и шрифты в хранилище тенанта. Загрузчику остаётся
 * слить слои и проверить.
 */

export interface TenantConfigurator {
  configurator: Configurator;
  offer: OfferTemplate;
}

interface Row { vertical: string | null; configurator: Record<string, Json> | null }

/**
 * `null` — у тенанта конфигуратора нет. Это законное состояние, а не ошибка:
 * чат-бот продаётся отдельно, и большинство тенантов останется без него.
 */
export async function tenantConfigurator(
  tenantId: string, locales: string[],
): Promise<TenantConfigurator | null> {
  const row = await withTenant(tenantId, async (client) => {
    const { rows } = await client.query<Row>(
      'SELECT vertical, configurator FROM tenants WHERE id = $1', [tenantId],
    );
    return rows[0] ?? null;
  });
  if (!row) return null;

  const layer = row.configurator;
  if (!layer || Object.keys(layer).length === 0) return null;

  const where = `конфигуратор тенанта ${tenantId}`;
  return {
    configurator: buildConfigurator({
      verticalId: row.vertical, clientLayer: layer as Json, locales, where,
    }),
    offer: buildOfferTemplate({
      verticalId: row.vertical, clientLayer: layer.offer, locales, where,
    }),
  };
}
