import { z } from 'zod';
import { BILLING_PAYMENT_METHODS } from '../billing/billing-constants';

/**
 * Importación por lotes desde UISP — contrato HTTP y de cola (ADR-110 D1, D2, D4, D9–D11;
 * spec 2026-11-10 v1.1 §1 y §3). Bloque B: lectura y simulación.
 *
 * Nada de este contrato transporta datos del titular: los informes son conteos por entidad y
 * motivo, y los valores pendientes de equivalencia son identificadores de catálogo de UISP.
 */

// ── Cola ────────────────────────────────────────────────────────────────────────────────
export const MIGRATION_IMPORT_QUEUE = 'migration-import';
export const MIGRATION_IMPORT_SIMULATE_JOB = 'simulate-batch';
export const MIGRATION_IMPORT_PURGE_SWEEP_JOB = 'purge-sweep';
export const MIGRATION_IMPORT_PURGE_TENANT_JOB = 'purge-tenant';
/** Bloque C: promoción idempotente del lote seguida de la conciliación (D3, D6). */
export const MIGRATION_IMPORT_PROMOTE_JOB = 'promote-batch';

/** Payload del job de simulación: solo identificadores (D9). */
export const MigrationSimulateJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: z.string().uuid(),
    batchId: z.string().uuid(),
  })
  .strict();
export type MigrationSimulateJob = z.infer<typeof MigrationSimulateJobSchema>;

/** Payload de la purga por tenant (D10): solo el tenant y la corrida. */
export const MigrationPurgeTenantJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: z.string().uuid(),
    runId: z.string().uuid(),
  })
  .strict();
export type MigrationPurgeTenantJob = z.infer<typeof MigrationPurgeTenantJobSchema>;

/** Payload de la promoción (D3, D9): solo identificadores; el actor queda en las filas creadas. */
export const MigrationPromoteJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: z.string().uuid(),
    batchId: z.string().uuid(),
    actorId: z.string().uuid(),
  })
  .strict();
export type MigrationPromoteJob = z.infer<typeof MigrationPromoteJobSchema>;

// ── Límites de subida ───────────────────────────────────────────────────────────────────
export const MIGRATION_IMPORT_LIMITS = {
  /** ZIP por cliente: tamaño comprimido máximo. */
  maxZipBytes: 25 * 1024 * 1024,
  /** ZIP por lote en una sola subida. */
  maxZipsPerBatch: 20,
  /** Entradas por ZIP. */
  maxEntriesPerZip: 2_000,
  /** Tamaño descomprimido máximo de una entrada. */
  maxEntryBytes: 50 * 1024 * 1024,
  /** Tamaño descomprimido máximo de un ZIP completo. */
  maxUncompressedBytesPerZip: 200 * 1024 * 1024,
  /** Razón máxima descomprimido/comprimido de una entrada mayor de 1 MiB. */
  maxCompressionRatio: 100,
  /** Días de retención del ZIP y de las intermedias (D10). */
  retentionDays: 30,
} as const;

// ── Catálogos ───────────────────────────────────────────────────────────────────────────
export const MIGRATION_BATCH_STATUSES = [
  'SIMULADO',
  'CARGADO',
  'PROMOVIDO',
  'CONCILIADO',
  'REVERTIDO',
] as const;
export type MigrationBatchStatus = (typeof MIGRATION_BATCH_STATUSES)[number];

export const MIGRATION_BATCH_SOURCES = ['UISP_ZIP'] as const;
export type MigrationBatchSource = (typeof MIGRATION_BATCH_SOURCES)[number];

/** Estado del procesamiento asíncrono de la simulación (vive en `counts.procesamiento`). */
export const MIGRATION_PROCESSING_STATES = ['PENDIENTE', 'COMPLETADO', 'FALLIDO'] as const;
export type MigrationProcessingState = (typeof MIGRATION_PROCESSING_STATES)[number];

