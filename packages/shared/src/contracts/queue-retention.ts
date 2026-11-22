/**
 * Retención de trabajos BullMQ por familia (B(b), decisión de plat-ops del 2026-11-22). Fuente única:
 * los productores viven en `apps/api` y en `apps/worker`.
 *
 * `removeOnFail.age` no expira nada por sí solo: BullMQ recorta por edad solo cuando otro trabajo de
 * la misma cola termina fallido. Por eso el muestreador del worker aplica además
 * `QUEUE_FAILED_MAX_AGE_SECONDS` con `queue.clean` (sec-eng C-3), y el tablero no avisa con el
 * total de fallidos, sino con los de las últimas `QUEUE_FAILED_RECENT_WINDOW_MS`
 * (`PlatformQueueSnapshot.failedRecent`). Regla de
 * diseño: cada retención es ≥ 2 × la ventana, para que un fallo deje de avisar mucho antes de
 * desaparecer y siga visible mientras se diagnostica.
 *
 * Cubre (B(b), tabla de plat-ops):
 * - M: refresh-token-purge, tenant-schema-purge, evidence-orphan-detection,
 *   operations-execution-tombstone, schedule-events-sweep, crm-contract-media-sweep,
 *   platform-health-sampler y tenant-usage-sampler.
 * - N: search-index, evidence-analysis, assurance-field-service y crm-contract-pdf (generación).
 * - P: tenant-provisioning.
 *
 * Mantienen la suya, a propósito:
 * - Las colas de OT (operations-execution-events, -relay, -dlq, inventory-execution-requests,
 *   network-execution-events, billing-installation-events): 24 h o 30 días según el origen, más
 *   el `clean` periódico del relay.
 * - El re-render firmado de crm-contract-pdf (`removeOnFail: true`): el llamador espera con
 *   `waitUntilFinished` y un fallido retenido con su `jobId` determinista bloquearía el reintento.
 */

const DAY_SECONDS = 86_400;

/** Ventana de «fallidos recientes» del tablero: 72 h (§8.0 de la dirección, ratificada por prod-ux). */
export const QUEUE_FAILED_RECENT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * M · mantenimiento recurrente (barridos, purgas, muestreadores). La corrida siguiente reemplaza a
 * la fallida: 7 días cubren un fin de semana y una semana de diagnóstico.
 */
export const MAINTENANCE_JOB_RETENTION = {
  removeOnComplete: { count: 50 },
  removeOnFail: { age: 7 * DAY_SECONDS, count: 50 },
} as const;

/**
 * N · trabajo de negocio por evento (PDF, análisis, visita, índice de búsqueda). El resultado lo ve
 * el usuario y puede hacer falta reintentarlo a mano: 14 días. `removeOnComplete` no cambia.
 */
export const BUSINESS_JOB_REMOVE_ON_FAIL = { age: 14 * DAY_SECONDS, count: 1000 } as const;

/** P · puesta en marcha de empresas: poco volumen y mucho valor, 30 días (como la DLQ de OT). */
export const PROVISIONING_JOB_REMOVE_ON_FAIL = { age: 30 * DAY_SECONDS, count: 200 } as const;

/**
 * Edad máxima de un fallido por cola, en segundos (sec-eng C-3). `removeOnFail.age` solo recorta
 * cuando falla otro trabajo de la misma cola: el muestreador de salud del worker aplica además
 * `queue.clean(age, …, 'failed')` en cada vuelta, así la edad es una cota garantizada. Se aplica a
 * todas las colas con retención de familia (no solo a las de payload sensible): es la misma regla
 * para todas y evita que una cola tranquila conserve fallidos para siempre.
 *
 * `users-bulk-create` usa sus 24 h propias (el resultado lleva datos de usuarios). Las colas de
 * OT no están: su DLQ y su relay ya limpian con su propia retención.
 */
export const QUEUE_FAILED_MAX_AGE_SECONDS: Readonly<Record<string, number>> = {
  'refresh-token-purge': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'tenant-schema-purge': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'evidence-orphan-detection': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'operations-execution-tombstone': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'schedule-events-sweep': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'crm-contract-media-sweep': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'platform-health-sampler': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'tenant-usage-sampler': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'network-provisioning-reconcile': MAINTENANCE_JOB_RETENTION.removeOnFail.age,
  'search-index': BUSINESS_JOB_REMOVE_ON_FAIL.age,
  'evidence-analysis': BUSINESS_JOB_REMOVE_ON_FAIL.age,
  'assurance-field-service': BUSINESS_JOB_REMOVE_ON_FAIL.age,
  'crm-contract-pdf': BUSINESS_JOB_REMOVE_ON_FAIL.age,
  'crm-contract-events': BUSINESS_JOB_REMOVE_ON_FAIL.age,
  'migration-import': BUSINESS_JOB_REMOVE_ON_FAIL.age,
  'tenant-provisioning': PROVISIONING_JOB_REMOVE_ON_FAIL.age,
  'users-bulk-create': 24 * 60 * 60,
};
