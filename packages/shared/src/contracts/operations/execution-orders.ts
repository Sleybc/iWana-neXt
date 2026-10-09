import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
} from '../../enums/operations';
import { InventoryDisposition } from '../../enums/inventory';
import { WfmWorkType, WorkOrderSourceContext } from '../../enums/wfm';
import { ListMeta } from '../../dto/pagination.dto';
import type { ExecutionOrderRequirementStatus } from './execution-orders-completion';
import { z } from 'zod';

/**
 * Contrato de API tipado congelado de MOD11 — OT de ejecución.
 *
 * Fuentes normativas:
 * - ADR-068: Sincronización de OT de ejecución y proyecciones operativas.
 * - Spec API: docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md
 *
 * Este archivo es la fuente de verdad del contrato v1.6. Los DTOs del controlador
 * y el OpenAPI máquina-legible se derivan de aquí. No modificar sin versionar.
 *
 * Historial:
 * - v1: congelado inicial.
 * - v1.1 (2026-09-14, E2 aprobada por el CTO, spec §7): `ExecutionOrderCompletionView`
 *   gana el campo opcional y aditivo `requirements` (tipo en el archivo hermano
 *   `execution-orders-completion.ts`). Ningún campo existente cambia ni pasa a requerido.
 * - v1.2 (2026-09-14, MOD11 T1 B1, ADR-088 + spec §4.3): la variante `MATERIAL` de
 *   `ExecutionOrderTemplateRequirement` gana el campo opcional y aditivo
 *   `finalDisposition` (disposición final exigida al consumo). Un requisito que no
 *   la declara se comporta exactamente como en v1.1. Ningún campo existente cambia
 *   ni pasa a requerido.
 * - v1.3 (2026-09-15, MOD11 E2, ADR-091 §D1/D5): `ExecutionOrderScheduleView`
 *   admite OT sin cita —`eventId` y `window` pasan a nulables—. Una OT en
 *   `CREATED` despachada sin ventana emite `eventId: null` y `window: null`;
 *   ningún lector debe asumirlos presentes. Nace `DispatchExecutionOrderCommand`
 *   / `DispatchExecutionOrderReceipt` (puerta de despacho, sin ventana).
 * - v1.4 (2026-09-15, MOD11 T2, ADR-090 §D3): la anulación por error viaja
 *   sobre `status = CANCELLED` + discriminador `annulled` (migración 136),
 *   sin estado terminal nuevo. Nacen `ExecutionOrderCancelledV1` y
 *   `ExecutionOrderAnnulledV1` (hechos de dominio; la cancelación ya no es
 *   silenciosa). Ningún campo existente cambia ni pasa a requerido.
 * - v1.5 (2026-10-06, MOD11 historial MATERIAL): `RegisterItemUsageCommand`
 *   acepta `requirementKey` opcional y `ExecutionOrderItemUsage` devuelve
 *   `requirementKey: string | null`. Los registros anteriores quedan nulos;
 *   no se les atribuye una clave retroactivamente.
 * - v1.6 (2026-10-06, MOD11 ↔ MOD12 consumo de OT): nace
 *   `InventoryConsumptionRequestedV2` con contexto completo, esquema Zod runtime
 *   y motivo tipado de rechazo. Los eventos V1 permanecen sin cambios.
 */

/** Acciones que el servidor puede ofrecer a la UI según política; no reemplazan la autorización. */
export type ExecutionOrderAllowedAction =
  | 'ASSIGN'
  | 'REASSIGN'
  | 'START'
  | 'REGISTER_ACTIVITY'
  | 'REGISTER_ITEM_USAGE'
  | 'REGISTER_EVIDENCE'
  | 'BLOCK'
  | 'UNBLOCK'
  | 'CLOSE'
  | 'CREATE_FOLLOW_UP'
  | 'OPEN';

export interface ExecutionOrderTemplateReference {
  id: string;
  key: string;
  version: number;
  label: string;
  /**
   * Requisitos congelados al crear la OT (snapshot inmutable, DATA-P1-3).
   * Aditivo v1.x: se omite cuando el snapshot no está disponible; el portal
   * no debe consultar el catálogo vivo de plantillas para operar la OT.
   */
  requirements?: ExecutionOrderTemplateRequirement[];
}

