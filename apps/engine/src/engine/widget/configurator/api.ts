import type { PublicFlow } from '../../../products/configurator/flow/public.js';

/**
 * Разговор виджета с сервером.
 *
 * Цену виджет НЕ СЧИТАЕТ. Не потому, что не смог бы, а потому, что считать
 * ему нечем: прайса в браузере нет (см. `flow/public.ts`), и каждая цифра,
 * которую видит посетитель, приходит из этого запроса. Это же число потом
 * печатается в оферте — сравнивать нечего, оно одно.
 */

export type { PublicFlow, PublicStep, PublicOption } from '../../../products/configurator/flow/public.js';

export interface ConfiguratorConfig {
  flow: PublicFlow;
  currency: { code: string; decimals: number };
  vat: { rate: number; mode: 'add' | 'included' };
}

export interface PriceView {
  finalPriceBani: number;
  vatBani: number;
  totalBani: number;
  discountBani: number;
  promo?: { label: string };
}

export type Answers = Record<string, string | string[] | number>;

export async function fetchConfigurator(
  base: string, key: string, locale: string,
): Promise<ConfiguratorConfig> {
  const url = `${base}/v1/configurator/config?key=${encodeURIComponent(key)}&locale=${encodeURIComponent(locale)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`configurator config: ${res.status}`);
  return (await res.json()) as ConfiguratorConfig;
}

export async function fetchPrice(
  base: string, key: string, answers: Answers, signal: AbortSignal,
): Promise<PriceView | null> {
  const res = await fetch(`${base}/v1/configurator/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: key, selections: answers }),
    signal,
  });
  // 422 — выбор ещё неполный: это нормальный ход, а не поломка. Цена просто
  // ещё не показывается.
  if (res.status === 422) return null;
  if (!res.ok) throw new Error(`price: ${res.status}`);
  return (await res.json()) as PriceView;
}

export interface OfferRequest {
  publicKey: string;
  visitorId: string;
  conversationId?: string | undefined;
  selections: Answers;
  contact: { name: string; email: string; phone: string };
  consentMarketing: boolean;
  locale: string;
}

export async function submitOffer(base: string, body: OfferRequest): Promise<boolean> {
  try {
    const res = await fetch(`${base}/v1/configurator/offer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function money(bani: number, currency: string, locale: string, decimals: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(bani / 10 ** decimals);
}
