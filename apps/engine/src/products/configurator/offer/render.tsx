import {
  Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer,
} from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { warnUncoveredData } from './fonts.js';
import type { BlockId, OfferTemplate, OfferText } from './schema.js';

/**
 * Рендер бланка. ОДИН на всех клиентов.
 *
 * Всё, чем клиенты отличаются, приходит сюда данными: порядок блоков, палитра,
 * шрифты, реквизиты, тексты по локалям. Ветка «если клиент X» в этом файле —
 * признак того, что схема бланка чего-то не выражает; чинится схема, а не файл.
 *
 * Деньги приходят целыми, в минимальной единице валюты. Форматирование
 * в строку — единственное место, где появляется дробь, и дальше этой строки
 * она никуда не уходит.
 */

/**
 * Позиция заказа.
 *
 * Не «одна конфигурация». Оферта пилота, которую он показал, — это заказ
 * на девять моделей плюс доставка и монтаж: покупатель обставляет квартиру,
 * а не покупает диван. Бланк на одну позицию не покрыл бы ни одного их
 * реального документа.
 */
export interface OfferItem {
  title: string;
  /** Спецификация позиции: то, что выбрано в конфигураторе. */
  lines?: string[];
  quantity?: number;
  unitBani?: number;
  discountBani?: number;
  discountPercent?: number;
  totalBani: number;
  /** Фотография позиции, если есть. */
  image?: string;
}

export interface OfferData {
  locale: string;
  number: string;
  date: Date;
  validUntil: Date;
  customer: { name?: string; phone?: string; email?: string };
  /** Менеджер, от чьего имени оферта. У пилота он назван в бланке поимённо. */
  consultant?: string;
  /** Характеристики изделия парами. В фазе 3 приходят из выбора посетителя. */
  specs?: Array<{ label: string; value: string }>;
  items: OfferItem[];
  pricing: {
    subtotalBani: number;
    discountBani: number;
    /** НДС отдельной строкой: у пилота он показан так, и это требование учёта. */
    vatBani?: number;
    vatRate?: number;
    totalBani: number;
    promo?: { label: string; validUntil?: Date };
  };
}

const registered = new Set<string>();

/** Шрифты регистрируются один раз на процесс: повторная регистрация течёт памятью. */
function registerFonts(template: OfferTemplate): void {
  for (const font of template.theme.fonts) {
    const key = `${font.family}|${font.src}|${font.weight ?? ''}|${font.style ?? ''}`;
    if (registered.has(key)) continue;
    Font.register({
      family: font.family,
      fonts: [{
        src: font.src,
        ...(font.weight !== undefined ? { fontWeight: font.weight } : {}),
        ...(font.style !== undefined ? { fontStyle: font.style as 'italic' | 'normal' } : {}),
      }],
    });
    registered.add(key);
  }
}

const money = (bani: number, code: string, locale: string, decimals: number): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency', currency: code,
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(bani / 100);