export interface ExecutionOrderScheduleView {
  /**
   * Vínculo de agenda, no identidad (ADR-091 §D1). Nulo en OT despachadas sin
   * cita (MOD11 E2): la ventana llega después (E3). Los lectores deben tolerar
   * el nulo y responder 200; E4 decide la presentación «sin ventana».
   */
  eventId: string | null;
  /** Ventana planificada; nula hasta que la OT se agenda (E3). */
  window: { startAt: string; endAt: string } | null;
  plannedResource?: { type: 'TECHNICIAN' | 'CREW'; id: string };
}

/**
 * Puerta de despacho (MOD11 E2, ADR-091 §D1): la OT nace de la necesidad —
 * origen explícito, tipo de trabajo y sitio obligatorio—, sin cita ni técnico.
 * Sin `scheduleEventId`, sin ventana y sin responsable: esos llegan después
 * (asignación supervisada, agenda E3). `originContext` es obligatorio y nunca
 * hereda el default `MANUAL`; `PROVISIONING` no tiene camino y se rechaza.
 */
export interface DispatchExecutionOrderCommand {
  originContext: WorkOrderSourceContext;
  originRefId?: string | null;
  workType: WfmWorkType;
  organizationSiteId: string;
  customerDisplayLabel: string;
  serviceAddress?: string | null;
  municipality?: string | null;
  sector?: string | null;
  workSummary: string;
  workInstructions?: string | null;
  ticketId?: string | null;
  taskId?: string | null;
  subscriberId?: string | null;
}

