export enum AdditionalProductCategory {
  ENTERTAINMENT = 'ENTERTAINMENT',
  SECURITY = 'SECURITY',
  CONNECTIVITY = 'CONNECTIVITY',
  BUSINESS = 'BUSINESS',
}

export const ADDITIONAL_PRODUCT_CATEGORY_LABELS: Record<AdditionalProductCategory, string> = {
  [AdditionalProductCategory.ENTERTAINMENT]: 'Entretenimiento',
  [AdditionalProductCategory.SECURITY]: 'Seguridad',
  [AdditionalProductCategory.CONNECTIVITY]: 'Conectividad',
  [AdditionalProductCategory.BUSINESS]: 'Negocios',
};