const day = (d: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

function styles(t: OfferTemplate) {
  const { colors, fontSize, fontFamily } = t.theme;
  return StyleSheet.create({
    page: {
      fontFamily, fontSize: fontSize.base, color: colors.text,
      backgroundColor: colors.page,
      paddingTop: t.page.margins.top, paddingRight: t.page.margins.right,
      paddingBottom: t.page.margins.bottom, paddingLeft: t.page.margins.left,
    },
    // Обложка вытянута под края листа: поля страницы её не касаются,
    // иначе фотография висит в рамке, а в бланке клиента она в край.
    hero: {
      position: 'relative',
      marginTop: -t.page.margins.top,
      marginLeft: -t.page.margins.left,
      marginRight: -t.page.margins.right,
      marginBottom: 18,
      backgroundColor: colors.accent,
    },
    heroImage: { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' },
    heroPad: {
      flex: 1, justifyContent: 'space-between',
      paddingTop: 18, paddingBottom: 14,
      paddingLeft: t.page.margins.left, paddingRight: t.page.margins.right,
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    heroTitle: { color: colors.onAccent, fontSize: fontSize.title, lineHeight: 1.15 },
    heroLogo: { width: 74, maxHeight: 46, objectFit: 'contain' },
    heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    heroRight: { alignItems: 'flex-end' },
    heroSmall: { color: colors.onAccent, fontSize: fontSize.small, lineHeight: 1.5 },
    bar: {
      backgroundColor: colors.accent, color: colors.onAccent, fontSize: fontSize.heading,
      paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8,
    },
    bullet: { flexDirection: 'row', paddingVertical: 1.5 },
    bulletDot: { width: 12, color: colors.muted },
    galleryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    galleryImage: { width: 96, height: 72, objectFit: 'cover' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    logo: { width: 120, maxHeight: 44, objectFit: 'contain' },
    company: { textAlign: 'right', color: colors.muted, fontSize: fontSize.small, lineHeight: 1.5 },
    companyName: { color: colors.text, fontSize: fontSize.base },
    title: { fontSize: fontSize.title, marginTop: 24, color: colors.accent },
    metaRow: { flexDirection: 'row', gap: 24, marginTop: 6, color: colors.muted, fontSize: fontSize.small },
    section: { marginTop: 22 },
    heading: {
      fontSize: fontSize.heading, marginBottom: 8, paddingBottom: 4,
      borderBottomWidth: 1, borderBottomColor: colors.line,
    },
    row: { flexDirection: 'row', paddingVertical: 4 },
    rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
    cellLabel: { width: '38%', color: colors.muted },
    cellValue: { flex: 1 },
    rowHead: { borderBottomWidth: 1, borderBottomColor: colors.line, color: colors.muted, fontSize: fontSize.small },
    cellNo: { width: 20, color: colors.muted },
    cellItem: { flex: 1, paddingRight: 8 },
    cellQty: { width: 40, textAlign: 'right' },
    cellPrice: { width: 90, textAlign: 'right' },
    spec: { fontSize: fontSize.small, color: colors.muted, lineHeight: 1.4 },
    itemImage: { width: 110, marginTop: 6, objectFit: 'contain' },
    totals: { marginTop: 10, alignItems: 'flex-end' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: '55%', paddingVertical: 3 },
    struck: { color: colors.muted, textDecoration: 'line-through' },
    total: { fontSize: fontSize.heading, paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line },
    promo: { color: colors.accent, fontSize: fontSize.small, marginTop: 4, textAlign: 'right' },
    small: { fontSize: fontSize.small, color: colors.muted, lineHeight: 1.5 },
    footer: {
      position: 'absolute', left: t.page.margins.left, right: t.page.margins.right,
      bottom: 20, textAlign: 'center', fontSize: fontSize.small, color: colors.muted,
    },
  });
}

type S = ReturnType<typeof styles>;

function block(id: BlockId, t: OfferTemplate, txt: OfferText, d: OfferData, s: S): ReactElement | null {
  const cur = (bani: number): string => money(bani, t.currency.code, d.locale, t.currency.decimals);

  switch (id) {
    case 'hero': {
      const h = txt.hero;
      if (!h) return null;
      const cfg = t.hero ?? {};
      // Без фотографии обложка короче: высокая пустая заливка читается
      // как незагрузившаяся картинка, а не как приём.
      return (
        <View style={[s.hero, { height: cfg.height ?? (cfg.image ? 210 : 120) }]} key={id}>
          {cfg.image ? <Image src={cfg.image} style={s.heroImage} /> : null}
          <View style={s.heroPad}>
            <View style={s.heroTop}>
              <View>
                <Text style={s.heroTitle}>{h.title}</Text>
                {d.customer.name ? <Text style={s.heroTitle}>{d.customer.name}</Text> : null}
              </View>
              {cfg.logo ? <Image src={cfg.logo} style={s.heroLogo} /> : null}
            </View>
            <View style={s.heroBottom}>
              <Text style={s.heroSmall}>{day(d.date, d.locale)}</Text>
              <View style={s.heroRight}>
                {(h.lines ?? []).map((line, i) => <Text style={s.heroSmall} key={i}>{line}</Text>)}
                {h.numberLabel
                  ? <Text style={s.heroSmall}>{h.numberLabel} {d.number}</Text>
                  : null}
              </View>
            </View>
          </View>
        </View>
      );
    }

    case 'header': {
      const h = txt.header;
      if (!h) return null;
      return (
        <View style={s.header} key={id}>
          {t.logo ? <Image src={t.logo} style={s.logo} /> : <View />}
          <View style={s.company}>
            <Text style={s.companyName}>{h.company}</Text>
            {(h.lines ?? []).map((line, i) => <Text key={i}>{line}</Text>)}
          </View>
        </View>
      );
    }

    case 'meta': {
      const m = txt.meta;
      if (!m) return null;
      return (
        <View key={id}>
          <Text style={s.title}>{m.title}</Text>
          <View style={s.metaRow}>
            {m.number ? <Text>{m.number} {d.number}</Text> : null}
            <Text>{m.date}: {day(d.date, d.locale)}</Text>
            <Text>{m.validUntil}: {day(d.validUntil, d.locale)}</Text>
            {m.consultant && d.consultant ? <Text>{m.consultant}: {d.consultant}</Text> : null}
          </View>
        </View>
      );
    }

    case 'customer': {
      const c = txt.customer;
      if (!c) return null;
      const rows: Array<[string, string]> = [];
      if (d.customer.name && c.name) rows.push([c.name, d.customer.name]);
      if (d.customer.phone && c.phone) rows.push([c.phone, d.customer.phone]);
      if (d.customer.email && c.email) rows.push([c.email, d.customer.email]);
      if (rows.length === 0) return null;
      return (
        <View style={s.section} key={id}>
          <Text style={s.heading}>{c.heading}</Text>
          {rows.map(([label, value]) => (
            <View style={s.row} key={label}>
              <Text style={s.cellLabel}>{label}</Text>
              <Text style={s.cellValue}>{value}</Text>
            </View>
          ))}
        </View>
      );
    }

    case 'items': {
      const c = txt.items;
      if (!c) return null;
      return (
        <View style={s.section} key={id}>
          <View wrap={false}>
            <Text style={s.heading}>{c.heading}</Text>
          </View>
          <View style={[s.row, s.rowHead]}>
            <Text style={s.cellNo}>#</Text>
            <Text style={s.cellItem}>{c.product ?? ''}</Text>
            <Text style={s.cellQty}>{c.quantity ?? ''}</Text>
            <Text style={s.cellPrice}>{c.discount ?? ''}</Text>
            <Text style={s.cellPrice}>{c.total ?? ''}</Text>
          </View>
          {d.items.map((item, i) => (
            <View style={[s.row, s.rowLine]} key={`${item.title}-${i}`} wrap={false}>
              <Text style={s.cellNo}>{i + 1}</Text>
              <View style={s.cellItem}>
                <Text>{item.title}</Text>
                {(item.lines ?? []).map((line, j) => (
                  <Text style={s.spec} key={j}>{line}</Text>
                ))}
                {item.image ? <Image src={item.image} style={s.itemImage} /> : null}
              </View>
              <Text style={s.cellQty}>{item.quantity ?? 1}</Text>
              <View style={s.cellPrice}>
                {item.discountPercent ? <Text>{item.discountPercent.toFixed(2)}%</Text> : null}
                {item.discountBani ? <Text style={s.spec}>{cur(item.discountBani)}</Text> : null}
              </View>
              <Text style={s.cellPrice}>{cur(item.totalBani)}</Text>
            </View>
          ))}
        </View>
      );
    }

    case 'pricing': {
      const p = txt.pricing;
      if (!p) return null;
      const rows: Array<[string, string, boolean]> = [];
      // Подытог не зачёркивается: зачёркнутая цена означает «было столько,
      // стало столько», а здесь ниже идут вычитания — это разные вещи.
      if (p.subtotal) rows.push([p.subtotal, cur(d.pricing.subtotalBani), false]);
      if (p.discount && d.pricing.discountBani > 0) {
        // Знак ставит форматтер валюты, а не мы: в разных локалях минус стоит
        // в разных местах относительно символа валюты.
        rows.push([p.discount, cur(-d.pricing.discountBani), false]);
      }
      if (p.vat && d.pricing.vatBani !== undefined) {
        const label = d.pricing.vatRate !== undefined
          ? `${p.vat} (${d.pricing.vatRate}%)` : p.vat;
        rows.push([label, cur(d.pricing.vatBani), false]);
      }
      return (
        <View style={s.section} key={id} wrap={false}>
          <Text style={s.heading}>{p.heading}</Text>
          <View style={s.totals}>
            {rows.map(([label, value, struck]) => (
              <View style={s.totalRow} key={label}>
                <Text style={s.small}>{label}</Text>
                <Text style={struck ? s.struck : {}}>{value}</Text>
              </View>
            ))}
            <View style={[s.totalRow, s.total]}>
              <Text>{p.total}</Text>
              <Text>{cur(d.pricing.totalBani)}</Text>
            </View>
          </View>
          {d.pricing.promo ? (
            <Text style={s.promo}>
              {d.pricing.promo.label}
              {d.pricing.promo.validUntil ? ` · ${day(d.pricing.promo.validUntil, d.locale)}` : ''}
            </Text>
          ) : null}
          {p.disclaimer ? <Text style={[s.small, { marginTop: 10 }]}>{p.disclaimer}</Text> : null}
        </View>
      );
    }

    case 'specs': {
      const c = txt.specs;
      if (!c || !d.specs || d.specs.length === 0) return null;
      return (
        <View style={s.section} key={id}>
          {/* Заголовок склеен с началом таблицы: одинокая плашка внизу
              страницы читается как сбой вёрстки, а не как раздел. Держим
              заголовок и две строки, остальное переносится свободно —
              так длинная таблица не обрежется на второй странице. */}
          {[d.specs.slice(0, 2), d.specs.slice(2)].map((chunk, part) => (
            <View wrap={part === 1} key={part}>
              {part === 0 ? <Text style={s.bar}>{c.heading}</Text> : null}
              {chunk.map((row, i) => (
                <View style={[s.row, part * 2 + i < d.specs!.length - 1 ? s.rowLine : {}]} key={row.label}>
                  <Text style={s.cellLabel}>{row.label}</Text>
                  <Text style={s.cellValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }

    case 'notes': {
      const c = txt.notes;
      if (!c) return null;
      return (
        <View style={s.section} key={id}>
          {[(c.items ?? []).slice(0, 2), (c.items ?? []).slice(2)].map((chunk, part) => (
            <View wrap={part === 1} key={part}>
              {part === 0 ? <Text style={s.bar}>{c.heading}</Text> : null}
              {chunk.map((line, i) => (
                <View style={s.bullet} key={i}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.small}>{line}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }

    case 'gallery': {
      const files = t.gallery ?? [];
      if (files.length === 0) return null;
      return (
        <View style={s.section} key={id}>
          {txt.gallery?.heading ? <View minPresenceAhead={140}><Text style={s.bar}>{txt.gallery.heading}</Text></View> : null}
          <View style={s.galleryRow}>
            {files.map((file, i) => <Image src={file} style={s.galleryImage} key={i} />)}
          </View>
        </View>
      );
    }

    case 'legal':
      return txt.legal
        ? <View style={s.section} key={id}><Text style={s.small}>{txt.legal}</Text></View>
        : null;

    case 'footer':
      return txt.footer ? <Text style={s.footer} fixed key={id}>{txt.footer}</Text> : null;
  }
}

export function OfferDocument({ template, data }: { template: OfferTemplate; data: OfferData }): ReactElement {
  const s = styles(template);
  const txt = template.text[data.locale];
  // Локаль проверена при загрузке шаблона; здесь она может отсутствовать только
  // если данные пришли с локалью, которой у тенанта нет, — это ошибка вызова.
  if (!txt) throw new Error(`бланк: нет текстов для локали «${data.locale}»`);

  return (
    <Document>
      <Page
        size={template.page.size as 'A4'}
        orientation={template.page.orientation ?? 'portrait'}
        style={s.page}
      >
        {template.blocks.map((id) => block(id, template, txt, data, s))}
      </Page>
    </Document>
  );
}

export async function renderOffer(template: OfferTemplate, data: OfferData): Promise<Buffer> {
  registerFonts(template);
  warnUncoveredData(template, [
    data.number, data.customer.name ?? '', data.customer.phone ?? '', data.customer.email ?? '',
    ...data.items.flatMap((i) => [i.title, ...(i.lines ?? [])]),
    data.pricing.promo?.label ?? '',
  ]);
  return renderToBuffer(<OfferDocument template={template} data={data} />);
}