/** Recibo del despacho: la OT nace en `CREATED`, sin vínculo de agenda. */
export interface DispatchExecutionOrderReceipt {
  id: string;
  number: string;
  status: ExecutionOrderStatus;
  originContext: WorkOrderSourceContext;
  originRefId: string | null;
  workType: WfmWorkType;
  organizationSiteId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionOrderAssigneeView {
  type: 'TECHNICIAN' | 'CREW';
  id: string;
  displayLabel?: string;
}

export interface ExecutionOrderTemplateRequirementBase {
  key: string;
  label: string;
  required: boolean;
}

export type ExecutionOrderTemplateRequirement =
  | (ExecutionOrderTemplateRequirementBase & {
      kind: 'FIELD';
      fieldType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
      options?: string[];
    })
  | (ExecutionOrderTemplateRequirementBase & {
      kind: 'ACTIVITY';
      activityType: string;
    })
  | (ExecutionOrderTemplateRequirementBase & {
      kind: 'MEASUREMENT';
      measurement: 'NUMBER' | 'TEXT';
      unit?: string;
    })
  | (ExecutionOrderTemplateRequirementBase & {
      kind: 'EVIDENCE';
      evidenceType: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
    })
  | (ExecutionOrderTemplateRequirementBase & {
      kind: 'MATERIAL';
      itemCategory: string;
      /**
       * Disposición final exigida al consumo (aditivo v1.2, MOD11 T1 B1,
       * ADR-088 + spec §4.3). Opcional: cuando se declara, el consumo debe
       * coincidir además en `finalDisposition`; cuando se omite, el requisito
       * se comporta exactamente como en v1.1.
       */
      finalDisposition?: InventoryDisposition;
    })
  | (ExecutionOrderTemplateRequirementBase & {
      kind: 'COMPLIANCE';
      policyKey: string;
    });

export interface ExecutionOrderTemplateVersion {
  id: string;
  templateId: string;
  key: string;
  version: number;
  label: string;
  workType: WfmWorkType;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  effectiveFrom?: string;
  requirements: ExecutionOrderTemplateRequirement[];
  reasonCatalogs: string[];
  publishedAt?: string;
  retiredAt?: string;
}

export interface ExecutionOrderSiteView {
  id: string;
  label: string;
  address?: string;
}

export interface ExecutionOrderCompletionView {
  /** Porcentaje canónico calculado por backend sobre requisitos requeridos (0-100). */
  progress: number;
  /** Cantidad de requisitos requeridos satisfechos; no es un porcentaje. El backend siempre lo publica. */
  completed?: number;
  /** Cantidad total de requisitos requeridos; no es un porcentaje. El backend siempre lo publica. */
  total?: number;
  /**
   * Estado por requisito, publicado por `getCompletion` desde `evaluation.allEvaluations`.
   * Aditivo v1.1 (E2 aprobada, spec §7): opcional y retrocompatible — las OT sin
   * snapshot (legacy) lo omiten y ningún consumidor actual se rompe.
   */
  requirements?: ExecutionOrderRequirementStatus[];
  startedAt?: string;
  closedAt?: string;
}

export interface ExecutionOrderDetail {
  id: string;
  number: string;
  version: number;
  status: ExecutionOrderStatus;
  /**
   * Anulación por error (ADR-090 §D3, migración 136): `status = CANCELLED`
   * con `annulled = true` es un hecho distinto de la cancelación operativa.
   * La anulada sale de la bandeja, permanece consultable y se excluye del
   * cálculo de cancelación.
   */
  annulled: boolean;
  result?: ExecutionOrderResult;
  workType: WfmWorkType;
  template: ExecutionOrderTemplateReference | null;
  schedule: ExecutionOrderScheduleView;
  assignee?: ExecutionOrderAssigneeView;
  site: ExecutionOrderSiteView;
  completion: ExecutionOrderCompletionView;
  syncState: 'IN_SYNC' | 'PENDING' | 'DIVERGED' | 'FAILED';
  inventoryReconciliation: 'NOT_REQUIRED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'DIVERGED';
  allowedActions: ExecutionOrderAllowedAction[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignExecutionOrderCommand {
  assigneeType: 'TECHNICIAN' | 'CREW';
  assigneeId: string;
  reason?: string;
}

export interface StartExecutionOrderCommand {
  startedAt?: string;
  note?: string;
}

export interface RegisterActivityCommand {
  activityType: string;
  description: string;
  occurredAt?: string;
  measurements?: Array<{
    key: string;
    value: number | string | boolean;
    unit?: string;
  }>;
}

export interface UpdateActivityCommand {
  activityType?: string;
  description?: string;
}

export interface RegisterItemUsageCommand {
  itemId: string;
  quantity: number;
  /** Requisito MATERIAL del snapshot de la OT desde el que se registra. */
  requirementKey?: string;
  serialNumber?: string | null;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  /**
   * Semántica dual documentada (no cambiar sin decisión de arquitectura):
   * en MOD11 (validación de consumo, `assertCustodyAssignment`) es el ID del
   * usuario técnico/cuadrilla asignado a la OT; el worker MOD12 materializa
   * en el ledger el UUID de la ubicación móvil (stock_locations) asociada a
   * ese responsable. Ver informe de fase de custodia del ejecutor.
   */
  technicianCustodyId: string;
}

export interface RegisterEvidenceCommand {
  mediaAssetId: string;
  evidenceType: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  requirementKey: string;
  expiresAt: string;
  capturedAt?: string | null;
}

export interface BlockExecutionOrderCommand {
  reasonCode: string;
  note?: string;
}

export interface UnblockExecutionOrderCommand {
  resolutionCode: string;
  note?: string;
}

export interface CloseExecutionOrderCommand {
  result: ExecutionOrderResult;
  reasonCode?: string;
  summary: string;
  customerAcceptance?: {
    artifactId: string;
    method: 'SIGNATURE' | 'OTP' | 'OTHER';
  };
  followUp?: { reasonCode: string; dueAt?: string };
}

export interface ExecutionOrderError {
  code:
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VERSION_CONFLICT'
    | 'IDEMPOTENCY_CONFLICT'
    | 'IDEMPOTENCY_EXPIRED'
    | 'TRANSITION_CONFLICT'
    | 'INVENTORY_CONFLICT'
    | 'VALIDATION_ERROR'
    | 'CLOSURE_GATE_INCOMPLETE'
    | 'SERVICE_UNAVAILABLE';
  message: string;
  correlationId: string;
  /** Labels de producto en español; las claves técnicas no se publican. */
  missingRequirements?: string[];
}

export interface Page<T> {
  data: T[];
  meta: ListMeta;
}

export interface ExecutionOrderActivity {
  id: string;
  activityType: string;
  description: string;
  occurredAt?: string;
  actorRef: { type: 'USER' | 'SYSTEM'; id: string };
  measurements?: Array<{
    key: string;
    value: number | string | boolean;
    unit?: string;
  }>;
  createdAt: string;
}

export interface ExecutionOrderItemUsage {
  id: string;
  itemId: string;
  /** `null` identifica registros sin procedencia de requisito almacenada. */
  requirementKey: string | null;
  quantity: number;
  serial?: string;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  inventoryRequestId: string;
  movementStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  rejectionReasonCode?: InventoryConsumptionRejectionReasonCode | null;
  createdAt: string;
}

export interface ExecutionOrderEvidence {
  id: string;
  mediaAssetId: string;
  evidenceType: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  requirementKey: string;
  capturedAt: string | null;
  receivedAt: string;
  verifiedAt?: string;
  status: 'PENDING_ANALYSIS' | 'AVAILABLE' | 'REJECTED' | 'EXPIRED';
  assetStatus?:
    | 'PENDING'
    | 'PENDING_ANALYSIS'
    | 'AVAILABLE'
    | 'REJECTED'
    | 'EXPIRED'
    | 'CLAIM_FAILED'
    | null;
  createdAt: string;
}

export interface InventoryRequestReceipt {
  intentId: string;
  inventoryRequestId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  version: number;
}

export interface EvidenceAssetReceipt {
  intentId: string;
  mediaAssetId: string;
  status: 'PENDING_ANALYSIS' | 'AVAILABLE' | 'REJECTED' | 'EXPIRED';
  uploadedAt?: string;
  expiresAt?: string;
}

export interface FollowUpReceipt {
  intentId: string;
  resourceRef: string;
  status: 'ACCEPTED' | 'PENDING' | 'COMPLETED' | 'REJECTED';
  version: number;
}

/** Comando estricto para reencolar un evento OT desde la DLQ. */
export interface RedriveExecutionOrderEventCommand {
  /** Código operacional controlado por el consumidor de la DLQ. */
  causeCode: string;
  /** Referencia obligatoria al ticket operativo que autoriza la intervención. */
  ticketId: string;
}

export interface CreateExecutionOrderTemplateCommand {
  key: string;
  label: string;
  workType: WfmWorkType;
  requirements: ExecutionOrderTemplateRequirement[];
  reasonCatalogs?: string[];
}

/** Resumen de plantilla para catálogos y listados de administración. */
export interface ExecutionOrderTemplateSummary {
  id: string;
  key: string;
  label: string;
  workType: WfmWorkType;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateExecutionOrderTemplateVersionCommand {
  label: string;
  requirements: ExecutionOrderTemplateRequirement[];
  reasonCatalogs?: string[];
  effectiveFrom?: string;
}

export interface PublishExecutionOrderTemplateVersionCommand {
  versionId: string;
}

export interface RetireExecutionOrderTemplateVersionCommand {
  versionId: string;
}

export type OperationalEventTypeV1 =
  | 'VisitScheduledV1'
  | 'VisitWindowChangedV1'
  | 'VisitResourceChangedV1'
  | 'VisitCancelledV1'
  | 'ExecutionOrderStartedV1'
  | 'ExecutionOrderBlockedV1'
  | 'InventoryConsumptionRequestedV1'
  | 'InventoryConsumptionRequestedV2'
  | 'ExecutionOrderClosedV1'
  | 'ExecutionOrderCancelledV1'
  | 'ExecutionOrderAnnulledV1'
  | 'ExecutionOrderFollowUpRequiredV1'
  | 'InventoryMovementConfirmedV1'
  | 'InventoryMovementRejectedV1';

interface EventPayloadBase {
  executionOrderId: string;
  intentId?: string;
}

/** Agenda es owner de este evento; todavía no existe OT, por eso no lleva executionOrderId. */
export interface VisitScheduledV1 {
  eventId: string;
  windowStartAt: string;
  windowEndAt: string;
  resourceId?: string;
}

export interface VisitWindowChangedV1 extends EventPayloadBase {
  eventId: string;
  windowStartAt: string;
  windowEndAt: string;
}

export interface VisitResourceChangedV1 extends EventPayloadBase {
  eventId: string;
  resourceType: 'TECHNICIAN' | 'CREW';
  resourceId: string;
}

export interface VisitCancelledV1 extends EventPayloadBase {
  eventId: string;
  reasonCode: string;
}

export interface ExecutionOrderStartedV1 extends EventPayloadBase {
  startedAt: string;
}

export interface ExecutionOrderBlockedV1 extends EventPayloadBase {
  reasonCode: string;
}

export interface InventoryConsumptionRequestedV1 extends EventPayloadBase {
  inventoryRequestId: string;
  itemId: string;
  quantity: number;
  serial?: string;
}

/** Solicitud de consumo con contexto completo; V1 permanece congelado. */
export interface InventoryConsumptionRequestedV2 extends EventPayloadBase {
  eventId?: string;
  inventoryRequestId: string;
  itemId: string;
  quantity: number;
  serial?: string;
  /** ID del usuario técnico; MOD12 lo resuelve a su ubicación móvil activa por `responsibleRefId`. */
  technicianCustodyId: string;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  subscriberId: string | null;
  actorUserId: string;
}

export interface ExecutionOrderClosedV1 extends EventPayloadBase {
  result: ExecutionOrderResult;
  closedAt: string;
}

/**
 * La cancelación deja constancia como hecho de dominio (MOD11 T2, CA-13).
 * Antes era silenciosa: `cancelFromSchedulingWithManager` mutaba sin evento.
 */
export interface ExecutionOrderCancelledV1 extends EventPayloadBase {
  reason: string;
}

/**
 * La anulación por error es hecho distinto de la cancelación (ADR-090 §D3):
 * la OT no debió existir. Viaja con su motivo; el discriminador vive en la
 * fila (`is_annulled`, migración 136), no en el tipo de evento.
 */
export interface ExecutionOrderAnnulledV1 extends EventPayloadBase {
  reason: string;
}

export interface ExecutionOrderFollowUpRequiredV1 extends EventPayloadBase {
  followUpId: string;
  reasonCode: string;
}

export interface InventoryMovementConfirmedV1 extends EventPayloadBase {
  inventoryRequestId: string;
  stockMovementId: string;
}

export interface InventoryMovementRejectedV1 extends EventPayloadBase {
  inventoryRequestId: string;
  reasonCode: InventoryConsumptionRejectionReasonCode;
}

export const INVENTORY_CONSUMPTION_REJECTION_REASON_CODES = [
  'CUSTODY_INSUFFICIENT',
  'SERIAL_NOT_IN_CUSTODY',
  'SUBSCRIBER_REQUIRED',
  'ITEM_INACTIVE',
] as const;

export type InventoryConsumptionRejectionReasonCode =
  (typeof INVENTORY_CONSUMPTION_REJECTION_REASON_CODES)[number];

/** Payload validado en runtime al cruzar el límite Redis/API. */
export const InventoryConsumptionRequestedV2Schema = z
  .object({
    executionOrderId: z.string().uuid(),
    eventId: z.string().uuid().optional(),
    intentId: z.string().optional(),
    inventoryRequestId: z.string().uuid(),
    itemId: z.string().trim().min(1).max(160),
    quantity: z.number().finite().positive(),
    serial: z.string().trim().min(1).max(160).optional(),
    technicianCustodyId: z.string().trim().min(1).max(160),
    action: z.nativeEnum(ExecutionOrderItemAction),
    finalDisposition: z.nativeEnum(InventoryDisposition),
    subscriberId: z.string().trim().min(1).max(160).nullable(),
    actorUserId: z.string().uuid(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.serial !== undefined && payload.quantity !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Una solicitud con serial debe tener cantidad 1.',
      });
    }

    if (
      payload.finalDisposition !== InventoryDisposition.INSTALLED_AT_CUSTOMER &&
      payload.subscriberId !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subscriberId'],
        message: 'subscriberId solo corresponde a una instalación en cliente.',
      });
    }
  });

