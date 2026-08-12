import { describePlatformEntityLabel } from '@/lib/platform-audit-vocabulary';

/**

 * Retorna la etiqueta de producto para un tipo de entidad.

 * Un solo mapa: PLATFORM_UI_COPY.audit vía platform-audit-vocabulary.

 */

export function entityLabel(entityType: string): string {
  return describePlatformEntityLabel(entityType);
}

const ENTITY_ARTICLES: Record<string, 'el' | 'la' | 'los' | 'las'> = {
  User: 'el',

  Tenant: 'la',

  PlatformUser: 'el',

  Role: 'la',

  AccessProfile: 'el',

  Subscription: 'la',

  Contact: 'el',

  Opportunity: 'la',

  Quote: 'la',

  Contract: 'el',

  Expediente: 'la',

  TaxRule: 'la',

  TaxCatalog: 'el',

  Bundle: 'el',

  Offer: 'la',

  Plan: 'el',

  Promotion: 'la',
};

export function entityArticle(entityType: string): string {
  if (ENTITY_ARTICLES[entityType]) return ENTITY_ARTICLES[entityType];

  const singular = entityType.replace(/s$/i, '');

  const pascal = singular.charAt(0).toUpperCase() + singular.slice(1);

  return ENTITY_ARTICLES[pascal] ?? 'el';
}
