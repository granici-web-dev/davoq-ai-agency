import { withPlatform } from '../db/pool.js';
import { messageCapFor } from '../plans.js';

export interface ResolvedTenant {
  id: string;
  allowedDomains: string[];
  localeDefault: string;
  /** Языки, которые клиент объявил. Список для проверки, а не украшение. */
  supportedLocales: string[];
  /** Тариф. Он же задаёт модель, потолок сообщений и лимиты базы знаний. */
  plan: string;
  subscriptionStatus: string;
  /** Уже с учётом тарифа: null здесь больше не означает «без ограничений». */
  monthlyMessageCap: number;
}

/**
 * pk_ виден всем — он лежит в HTML-коде сайта клиента. Секретом он не является
 * и защиты не даёт: происхождение запроса проверяется по allowed_domains (§4).
 */
export async function resolveTenant(publicKey: string): Promise<ResolvedTenant | null> {
  return withPlatform(async (client) => {
    const { rows } = await client.query<{
      id: string;
      allowed_domains: string[];
      locale_default: string;
      supported_locales: string[];
      plan: string;
      status: string;
      subscription_status: string;
      monthly_message_cap: number | null;
    }>('SELECT * FROM resolve_tenant_by_public_key($1)', [publicKey]);

    const row = rows[0];
    if (!row || row.status !== 'active') return null;

    return {
      id: row.id,
      allowedDomains: row.allowed_domains,
      localeDefault: row.locale_default,
      supportedLocales: row.supported_locales?.length ? row.supported_locales : [row.locale_default],
      plan: row.plan,
      subscriptionStatus: row.subscription_status,
      monthlyMessageCap: messageCapFor(row.plan, row.monthly_message_cap),
    };
  });
}

/**
 * Пустой список доменов означает «ещё не настроено» и трактуется как запрет:
 * незаполненная настройка не должна тихо превращаться в открытый для всех виджет.
 * Поддомены разрешаются явно — `example.com` покрывает `www.example.com`.
 */
export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  if (!origin) return false;

  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowed.some((raw) => {
    const domain = raw.trim().toLowerCase().replace(/^\*\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  });
}
