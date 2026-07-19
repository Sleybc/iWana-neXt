export { PRODUCT_CATEGORY_LABELS } from '@iwana/shared';

export const TAX_CATEGORY_LABELS: Record<string, string> = {
  VAT: 'IVA',
  WITHHOLDING: 'Retención',
  STAMP: 'Estampilla',
  MUNICIPAL: 'Municipal',
  OTHER: 'Otro',
};

export const TAX_TREATMENT_LABELS: Record<string, string> = {
  STANDARD: 'Estándar',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
  FIXED: 'Fija',
};

export const TAX_JURISDICTION_LABELS: Record<string, string> = {
  NATIONAL: 'Nacional',
  DEPARTMENT: 'Departamental',
  MUNICIPAL: 'Municipal',
};

export const TAX_CONTEXT_LABELS: Record<string, string> = {
  SALES: 'Ventas',
  PURCHASE: 'Compras',
  BOTH: 'Ambos',
};

export const TAX_SEGMENT_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  SOHO: 'SOHO',
  PYME: 'PyME',
  CORPORATE: 'Corporativo',
};

/** Resuelve un enum a label amigable; nunca expone el valor crudo. */
export function resolveTaxLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
  fallback = 'Sin clasificar',
): string {
  if (!value) {
    return fallback;
  }

  return labels[value] ?? fallback;
}
