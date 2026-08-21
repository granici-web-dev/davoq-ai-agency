/**
 * Печатает системный промпт тенанта ровно в том виде, в каком его получает
 * модель. Нужен как эталон при переносе блоков промпта между слоями:
 * извлечение в файлы не имеет права поменять ни байта.
 */
import '../src/engine/env.js';
import { pool, withTenant } from '../src/engine/db/pool.js';
import { loadQuoteConfig } from '../src/engine/llm/quote.js';
import { verticalOf } from '../src/engine/prompt/vertical.js';
import { buildSystem } from '../src/engine/rag/prompt.js';

const tenantId = process.argv[2];
if (!tenantId) throw new Error('usage: dump-prompt <tenantId>');

const out = await withTenant(tenantId, async (client) => {
  const { rows } = await client.query<{
    bot_name: string; tenant_name: string; locale: string; vertical: string | null;
  }>(
    `SELECT coalesce(w.bot_name, 'Assistant') AS bot_name, t.name AS tenant_name,
            t.locale_default AS locale, t.vertical
       FROM tenants t LEFT JOIN widget_configs w ON w.tenant_id = t.id
      WHERE t.id = $1`, [tenantId]);
  const quote = await loadQuoteConfig(client, tenantId);
  return buildSystem({
    botName: rows[0]!.bot_name,
    companyName: rows[0]!.tenant_name,
    localeDefault: rows[0]!.locale,
    priceGuidance: quote.priceGuidance,
    quoteFields: quote.fields,
    vertical: verticalOf(rows[0]!.vertical),
  });
});

process.stdout.write(out.map((b) => b.text).join('\n'));
await pool.end();
