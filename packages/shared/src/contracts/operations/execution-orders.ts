import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
} from '../../enums/operations';
import { InventoryDisposition } from '../../enums/inventory';
import { WfmWorkType } from '../../enums/wfm';
import { ListMeta } from '../../dto/pagination.dto';

/**
 * Contrato de API tipado congelado de MOD11 — OT de ejecución.
 *
 * Fuentes normativas:
 * - ADR-068: Sincronización de OT de ejecución y proyecciones operativas.
 * - Spec API: docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md
 *
 * Este archivo es la fuente de verdad del contrato v1. Los DTOs del controlador
 * y el OpenAPI máquina-legible se derivan de aquí. No modificar sin versionar.
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
  eventId: string;
  window: { startAt: string; endAt: string };
  plannedResource?: { type: 'TECHNICIAN' | 'CREW'; id: string };
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
  startedAt?: string;
  closedAt?: string;
}

export interface ExecutionOrderDetail {
  id: string;
  number: string;
  version: number;
  status: ExecutionOrderStatus;
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
  quantity: number;
  serial?: string;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  inventoryRequestId: string;
  movementStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED';
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
  | 'ExecutionOrderClosedV1'
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

export interface ExecutionOrderClosedV1 extends EventPayloadBase {
  result: ExecutionOrderResult;
  closedAt: string;
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
  reasonCode: string;
}

export type OperationalEventPayloadV1 =
  | VisitScheduledV1
  | VisitWindowChangedV1
  | VisitResourceChangedV1
  | VisitCancelledV1
  | ExecutionOrderStartedV1
  | ExecutionOrderBlockedV1
  | InventoryConsumptionRequestedV1
  | ExecutionOrderClosedV1
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
  ExecutionOrderClosedV1: ExecutionOrderClosedV1;
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