export const MIGRATION_ENTITIES = [
  'SUSCRIPTOR',
  'CONTRATO',
  'DOCUMENTO_COBRO',
  'PAGO',
  'TICKET',
  'SOPORTE_DOCUMENTAL',
] as const;
export type MigrationEntity = (typeof MIGRATION_ENTITIES)[number];

/** Prefijo de `external_id` por entidad: `uisp:<prefijo>:<id>` (D3). */
export const MIGRATION_EXTERNAL_ID_PREFIX: Record<MigrationEntity, string> = {
  SUSCRIPTOR: 'client',
  CONTRATO: 'service',
  DOCUMENTO_COBRO: 'invoice',
  PAGO: 'payment',
  TICKET: 'ticket',
  SOPORTE_DOCUMENTAL: 'document',
};

/** Motivos de rechazo de un registro (código; nunca texto del titular). */
export const MIGRATION_REJECTION_REASONS = [
  'DATOS_INVALIDOS',
  'TITULAR_EXISTENTE',
  'TITULAR_ANONIMIZADO',
  'DEPENDE_DE_TITULAR_RECHAZADO',
  'PLAN_SIN_EQUIVALENCIA',
  'METODO_PAGO_SIN_EQUIVALENCIA',
  'CICLO_SIN_EQUIVALENCIA',
  'ETIQUETA_SIN_EQUIVALENCIA',
  'EXTERNAL_ID_DUPLICADO',
  /**
   * Promoción: falta un dato que CRM exige al titular (`chk_subscriber_person_fields`): natural
   * sin documento, nombres o estrato; jurídica sin NIT o razón social.
   */
  'DATOS_OBLIGATORIOS_AUSENTES',
  /** Promoción: el documento de cobro no tiene un contrato promovido al que asociarse. */
  'SIN_CONTRATO_ASOCIADO',
  /** Promoción: monto, fecha o renglones que MOD14 no admite. */
  'MONTO_O_FECHA_INVALIDOS',
  /** Promoción: el archivo del soporte o del PDF ya no está en el ZIP del lote. */
  'ARCHIVO_AUSENTE',
] as const;
export type MigrationRejectionReason = (typeof MIGRATION_REJECTION_REASONS)[number];

/** Observaciones que no rechazan el registro pero lo envían a una cola o dejan un pendiente. */
export const MIGRATION_OBSERVATIONS = [
  'DATOS_FISCALES_INCOMPLETOS',
  'COORDENADAS_FUERA_DE_COLOMBIA',
  'ESTRATO_PENDIENTE_EVIDENCIA',
  'TAREAS_SIN_FUENTE',
  'YA_IMPORTADO',
  'FACTURA_SIN_PDF',
] as const;
export type MigrationObservation = (typeof MIGRATION_OBSERVATIONS)[number];

/** Motivos por los que un ZIP completo no se pudo leer. */
export const MIGRATION_FILE_REJECTION_REASONS = [
  'ZIP_INVALIDO',
  'ZIP_DEMASIADO_GRANDE',
  'ZIP_DEMASIADAS_ENTRADAS',
  'ZIP_RUTA_NO_PERMITIDA',
  'ZIP_COMPRESION_SOSPECHOSA',
  'ZIP_ENLACE_SIMBOLICO',
  'CLIENTE_AUSENTE',
  'JSON_INVALIDO',
  'CLIENTE_REPETIDO',
] as const;
export type MigrationFileRejectionReason = (typeof MIGRATION_FILE_REJECTION_REASONS)[number];

export const MIGRATION_MAPPING_KINDS = ['PLAN', 'METODO_PAGO', 'CICLO', 'ETIQUETA'] as const;
export type MigrationMappingKind = (typeof MIGRATION_MAPPING_KINDS)[number];

export const MIGRATION_MAPPING_ACTIONS = ['EQUIVALE', 'DESCARTAR', 'NOTA'] as const;
export type MigrationMappingAction = (typeof MIGRATION_MAPPING_ACTIONS)[number];

export const MIGRATION_SOURCE_SYSTEMS = ['UISP'] as const;
export type MigrationSourceSystem = (typeof MIGRATION_SOURCE_SYSTEMS)[number];

