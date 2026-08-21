import type pg from 'pg';

/** Один вопрос из тех, что продавец задаёт перед расчётом цены. */
export interface QuoteField {
  key: string;
  label: string;
  description: string;
  required?: boolean;
}

/** Стартовый набор для мебельного производства — тенант правит его под себя. */
export const FURNITURE_DEFAULTS: QuoteField[] = [
  { key: 'product_type', label: 'Tipul produsului', description: 'Canapea, canapea de colț, pat, fotoliu, saltea' },
  { key: 'dimensions', label: 'Dimensiuni', description: 'Metrajul canapelei sau dimensiunea patului, de exemplu 2.60 m sau 160×200' },
  { key: 'filling', label: 'Umplutura', description: 'Dacă vizitatorul a menționat-o' },
  { key: 'upholstery', label: 'Tapițeria', description: 'Țesătură sau piele, culoarea' },
  { key: 'sleeping_function', label: 'Funcție de dormit', description: 'Dacă are nevoie de mecanism de extindere' },
  { key: 'city', label: 'Orașul', description: 'Orașul vizitatorului sau cel mai apropiat showroom' },
];

export function parseQuoteFields(raw: unknown): QuoteField[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter(
    (f): f is QuoteField =>
      typeof f === 'object' && f !== null && typeof (f as QuoteField).key === 'string',
  );
}

/**
 * Инструмент собирается из настроек тенанта. Контакт обязателен всегда:
 * заявка без способа связи бесполезна отделу продаж, а всё остальное —
 * то, что удалось выяснить, и его отсутствие не повод не передавать заявку.
 */
export function buildQuoteTool(fields: QuoteField[]): {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
} {
  const properties: Record<string, unknown> = {
    email: { type: 'string', description: 'Visitor email' },
    phone: { type: 'string', description: 'Visitor phone number' },
    name: { type: 'string', description: 'Visitor name' },
  };
  for (const f of fields) {
    // «Словами посетителя» — иначе модель переводит формулировку и в заявке
    // у продавца оказывается «Unghi divanul» вместо «canapea de colț».
    properties[f.key] = {
      type: 'string',
      description: `${f.label}. ${f.description}. Record the visitor's own wording; do not translate.`,
    };
  }

  return {
    name: 'request_quote',
    description:
      'Hand a pricing request to a manager. Call it as soon as the visitor has given an ' +
      'email or a phone number, with whatever you know at that moment. ' +
      'Then CALL IT AGAIN after every further detail you learn — city, size, upholstery, ' +
      'a correction. Repeat calls do not create duplicates: they update the same request, ' +
      'so calling too often is free and calling too rarely loses information the manager needs.',
    input_schema: { type: 'object', properties, required: [] },
  };
}

export interface TenantQuoteConfig {
  fields: QuoteField[];
  priceGuidance: string;
}

export async function loadQuoteConfig(
  client: pg.PoolClient,
  tenantId: string,
): Promise<TenantQuoteConfig> {
  const { rows } = await client.query<{ quote_fields: unknown; price_guidance: string }>(
    'SELECT quote_fields, price_guidance FROM tenants WHERE id = $1',
    [tenantId],
  );
  return {
    fields: parseQuoteFields(rows[0]?.quote_fields),
    priceGuidance: rows[0]?.price_guidance ?? '',
  };
}
