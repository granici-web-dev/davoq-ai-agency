import * as cheerio from 'cheerio';
import { clientError } from '../api/errors.js';
import { safeFetch } from '../net/safe-fetch.js';

/** Кусок исходника с сохранённым путём заголовков — «Тарифы > Enterprise» (§7). */
export interface Block {
  headingPath: string[];
  text: string;
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Обрезает хвост пути заголовков до уровня нового заголовка. */
function descend(path: string[], level: number, title: string): string[] {
  return [...path.slice(0, Math.max(0, level - 1)), title];
}

export function extractHtml(html: string): Block[] {
  const $ = cheerio.load(html);
  // Навигация, подвал и скрипты дают шум, который потом всплывает в ответах бота
  // как «свяжитесь с нами» на любой вопрос.
  $('script, style, nav, footer, header, noscript, svg, form').remove();

  const blocks: Block[] = [];
  let path: string[] = [];

  $('h1, h2, h3, h4, h5, h6, p, li, td, dd, blockquote').each((_, el) => {
    const tag = (el as { tagName?: string }).tagName ?? '';
    const text = clean($(el).text());
    if (!text) return;

    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      path = descend(path, Number(heading[1]), text);
      return;
    }
    blocks.push({ headingPath: [...path], text });
  });

  return blocks;
}

export function extractMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let path: string[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    const text = clean(buffer.join(' '));
    if (text) blocks.push({ headingPath: [...path], text });
    buffer = [];
  };

  for (const line of src.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      path = descend(path, heading[1]!.length, clean(heading[2]!));
      continue;
    }
    if (line.trim() === '') flush();
    else buffer.push(line);
  }
  flush();
  return blocks;
}

/**
 * .docx через mammoth: он отдаёт HTML с сохранёнными заголовками, поэтому путь
 * разделов доходит до чанков — а из голого текста структуру уже не восстановить.
 */
export async function extractDocx(buffer: Buffer): Promise<Block[]> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ buffer });
  return extractHtml(value);
}

/**
 * .pdf через unpdf. Заголовков в PDF нет как структуры, поэтому раздел — это страница:
 * путь вида «Страница 3» хотя бы даёт модели и пользователю ссылку на место в документе.
 */
export async function extractPdf(buffer: Buffer): Promise<Block[]> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  return pages.flatMap((page, i) =>
    page
      .split(/\n\s*\n/)
      .map((para) => clean(para))
      .filter(Boolean)
      .map((para) => ({ headingPath: [`Pagina ${i + 1}`], text: para })),
  );
}

/**
 * .odt — тот же zip, но OpenDocument, и mammoth его не читает. Разбираем сами:
 * структура простая, а отказ на формате, который отдаёт LibreOffice по умолчанию,
 * сорвал бы весь замысел с базой знаний на Google Drive.
 */
export async function extractOdt(buffer: Buffer): Promise<Block[]> {
  const JSZip = (await import('jszip')).default;
  const xml = await (await JSZip.loadAsync(buffer)).file('content.xml')?.async('string');
  if (!xml) throw clientError('odt_broken', 'Fișierul .odt nu conține content.xml — probabil este deteriorat');

  const blocks: Block[] = [];
  let path: string[] = [];

  // Абзацы и заголовки идут в документе по порядку, поэтому одного прохода хватает.
  for (const m of xml.matchAll(/<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/g)) {
    const text = clean(
      m[3]!.replace(/<text:s\/>/g, ' ').replace(/<text:tab\/>/g, ' ').replace(/<[^>]+>/g, ''),
    );
    if (!text) continue;

    if (m[1] === 'h') {
      const level = Number(/outline-level="(\d+)"/.exec(m[2]!)?.[1] ?? 1);
      path = descend(path, level, text);
    } else {
      blocks.push({ headingPath: [...path], text });
    }
  }
  return blocks;
}

export type Format = 'docx' | 'odt' | 'pdf' | 'html' | 'markdown';

/**
 * Формат определяется по содержимому, а не по типу, который прислал загружающий:
 * браузеры и клиенты регулярно шлют application/octet-stream для .docx, и разбор
 * по заявленному типу отваливается на совершенно нормальном файле.
 * Порядок: сигнатура файла → расширение имени → заявленный MIME.
 */
export function detectFormat(
  content: string | Buffer,
  filename: string,
  mime: string,
): Format | null {
  if (Buffer.isBuffer(content)) {
    if (content.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
    // ODF помечает себя строкой mimetype в самом начале архива.
    if (content.subarray(0, 200).includes('opendocument.text')) return 'odt';
    // Любой OOXML — это zip; отличаем .docx по наличию word/document.xml внутри.
    if (content.subarray(0, 4).toString('latin1') === 'PK\x03\x04'
        || (content[0] === 0x50 && content[1] === 0x4b)) {
      if (content.includes('word/document.xml')) return 'docx';
      if (content.includes('content.xml')) return 'odt';
      return null;
    }
  }

  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (ext === '.docx' || ext === '.doc') return 'docx';
  if (ext === '.odt') return 'odt';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.md' || ext === '.txt') return 'markdown';

  const m = mime.toLowerCase();
  if (m.includes('wordprocessingml') || m.includes('msword')) return 'docx';
  if (m.includes('opendocument.text')) return 'odt';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('html')) return 'html';
  if (m.includes('markdown') || m.includes('plain')) return 'markdown';
  return null;
}

export async function extract(
  content: string | Buffer,
  mime: string,
  filename = '',
): Promise<Block[]> {
  switch (detectFormat(content, filename, mime)) {
    case 'docx': return extractDocx(toBuffer(content));
    case 'odt': return extractOdt(toBuffer(content));
    case 'pdf': return extractPdf(toBuffer(content));
    case 'html': return extractHtml(content.toString('utf8'));
    case 'markdown': return extractMarkdown(content.toString('utf8'));
    default:
      // Сообщение читает человек в админке (§7 п.1), а не только лог.
      throw new Error(
        `Nu am putut recunoaște formatul fișierului${filename ? ` «${filename}»` : ''}. ` +
        'Încărcați .docx, .odt, .pdf, .md, .txt sau .html.',
      );
  }
}

/** Потолок на страницу: больше этого в базу знаний всё равно не берётся. */
const PAGE_MAX_BYTES = 2 * 1024 * 1024;

const toBuffer = (c: string | Buffer): Buffer =>
  Buffer.isBuffer(c) ? c : Buffer.from(c, 'binary');

/**
 * Загрузка страницы сайта — основной источник для демо и для онбординга клиента.
 *
 * Адрес приходит из панели, то есть от человека с логином, а запрос по нему
 * делает наш сервер. Поэтому только через `safeFetch`: проверка адреса, проверка
 * каждого перехода, проверка адреса в момент соединения и потолок на размер.
 * Голый `fetch` здесь означал бы, что достаточно добавить «документ» с адресом
 * метаданных облака, чтобы учётные данные роли стали читаемы прямо в панели.
 */
export async function fetchPage(url: string): Promise<{ content: string; mime: string }> {
  const res = await safeFetch(url, {
    headers: { 'user-agent': 'AssistWidgetBot/0.1 (+ingest)' },
    maxBytes: PAGE_MAX_BYTES,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Pagina ${url} a răspuns cu ${res.status}`);
  }
  if (res.truncated) {
    throw new Error(
      `Pagina ${url} depășește ${Math.round(PAGE_MAX_BYTES / 1024)} KB și nu a fost preluată.`,
    );
  }
  return { content: res.body, mime: res.contentType || 'text/html' };
}