export const MIGRATION_ERROR_CODES = [
  'MIGRATION_FILES_REQUIRED',
  'MIGRATION_TOO_MANY_FILES',
  'MIGRATION_FILE_TOO_LARGE',
  'MIGRATION_FILE_TYPE_NOT_ALLOWED',
  'MIGRATION_ZIP_REJECTED',
  'MIGRATION_ENQUEUE_FAILED',
  'MIGRATION_BATCH_NOT_FOUND',
  'MIGRATION_MAPPING_NOT_FOUND',
  'MIGRATION_MAPPING_DUPLICATED',
  'MIGRATION_MAPPING_TARGET_INVALID',
  'MIGRATION_BATCH_NOT_PROMOTABLE',
  'MIGRATION_BATCH_PURGED',
  'MIGRATION_BATCH_NOT_RECONCILABLE',
  'MIGRATION_BATCH_NOT_REVERTIBLE',
  'MIGRATION_REVERT_BLOCKED',
] as const;
export type MigrationErrorCode = (typeof MIGRATION_ERROR_CODES)[number];

// ── Informe del lote ────────────────────────────────────────────────────────────────────
const countSchema = z.number().int().min(0);

export const MigrationEntityCountsSchema = z
  .object({ leidos: countSchema, validos: countSchema, rechazados: countSchema })
  .strict();
export type MigrationEntityCounts = z.infer<typeof MigrationEntityCountsSchema>;

export const MigrationPendingValueSchema = z
  .object({
    kind: z.enum(MIGRATION_MAPPING_KINDS),
    externalValue: z.string().min(1).max(120),
    externalLabel: z.string().max(120).nullable(),
    occurrences: countSchema,
  })
  .strict();
export type MigrationPendingValue = z.infer<typeof MigrationPendingValueSchema>;

/**
 * Forma de `migration_batches.counts` (jsonb sin PII).
 *
 * Deuda Zod 4: `z.record(z.enum(...), ...)` pasa a exigir todas las claves del enum
 * (registro exhaustivo); al migrar, usar `z.partialRecord` para conservar la semántica parcial.
 */
export const MigrationBatchCountsSchema = z
  .object({
    procesamiento: z.enum(MIGRATION_PROCESSING_STATES),
    archivos: z
      .object({
        recibidos: countSchema,
        leidos: countSchema,
        rechazados: z.record(z.enum(MIGRATION_FILE_REJECTION_REASONS), countSchema),
      })
      .strict(),
    entidades: z.record(z.enum(MIGRATION_ENTITIES), MigrationEntityCountsSchema),
    observaciones: z.record(z.enum(MIGRATION_OBSERVATIONS), countSchema),
    tareasSinFuente: countSchema,
    pendientesEquivalencia: z.array(MigrationPendingValueSchema),
    procesadoEn: z.string().datetime().nullable(),
  })
  .strict();
export type MigrationBatchCounts = z.infer<typeof MigrationBatchCountsSchema>;

/** Forma de `migration_batches.rejections`: entidad → motivo → cantidad. */
export const MigrationBatchRejectionsSchema = z.record(
  z.enum(MIGRATION_ENTITIES),
  z.record(z.enum(MIGRATION_REJECTION_REASONS), countSchema),
);
export type MigrationBatchRejections = z.infer<typeof MigrationBatchRejectionsSchema>;

export const MigrationBatchSummarySchema = z
  .object({
    id: z.string().uuid(),
    source: z.enum(MIGRATION_BATCH_SOURCES),
    status: z.enum(MIGRATION_BATCH_STATUSES),
    processing: z.enum(MIGRATION_PROCESSING_STATES),
    /**
     * Procesamiento de la promoción (`promotion.procesamiento`): `PENDIENTE` en curso,
     * `COMPLETADO` o `FALLIDO`; `null` si el lote nunca se mandó a promover. La lista deja de
     * sondear un lote `CARGADO` con `FALLIDO`.
     */
    promotionProcessing: z.enum(MIGRATION_PROCESSING_STATES).nullable(),
    filesReceived: countSchema,
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime(),
    purgeAfter: z.string().datetime(),
    purgedAt: z.string().datetime().nullable(),
  })
  .strict();
