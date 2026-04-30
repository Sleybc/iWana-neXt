// Mapa de entityType a etiquetas legibles en español
const ENTITY_LABELS: Record<string, string> = {
  User: 'usuario',
  Tenant: 'empresa',
  PlatformUser: 'usuario de plataforma',
  Role: 'rol',
  Subscription: 'suscripción',
  Contact: 'contacto',
  Opportunity: 'oportunidad',
  Quote: 'cotización',
  Contract: 'contrato',
  Expediente: 'expediente',
  TaxRule: 'regla tributaria',
  TaxCatalog: 'catálogo tributario',
  Bundle: 'paquete',
  Offer: 'oferta',
  Plan: 'plan',
  Promotion: 'promoción',
};

/**
 * Retorna la etiqueta legible para un tipo de entidad.
 * Normaliza el input: maneja PascalCase, minúsculas y formas plurales
 * que el API puede enviar (User, user, users, Users → 'usuario').
 */
export function entityLabel(entityType: string): string {
  if (!entityType) return 'registro';

  // Búsqueda exacta primero
  if (ENTITY_LABELS[entityType]) return ENTITY_LABELS[entityType];

  // Normalizar a PascalCase singular para cubrir: 'users' → 'User', 'tenant' → 'Tenant'
  const singular = entityType.replace(/s$/i, '').replace(/_/g, ' ');
  const pascal = singular.charAt(0).toUpperCase() + singular.slice(1);
  if (ENTITY_LABELS[pascal]) return ENTITY_LABELS[pascal];

  // Fallback: limpiar formato
  return entityType.toLowerCase().replace(/_/g, ' ').replace(/s$/, '');
}

/**
 * Retorna el artículo determinado correcto para la entidad ('el' / 'la').
 * Necesario para construir frases en español gramaticalmente correctas.
 */
const ENTITY_ARTICLES: Record<string, 'el' | 'la' | 'los' | 'las'> = {
  User: 'el',
  Tenant: 'la',
  PlatformUser: 'el',
  Role: 'el',
  Subscription: 'la',
  Contact: 'el',
  Opportunity: 'la',
  Quote: 'la',
  Contract: 'el',
  Expediente: 'el',
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
