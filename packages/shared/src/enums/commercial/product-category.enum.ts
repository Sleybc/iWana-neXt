/**
 * Categoría de producto o equipo en el catálogo comercial.
 * Extiende los valores originales de AdditionalProductCategory con
 * nuevas categorías para red y CPE (Customer Premises Equipment).
 */
export enum ProductCategory {
  ENTERTAINMENT = 'ENTERTAINMENT',
  SECURITY = 'SECURITY',
  CONNECTIVITY = 'CONNECTIVITY',
  BUSINESS = 'BUSINESS',
  NETWORKING = 'NETWORKING',
  CPE = 'CPE',
}

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  [ProductCategory.ENTERTAINMENT]: 'Entretenimiento',
  [ProductCategory.SECURITY]: 'Seguridad',
  [ProductCategory.CONNECTIVITY]: 'Conectividad',
  [ProductCategory.BUSINESS]: 'Negocios',
  [ProductCategory.NETWORKING]: 'Red',
  [ProductCategory.CPE]: 'Equipo cliente (CPE)',
};
