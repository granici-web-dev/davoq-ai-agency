import { fetchPage } from './extract.js';

/**
 * Обход сайта по внутренним ссылкам. Товарные цены у клиента живут на страницах
 * отдельных изделий, а не в категориях: индексировать вручную по одной ссылке —
 * значит гарантированно пропустить половину каталога.
 */
export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Не трогаем юридические страницы и блог: шум в поиске, ноль пользы посетителю. */
  exclude?: RegExp;
}

const DEFAULT_EXCLUDE =
  /\/(politica|termeni|blog|feed|wp-|cart|checkout|cont|author|tag|page\/\d)/i;

export async function crawl(startUrl: string, opts: CrawlOptions = {}): Promise<string[]> {
  const maxPages = opts.maxPages ?? 60;
  const maxDepth = opts.maxDepth ?? 2;
  const exclude = opts.exclude ?? DEFAULT_EXCLUDE;

  const origin = new URL(startUrl).origin;
  const host = new URL(startUrl).hostname.replace(/^www\./, '');
  const seen = new Set<string>();
  const found: string[] = [];
  let frontier: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  while (frontier.length > 0 && found.length < maxPages) {
    const next: Array<{ url: string; depth: number }> = [];

    for (const { url, depth } of frontier) {
      if (found.length >= maxPages) break;
      const key = url.replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);

      let html: string;
      try {
        ({ content: html } = await fetchPage(url));
      } catch {
        continue;
      }
      found.push(url);
      if (depth >= maxDepth) continue;

      for (const raw of html.matchAll(/href="([^"]+)"/g)) {
        let link: URL;
        try {
          link = new URL(raw[1]!, origin);
        } catch {
          continue;
        }
        if (link.hostname.replace(/^www\./, '') !== host) continue;
        if (/\.(jpg|jpeg|png|webp|svg|css|js|pdf|xml|zip)$/i.test(link.pathname)) continue;
        if (exclude.test(link.pathname)) continue;
        // Якоря и параметры дают дубли одной и той же страницы.
        link.hash = '';
        link.search = '';
        const clean = link.toString().replace(/\/$/, '');
        if (!seen.has(clean)) next.push({ url: clean, depth: depth + 1 });
      }
    }
    frontier = next;
  }

  return found;
}
