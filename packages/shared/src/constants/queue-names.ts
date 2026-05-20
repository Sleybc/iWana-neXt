/**
 * Nombres de colas BullMQ compartidos entre API (productor) y Worker (consumidor).
 *
 * Centralizados en @iwana/shared para evitar referencias cruzadas entre apps
 * y garantizar consistencia. Un typo en el nombre de la cola rompe silenciosamente
 * el flujo asincrono — esta constante es el single source of truth.
 *
 * Convencion de nombre: kebab-case, descriptivo, sin prefijo de entorno
 * (el entorno se maneja via BullMQ prefix, no en el nombre de la cola).
 */

/** Cola de provisioning de schemas PostgreSQL para nuevos tenants */
export const TENANT_PROVISIONING_QUEUE = 'tenant-provisioning';

/** Cola de purga diaria de refresh tokens expirados */
export const REFRESH_TOKEN_PURGE_QUEUE = 'refresh-token-purge';

/** Cola de purga fisica diferida de schemas de tenants marcados para eliminacion */
export const TENANT_SCHEMA_PURGE_QUEUE = 'tenant-schema-purge';

/** Cola transversal para indexación de búsqueda global en Typesense */
export const SEARCH_INDEX_QUEUE = 'search-index';

/** Cola de despacho a campo originada desde Service Assurance */
export const ASSURANCE_FIELD_SERVICE_QUEUE = 'assurance-field-service';
