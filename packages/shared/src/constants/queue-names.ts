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

/** Cola de alta masiva de usuarios de tenant (MOD04 Ola C / H-06) */
export const USERS_BULK_CREATE_QUEUE = 'users-bulk-create';

/** Eventos outbox tenant-aware de MOD11/MOD09/MOD12. */
export const OPERATIONS_EXECUTION_EVENTS_QUEUE = 'operations-execution-events';
export const OPERATIONS_EXECUTION_RELAY_QUEUE = 'operations-execution-relay';
export const OPERATIONS_EXECUTION_TOMBSTONE_QUEUE = 'operations-execution-tombstone';
export const OPERATIONS_EXECUTION_DLQ = 'operations-execution-dlq';

/** Solicitudes V2 firmadas de consumo de inventario emitidas por MOD11. */
export const INVENTORY_EXECUTION_REQUESTS_QUEUE = 'inventory-execution-requests';

/** Barrido periódico de eventos de agenda vencidos sin cierre (MOD09 F4.1). */
export const SCHEDULE_EVENTS_SWEEP_QUEUE = 'schedule-events-sweep';

/** Cola firmada para reaccionar al cierre, cancelación y anulación de OT de instalación. */
export const NETWORK_EXECUTION_EVENTS_QUEUE = 'network-execution-events';

/** Cierre firmado de OT de instalación para MOD14 (consumo al contrato, spec 2026-11-13 A). */
export const BILLING_INSTALLATION_EVENTS_QUEUE = 'billing-installation-events';

/** Cola de conciliación periódica de aprovisionamientos de red. */
export const NETWORK_PROVISIONING_RECONCILE_QUEUE = 'network-provisioning-reconcile';

/** Generación del PDF del contrato en el worker (cierre de venta, ADR-109 D5). Payload: ContractPdfJobPayload. */
export const CRM_CONTRACT_PDF_QUEUE = 'crm-contract-pdf';
export const CRM_CONTRACT_PDF_JOB_NAME = 'generate-contract-pdf';
/** Firma del contrato: re-render del PDF con la firma incrustada (bloque D). Payload: ContractSignedPdfJobPayload. */
export const CRM_CONTRACT_SIGNED_PDF_JOB_NAME = 'sign-contract-pdf';

/**
 * Eventos de contrato de CRM (ADR-109 D2/D6). Productor: outbox de MOD05
 * (`contract_activation_events`); consumidor: MOD14. Job name = eventType, jobId = eventId.
 */
export const CRM_CONTRACT_EVENTS_QUEUE = 'crm-contract-events';

/** Muestreador de salud de plataforma (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3). */
export const PLATFORM_HEALTH_SAMPLER_QUEUE = 'platform-health-sampler';

/** Muestreador de uso por empresa (ADR-114 D2, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4). */
export const TENANT_USAGE_SAMPLER_QUEUE = 'tenant-usage-sampler';

/**
 * Colas que registra el worker (F3-D5). Fuente única de `WorkerModule`, del
 * muestreador de salud (que reporta espera, fallidos y antigüedad de cada una) y
 * de los nombres visibles del Centro de control: la web los tipa como
 * `Record<WorkerQueueName, string>`, así que una cola nueva sin nombre visible
 * no compila.
 */
export const WORKER_QUEUE_NAMES = [
  TENANT_PROVISIONING_QUEUE,
  REFRESH_TOKEN_PURGE_QUEUE,
  TENANT_SCHEMA_PURGE_QUEUE,
  SEARCH_INDEX_QUEUE,
  ASSURANCE_FIELD_SERVICE_QUEUE,
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  OPERATIONS_EXECUTION_RELAY_QUEUE,
  OPERATIONS_EXECUTION_TOMBSTONE_QUEUE,
  OPERATIONS_EXECUTION_DLQ,
  NETWORK_EXECUTION_EVENTS_QUEUE,
  BILLING_INSTALLATION_EVENTS_QUEUE,
  // Las tres colas literales tienen su constante en el procesador del worker;
  // `apps/worker/src/worker-queues.ts` exige en compilación que coincidan.
  'evidence-orphan-detection',
  'evidence-analysis',
  SCHEDULE_EVENTS_SWEEP_QUEUE,
  // Cierre de venta (ADR-109 D5): PDF del contrato con Chromium, solo en el worker.
  CRM_CONTRACT_PDF_QUEUE,
  // SEC-1: barrido de objetos de contratos anonimizados y huérfanos.
  'crm-contract-media-sweep',
  PLATFORM_HEALTH_SAMPLER_QUEUE,
  TENANT_USAGE_SAMPLER_QUEUE,
] as const;

/** Nombre técnico de una cola del worker. */
export type WorkerQueueName = (typeof WORKER_QUEUE_NAMES)[number];

/**
 * Colas procesadas en `apps/api` (no las registra el worker). El tablero debe verlas igual
 * (decisión AI-EM-ARCH, 2026-11-22): el muestreador del worker las lee con su propia conexión.
 * Las constantes de las cuatro primeras viven aquí; las demás, en sus módulos del API, que
 * comprueban en compilación que el literal coincide (`apps/api/src/common/platform-api-queues.ts`).
 */
export const PLATFORM_API_QUEUE_NAMES = [
  USERS_BULK_CREATE_QUEUE,
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
  CRM_CONTRACT_EVENTS_QUEUE,
  'migration-import',
  'billing-generation',
  'billing-email-send',
  'crm-contract-signed-copy',
  'crm-contract-pending-signature-alerts',
  'privacy-due-alerts',
  'privacy-retention-expiry',
] as const;

/** Nombre técnico de una cola procesada en el API. */
export type PlatformApiQueueName = (typeof PLATFORM_API_QUEUE_NAMES)[number];

/**
 * Todas las colas BullMQ de la plataforma que muestrea el tablero: las del worker y las del API.
 * La web tipa sus nombres visibles como `Record<SampledQueueName, string>`.
 */
export const SAMPLED_QUEUE_NAMES = [...WORKER_QUEUE_NAMES, ...PLATFORM_API_QUEUE_NAMES] as const;

/** Nombre técnico de una cola muestreada por el tablero. */
export type SampledQueueName = (typeof SAMPLED_QUEUE_NAMES)[number];