/** Envelope V2 validado antes de seleccionar tenant o invocar el ledger. */
export const InventoryConsumptionRequestedV2EnvelopeSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: z.literal('InventoryConsumptionRequestedV2'),
    tenantId: z.string().uuid(),
    aggregateId: z.string().uuid(),
    aggregateVersion: z.number().int().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    correlationId: z.string().uuid(),
    payload: InventoryConsumptionRequestedV2Schema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.aggregateId !== envelope.payload.executionOrderId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aggregateId'],
        message: 'aggregateId debe coincidir con executionOrderId.',
      });
    }
    if (envelope.payload.eventId !== undefined && envelope.payload.eventId !== envelope.eventId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'eventId'],
        message: 'El eventId del payload debe coincidir con el envelope.',
      });
    }
  });

/** Job interno firmado que cruza Redis; el HMAC cubre tenantId y envelope. */
export const SignedInventoryExecutionRequestSchema = z
  .object({
    tenantId: z.string().uuid(),
    envelope: InventoryConsumptionRequestedV2EnvelopeSchema,
    signature: z.string().regex(/^[a-f0-9]{64}$/iu),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.tenantId !== job.envelope.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenantId'],
        message: 'tenantId externo debe coincidir con el del envelope.',
      });
    }
  });

export type SignedInventoryExecutionRequest = z.infer<typeof SignedInventoryExecutionRequestSchema>;

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, sortJsonKeys(item)]),
    );
  }
  return value;
}

