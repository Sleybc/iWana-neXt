'use strict';
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.ASSURANCE_FIELD_SERVICE_QUEUE =
  exports.SEARCH_INDEX_QUEUE =
  exports.TENANT_SCHEMA_PURGE_QUEUE =
  exports.REFRESH_TOKEN_PURGE_QUEUE =
  exports.TENANT_PROVISIONING_QUEUE =
    void 0;
/** Cola de provisioning de schemas PostgreSQL para nuevos tenants */
exports.TENANT_PROVISIONING_QUEUE = 'tenant-provisioning';
/** Cola de purga diaria de refresh tokens expirados */
exports.REFRESH_TOKEN_PURGE_QUEUE = 'refresh-token-purge';
/** Cola de purga fisica diferida de schemas de tenants marcados para eliminacion */
exports.TENANT_SCHEMA_PURGE_QUEUE = 'tenant-schema-purge';
/** Cola transversal para indexación de búsqueda global en Typesense */
exports.SEARCH_INDEX_QUEUE = 'search-index';
/** Cola de despacho a campo originada desde Service Assurance */
exports.ASSURANCE_FIELD_SERVICE_QUEUE = 'assurance-field-service';
//# sourceMappingURL=queue-names.js.map