export type MigrationBatchSummary = z.infer<typeof MigrationBatchSummarySchema>;

// ── Promoción, conciliación y reversión (bloque C: D3, D6, D7) ──────────────────────────
const moneySchema = z.string().regex(/^-?\d{1,12}\.\d{2}$/u);

/** Forma de `migration_batches.promotion` (jsonb sin PII). */
export const MigrationPromotionReportSchema = z
  .object({
    procesamiento: z.enum(MIGRATION_PROCESSING_STATES),
    /** Filas creadas por entidad. */
    promovidos: z.record(z.enum(MIGRATION_ENTITIES), countSchema),
    /** Ya existían por `external_id` (idempotencia): no se duplican. */
    existentes: z.record(z.enum(MIGRATION_ENTITIES), countSchema),
    /** Rechazos detectados al promover: entidad → motivo → cantidad. */
    rechazados: MigrationBatchRejectionsSchema,
    etiquetasAsignadas: countSchema,
    periodosSuspension: countSchema,
    aplicaciones: countSchema,
    iniciadoEn: z.string().datetime().nullable(),
    terminadoEn: z.string().datetime().nullable(),
  })
  .strict();
export type MigrationPromotionReport = z.infer<typeof MigrationPromotionReportSchema>;

const totalsSchema = z.object({ uisp: moneySchema, iwana: moneySchema }).strict();

/** Diferencia de un titular: identificadores y montos; nunca nombre ni documento. */
export const MigrationReconciliationDifferenceSchema = z
  .object({
    subscriberId: z.string().uuid(),
    externalId: z.string().max(160),
    facturado: totalsSchema,
    pagado: totalsSchema,
    saldo: totalsSchema,
  })
  .strict();
export type MigrationReconciliationDifference = z.infer<
  typeof MigrationReconciliationDifferenceSchema
>;

/** Forma de `migration_batches.reconciliation` (D6). */
export const MigrationReconciliationReportSchema = z
  .object({
    resultado: z.enum(['CONCILIADO', 'CON_DIFERENCIAS']),
    titulares: countSchema,
    conciliados: countSchema,
    diferencias: z.array(MigrationReconciliationDifferenceSchema),
    calculadoEn: z.string().datetime(),
  })
  .strict();
export type MigrationReconciliationReport = z.infer<typeof MigrationReconciliationReportSchema>;

/** Motivos por los que la reversión del lote se bloquea (D7). */
export const MIGRATION_REVERT_BLOCK_REASONS = [
  'PAGO_POSTERIOR',
  'APLICACION_POSTERIOR',
  'DOCUMENTO_POSTERIOR',
  'CONTRATO_POSTERIOR',
  'ORDEN_DE_TRABAJO',
  'TICKET_POSTERIOR',
  'SOPORTE_POSTERIOR',
  'ETIQUETA_POSTERIOR',
] as const;
export type MigrationRevertBlockReason = (typeof MIGRATION_REVERT_BLOCK_REASONS)[number];

export const MigrationRevertBlockerSchema = z
  .object({ motivo: z.enum(MIGRATION_REVERT_BLOCK_REASONS), cantidad: countSchema.min(1) })
  .strict();
export type MigrationRevertBlocker = z.infer<typeof MigrationRevertBlockerSchema>;

/** Resultado de la reversión: filas retiradas por entidad. */
export const MigrationRevertResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('REVERTIDO'),
    retirados: z.record(z.enum(MIGRATION_ENTITIES), countSchema),
    etiquetasRetiradas: countSchema,
  })
  .strict();
export type MigrationRevertResult = z.infer<typeof MigrationRevertResultSchema>;

export const MigrationBatchReportSchema = MigrationBatchSummarySchema.extend({
  counts: MigrationBatchCountsSchema,
  rejections: MigrationBatchRejectionsSchema,
  /** `null` hasta pedir la promoción. */
  promotion: MigrationPromotionReportSchema.nullable(),
  /** `null` hasta conciliar. */
  reconciliation: MigrationReconciliationReportSchema.nullable(),
}).strict();
export type MigrationBatchReport = z.infer<typeof MigrationBatchReportSchema>;

