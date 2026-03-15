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