/** Canonical JSON compartido por el firmante worker y el verificador API. */
export function canonicalizeInventoryExecutionRequest(
  tenantId: unknown,
  envelope: unknown,
): string {
  return JSON.stringify(sortJsonKeys({ tenantId, envelope }));
}

export type OperationalEventPayloadV1 =
  | VisitScheduledV1
  | VisitWindowChangedV1
  | VisitResourceChangedV1
  | VisitCancelledV1
  | ExecutionOrderStartedV1
  | ExecutionOrderBlockedV1
  | InventoryConsumptionRequestedV1
  | InventoryConsumptionRequestedV2
  | ExecutionOrderClosedV1
  | ExecutionOrderCancelledV1
  | ExecutionOrderAnnulledV1
  | ExecutionOrderFollowUpRequiredV1
  | InventoryMovementConfirmedV1
  | InventoryMovementRejectedV1;

interface OperationalEventPayloadByType {
  VisitScheduledV1: VisitScheduledV1;
  VisitWindowChangedV1: VisitWindowChangedV1;
  VisitResourceChangedV1: VisitResourceChangedV1;
  VisitCancelledV1: VisitCancelledV1;
  ExecutionOrderStartedV1: ExecutionOrderStartedV1;
  ExecutionOrderBlockedV1: ExecutionOrderBlockedV1;
  InventoryConsumptionRequestedV1: InventoryConsumptionRequestedV1;
  InventoryConsumptionRequestedV2: InventoryConsumptionRequestedV2;
  ExecutionOrderClosedV1: ExecutionOrderClosedV1;
  ExecutionOrderCancelledV1: ExecutionOrderCancelledV1;
  ExecutionOrderAnnulledV1: ExecutionOrderAnnulledV1;
  ExecutionOrderFollowUpRequiredV1: ExecutionOrderFollowUpRequiredV1;
  InventoryMovementConfirmedV1: InventoryMovementConfirmedV1;
  InventoryMovementRejectedV1: InventoryMovementRejectedV1;
}

export type OperationalEventEnvelopeV1 = {
  [K in OperationalEventTypeV1]: {
    eventId: string;
    eventType: K;
    tenantId: string;
    aggregateId: string;
    aggregateVersion: number;
    occurredAt: string;
    correlationId: string;
    payload: OperationalEventPayloadByType[K];
  };
}[OperationalEventTypeV1];