export const MigrationBatchListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type MigrationBatchListQuery = z.infer<typeof MigrationBatchListQuerySchema>;

// ── Equivalencias ───────────────────────────────────────────────────────────────────────
const externalValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\p{Cc}]+$/u, 'Valor externo con caracteres de control.');

const targetRefSchema = z.string().trim().min(1).max(80);

/** Plan y etiqueta: UUID; método de pago: `BILLING_PAYMENT_METHODS`; ciclo: día 1–28 (ADR-102). */
export const MIGRATION_MAPPING_TARGET_FORMAT: Record<MigrationMappingKind, RegExp> = {
  PLAN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
  ETIQUETA: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
  // Derivado del catálogo de Billing: un método nuevo no exige tocar este patrón.
  METODO_PAGO: new RegExp(`^(${BILLING_PAYMENT_METHODS.join('|')})$`, 'u'),
  CICLO: /^([1-9]|1\d|2[0-8])$/u,
};

export const MigrationMappingCreateSchema = z
  .object({
    kind: z.enum(MIGRATION_MAPPING_KINDS),
    externalValue: externalValueSchema,
    externalLabel: z.string().trim().min(1).max(120).nullable().optional(),
    action: z.enum(MIGRATION_MAPPING_ACTIONS),
    targetRef: targetRefSchema.nullable().optional(),
  })
  .strict();
export type MigrationMappingCreate = z.infer<typeof MigrationMappingCreateSchema>;

export const MigrationMappingUpdateSchema = z
  .object({
    externalLabel: z.string().trim().min(1).max(120).nullable().optional(),
    action: z.enum(MIGRATION_MAPPING_ACTIONS),
    targetRef: targetRefSchema.nullable().optional(),
  })
  .strict();
export type MigrationMappingUpdate = z.infer<typeof MigrationMappingUpdateSchema>;

export const MigrationMappingListQuerySchema = z
  .object({ kind: z.enum(MIGRATION_MAPPING_KINDS).optional() })
  .strict();
export type MigrationMappingListQuery = z.infer<typeof MigrationMappingListQuerySchema>;

export const MigrationMappingSchema = z
  .object({
    id: z.string().uuid(),
    sourceSystem: z.enum(MIGRATION_SOURCE_SYSTEMS),
    kind: z.enum(MIGRATION_MAPPING_KINDS),
    externalValue: z.string(),
    externalLabel: z.string().nullable(),
    action: z.enum(MIGRATION_MAPPING_ACTIONS),
    targetRef: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type MigrationMapping = z.infer<typeof MigrationMappingSchema>;

/**
 * Regla única de coherencia acción/tipo/destino (CHECK de la 194): solo las etiquetas admiten
 * `DESCARTAR` o `NOTA`; `EQUIVALE` exige destino con el formato del tipo; las demás no lo
 * admiten. Devuelve el código de error o `null`.
 */
export function migrationMappingTargetError(
  kind: MigrationMappingKind,
  action: MigrationMappingAction,
  targetRef: string | null | undefined,
): 'MIGRATION_MAPPING_TARGET_INVALID' | null {
  if (action !== 'EQUIVALE') {
    return kind === 'ETIQUETA' && !targetRef ? null : 'MIGRATION_MAPPING_TARGET_INVALID';
  }
  if (!targetRef || !MIGRATION_MAPPING_TARGET_FORMAT[kind].test(targetRef)) {
    return 'MIGRATION_MAPPING_TARGET_INVALID';
  }
  return null;
}

/** Respuesta 202 de `POST .../promote`: el lote queda `CARGADO` y el job encolado. */
export const MigrationPromoteAcceptedSchema = z
  .object({ id: z.string().uuid(), status: z.literal('CARGADO') })
  .strict();
export type MigrationPromoteAccepted = z.infer<typeof MigrationPromoteAcceptedSchema>;
