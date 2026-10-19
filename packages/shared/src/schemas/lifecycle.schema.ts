import { z } from 'zod';
import { SubscriberStatus } from '../enums/subscriber-status.enum';
import type { ListMeta } from '../dto/pagination.dto';

/** Motivos por acto aprobados en el PRD MOD05 Fase 05; el catálogo sigue provisional. */
export const LIFECYCLE_REASON_CODES_BY_ACTION = {
  suspend: [
    'MORA',
    'SOLICITUD_TITULAR',
    'USO_INDEBIDO',
    'ORDEN_AUTORIDAD',
    'FALLA_TECNICA_PROLONGADA',
  ],
  reactivate: [
    'PAGO_REGISTRADO',
    'FIN_SUSPENSION_SOLICITADA',
    'CORRECCION_OPERATIVA',
    'LEVANTAMIENTO_ORDEN',
  ],
  terminate: [
    'SOLICITUD_TITULAR',
    'MORA_PROLONGADA',
    'TRASLADO_SIN_COBERTURA',
    'USO_INDEBIDO',
    'DUPLICADO',
  ],
} as const;

/** Motivo reservado a cancelación automática desde el flujo del expediente. */
export const SYSTEM_ONLY_LIFECYCLE_REASON_CODES = ['DESCARTE_EXPEDIENTE'] as const;

export const LIFECYCLE_ACTIONS = ['SUSPEND', 'REACTIVATE', 'TERMINATE'] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export const LIFECYCLE_ERROR_CODES = [
  'SUBSCRIBER_STATUS_DERIVED',
  'SUBSCRIBER_CANCELLED',
  'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY',
  'SUBSCRIBER_HAS_LIVE_CONTRACTS',
  'IDEMPOTENCY_KEY_REUSED',
  'LIFECYCLE_CONTRACT_STATE_CHANGED',
  'LIFECYCLE_NO_CHANGES',
  'LIFECYCLE_SYSTEM_ONLY_REASON',
  'INVALID_IDEMPOTENCY_KEY',
] as const;
export type LifecycleErrorCode = (typeof LIFECYCLE_ERROR_CODES)[number];

const lifecycleContractIdsSchema = z
  .array(z.string().uuid())
  .min(1, 'Selecciona al menos un servicio')
  .refine((ids) => new Set(ids).size === ids.length, 'No repitas servicios');

const lifecycleCommandFields = {
  note: z.string().max(500).optional(),
};

/** Esquema base público: la validación específica por acto vive en cada endpoint. */
export const LifecycleCommandSchema = z
  .object({
    reasonCode: z.enum([
      ...LIFECYCLE_REASON_CODES_BY_ACTION.suspend,
      ...LIFECYCLE_REASON_CODES_BY_ACTION.reactivate,
      ...LIFECYCLE_REASON_CODES_BY_ACTION.terminate,
    ]),
    ...lifecycleCommandFields,
    contractIds: lifecycleContractIdsSchema.optional(),
  })
  .strict();

export const LifecycleSuspendCommandSchema = z
  .object({
    reasonCode: z.enum(LIFECYCLE_REASON_CODES_BY_ACTION.suspend),
    ...lifecycleCommandFields,
    contractIds: lifecycleContractIdsSchema.optional(),
  })
  .strict();

export const LifecycleReactivateCommandSchema = z
  .object({
    reasonCode: z.enum(LIFECYCLE_REASON_CODES_BY_ACTION.reactivate),
    ...lifecycleCommandFields,
    contractIds: lifecycleContractIdsSchema.optional(),
  })
  .strict();

export const LifecycleTerminateCommandSchema = z
  .object({
    reasonCode: z.enum(LIFECYCLE_REASON_CODES_BY_ACTION.terminate),
    ...lifecycleCommandFields,
    contractIds: lifecycleContractIdsSchema,
  })
  .strict();

/**
 * La ruta única de vista previa lleva un discriminante explícito; no es un
 * LifecycleCommand porque el contrato de comando no contiene `action`.
 */
export const LifecyclePreviewRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SUSPEND'), ...LifecycleSuspendCommandSchema.shape }).strict(),
  z.object({ action: z.literal('REACTIVATE'), ...LifecycleReactivateCommandSchema.shape }).strict(),
  z.object({ action: z.literal('TERMINATE'), ...LifecycleTerminateCommandSchema.shape }).strict(),
]);

const lifecycleContractStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']);
const lifecycleSubscriberStatusSchema = z.nativeEnum(SubscriberStatus);

export const LifecyclePreviewResponseSchema = z
  .object({
    action: z.enum(LIFECYCLE_ACTIONS),
    affectedContracts: z.array(
      z
        .object({
          id: z.string().uuid(),
          fromStatus: lifecycleContractStatusSchema,
          toStatus: lifecycleContractStatusSchema,
        })
        .strict(),
    ),
    subscriberStatus: z
      .object({
        from: lifecycleSubscriberStatusSchema,
        to: lifecycleSubscriberStatusSchema,
      })
      .strict(),
    hasLiveContracts: z.boolean(),
    warnings: z.array(
      z
        .object({
          code: z.enum(['EQUIPMENT_ON_LOAN', 'OPEN_WITHDRAWAL_ORDERS']),
          contractIds: z.array(z.string().uuid()),
        })
        .strict(),
    ),
  })
  .strict();

export type LifecycleCommand = z.infer<typeof LifecycleCommandSchema>;
export type LifecycleSuspendCommand = z.infer<typeof LifecycleSuspendCommandSchema>;
export type LifecycleReactivateCommand = z.infer<typeof LifecycleReactivateCommandSchema>;
export type LifecycleTerminateCommand = z.infer<typeof LifecycleTerminateCommandSchema>;
export type LifecyclePreviewRequest = z.infer<typeof LifecyclePreviewRequestSchema>;
export type LifecyclePreviewResponse = z.infer<typeof LifecyclePreviewResponseSchema>;

export interface LifecycleChangeRecord {
  id: string;
  entityType: 'SUBSCRIBER' | 'CONTRACT';
  entityId: string;
  fromStatus: string;
  toStatus: string;
  reasonCode: string;
  /** Solo se incluye cuando el actor dispone de CRM_SUBSCRIBERS_MANAGE. */
  note?: string | null;
  source: 'MANUAL' | 'SYSTEM' | 'BILLING';
  batchId: string;
  actorId: string | null;
  changedAt: string;
}

export interface LifecycleHistoryResponse {
  data: LifecycleChangeRecord[];
  meta: ListMeta;
}
