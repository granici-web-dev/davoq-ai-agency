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

export interface OfferLine {
  label: string;
  value: string;
  /** Надбавка за опцию, если её показывают в разбивке. */
  priceBani?: number;
}

export interface OfferData {
  locale: string;
  number: string;
  date: Date;
  validUntil: Date;
  customer: { name?: string; phone?: string; email?: string };
  configuration: OfferLine[];
  pricing: {
    listBani: number;
    discountBani: number;
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
      paddingTop: t.page.margins.top, paddingRight: t.page.margins.right,
      paddingBottom: t.page.margins.bottom, paddingLeft: t.page.margins.left,
    },
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
    cellPrice: { width: '22%', textAlign: 'right' },
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
            <Text>{m.number} {d.number}</Text>
            <Text>{m.date}: {day(d.date, d.locale)}</Text>
            <Text>{m.validUntil}: {day(d.validUntil, d.locale)}</Text>
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

    case 'configuration': {
      const c = txt.configuration;
      if (!c) return null;
      return (
        <View style={s.section} key={id}>
          <Text style={s.heading}>{c.heading}</Text>
          {d.configuration.map((line, i) => (
            <View style={[s.row, i < d.configuration.length - 1 ? s.rowLine : {}]} key={`${line.label}-${i}`}>
              <Text style={s.cellLabel}>{line.label}</Text>
              <Text style={s.cellValue}>{line.value}</Text>
              <Text style={s.cellPrice}>{line.priceBani ? cur(line.priceBani) : ''}</Text>
            </View>
          ))}
        </View>
      );
    }

    case 'pricing': {
      const p = txt.pricing;
      if (!p) return null;
      const discounted = d.pricing.discountBani > 0;
      return (
        <View style={s.section} key={id}>
          <Text style={s.heading}>{p.heading}</Text>
          <View style={s.totals}>
            {discounted && p.list ? (
              <View style={s.totalRow}>
                <Text style={s.small}>{p.list}</Text>
                <Text style={s.struck}>{cur(d.pricing.listBani)}</Text>
              </View>
            ) : null}
            {discounted && p.discount ? (
              <View style={s.totalRow}>
                <Text style={s.small}>{p.discount}</Text>
                {/* Знак ставит форматтер валюты, а не мы: в разных локалях
                    минус стоит в разных местах относительно символа валюты. */}
                <Text>{cur(-d.pricing.discountBani)}</Text>
              </View>
            ) : null}
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
      <Page size={template.page.size as 'A4'} style={s.page}>
        {template.blocks.map((id) => block(id, template, txt, data, s))}
      </Page>
    </Document>
  );
}

export async function renderOffer(template: OfferTemplate, data: OfferData): Promise<Buffer> {
  registerFonts(template);
  warnUncoveredData(template, [
    data.number, data.customer.name ?? '', data.customer.phone ?? '', data.customer.email ?? '',
    ...data.configuration.flatMap((l) => [l.label, l.value]),
    data.pricing.promo?.label ?? '',
  ]);
  return renderToBuffer(<OfferDocument template={template} data={data} />);
}
