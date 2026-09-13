import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskResponsibleType,
  TaskRecipientType,
  TaskStatus,
  TaskTimelineEventType,
  TaskType,
} from '../../enums/tasks';
import { ListMeta } from '../../dto/pagination.dto';

/**
 * Contrato de API tipado de las tareas operativas — MOD11.
 *
 * Los nueve tipos viven aquí desde 2026-09-13 (spec
 * docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md §4.7.3,
 * aprobada por el CTO); antes estaban declarados localmente en
 * `apps/portal/src/lib/api-client.ts`. El api-client del portal los
 * re-exportará en F2, de modo que ningún consumidor cambie su import.
 *
 * Este archivo es la fuente de verdad del contrato v1. Un cambio posterior se
 * versiona y se notifica a AI-EM-ARCH, nunca se parchea en silencio
 * (protocolo multiagente §3bis regla 1).
 */

export interface OperationalTaskRecord {
  id: string;
  tenantId: string;
  taskNumber: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  description: string | null;
  originContext: TaskOriginContext;
  originRefId: string | null;
  ticketId: string | null;
  responsibleType: TaskResponsibleType;
  responsibleRefId: string;
  recipientType: TaskRecipientType;
  recipientRefId: string | null;
  recipientLabel: string | null;
  /**
   * Aditivo v1.x (MOD11 F1, spec §4.7.4): nombre legible del responsable,
   * resuelto por backend con un lookup batch por página. Opcional para no
   * romper consumidores v1: ausente o null cuando el responsable no es un
   * usuario resoluble. Finalidad ADR-067: nombre de usuario interno (no PII
   * de suscriptor); permite retirar el crawl de usuarios en F5.
   */
  responsibleLabel?: string | null;
  queueName: string | null;
  executionMode: TaskExecutionMode;
  dueAt: string | null;
  scheduledRequired: boolean;
  scheduleEventId: string | null;
  workOrderId: string | null;
  createdByUserId: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListOperationalTasksParams {
  status?: TaskStatus;
  type?: TaskType;
  responsibleRefId?: string;
  ticketId?: string;
  page?: number;
  limit?: number;
  /**
   * Nombre lógico de campo (ADR-065 §17). Aceptado por `ListTaskQuerySchema`;
   * mientras `meta.capabilities.sortableFields` esté vacío el servidor lo
   * ignora (conserva el orden por defecto y emite `meta.sort: null`) y
   * OpenAPI NO lo anuncia (ADR-065 §22-bis punto 3).
   */
  sortBy?: string;
  /** Dirección del orden (ADR-065 §17). Ignorado con lista blanca vacía. */
  sortDir?: 'asc' | 'desc';
}

export interface ListOperationalTasksResponse {
  data: OperationalTaskRecord[];
  /** Meta completa del envelope único de paginación (ADR-065 §10). */
  meta: ListMeta;
  /** @deprecated dual-emit Ola 1 — usar `meta.total` */
  total: number;
  /** @deprecated dual-emit Ola 1 — usar `meta.page` */
  page: number;
  /** @deprecated dual-emit Ola 1 — usar `meta.limit` */
  limit: number;
}

export interface CreateOperationalTaskDto {
  type: TaskType;
  priority?: TaskPriority;
  title: string;
  description?: string | null;
  originContext: TaskOriginContext;
  originRefId?: string | null;
  ticketId?: string | null;
  responsibleType: TaskResponsibleType;
  responsibleRefId: string;
  recipientType: TaskRecipientType;
  recipientRefId?: string | null;
  recipientLabel?: string | null;
  queueName?: string | null;
  executionMode: TaskExecutionMode;
  dueAt?: string | null;
  scheduledRequired: boolean;
}

export interface AssignOperationalTaskDto {
  responsibleType: TaskResponsibleType;
  responsibleRefId: string;
  reason?: string | null;
}

export interface UpdateOperationalTaskDto {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  recipientType?: TaskRecipientType;
  recipientRefId?: string | null;
  recipientLabel?: string | null;
  queueName?: string | null;
  dueAt?: string | null;
  scheduledRequired?: boolean;
}

export interface TransitionOperationalTaskDto {
  status: TaskStatus;
  notes?: string | null;
}

export interface OperationalTaskTimelineEvent {
  id: string;
  taskId: string;
  tenantId: string;
  eventType: TaskTimelineEventType;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  occurredAt: string;
}

export interface OperationalTaskAssignmentHistoryRecord {
  id: string;
  tenantId: string;
  taskId: string;
  previousResponsibleType: TaskResponsibleType;
  previousResponsibleRefId: string;
  newResponsibleType: TaskResponsibleType;
  newResponsibleRefId: string;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}
