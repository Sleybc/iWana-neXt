import type { BadgeProps } from '@iwana/ui';
import {
  formatFullName,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  UserRole,
} from '@iwana/shared';
import { EXECUTION_ORDER_NUMBER_PATTERN, type ExecutionOrderResult } from '@iwana/shared';
import type { AssuranceWorkQueue } from '@iwana/shared';
import type { AssuranceTimelineEvent, InternalUser } from '@/lib/api-client';
import { EXECUTION_ORDER_RESULT_LABELS } from '@/components/operations/operations-labels';
import { getSystemBaseRoleLabel } from '@/lib/system-vocabulary';

export type AssuranceBadgeVariant = NonNullable<BadgeProps['variant']>;

function formatEnumFallback(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLocaleLowerCase('es-CO');
  return normalized.charAt(0).toLocaleUpperCase('es-CO') + normalized.slice(1);
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
});

/** Valores por defecto que el panel muestra atenuados (spec MOD10 §3 C, §4). */
export const ASSURANCE_EMPTY_QUEUE_LABEL = 'Sin área';
export const ASSURANCE_UNLINKED_WORK_ORDER_LABEL = 'Sin vincular';
export const ASSURANCE_UNASSIGNED_LABEL = 'Sin asignar';
export const ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL = 'Responsable no disponible';
export const ASSURANCE_UNKNOWN_AUTHOR_LABEL = 'Usuario no disponible';

export const ASSURANCE_TICKET_TYPE_LABELS: Record<TicketType, string> = {
  [TicketType.CUSTOMER_INCIDENT]: 'Incidente de cliente',
  [TicketType.PQR]: 'PQR',
  [TicketType.QUESTION]: 'Consulta',
  [TicketType.SERVICE_REQUEST]: 'Solicitud de servicio',
  [TicketType.INTERNAL]: 'Caso interno',
  [TicketType.INTERNAL_SUPPORT]: 'Soporte interno',
  [TicketType.OPERATIONAL_TASK]: 'Tarea operativa',
  [TicketType.INQUIRY]: 'Información',
};

export const ASSURANCE_TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'Abierto',
  [TicketStatus.ASSIGNED]: 'Asignado',
  [TicketStatus.IN_PROGRESS]: 'En progreso',
  [TicketStatus.PENDING_CUSTOMER]: 'En espera del cliente',
  [TicketStatus.PENDING_INTERNAL]: 'En espera interna',
  [TicketStatus.FIELD_SERVICE_REQUESTED]: 'Visita técnica solicitada',
  [TicketStatus.RESOLVED]: 'Resuelto',
  [TicketStatus.CLOSED]: 'Cerrado',
  [TicketStatus.CANCELLED]: 'Cancelado',
};

export const ASSURANCE_TICKET_STATUS_VARIANTS: Record<TicketStatus, AssuranceBadgeVariant> = {
  [TicketStatus.OPEN]: 'neutral',
  [TicketStatus.ASSIGNED]: 'primary',
  [TicketStatus.IN_PROGRESS]: 'warning',
  [TicketStatus.PENDING_CUSTOMER]: 'info',
  [TicketStatus.PENDING_INTERNAL]: 'neutral',
  [TicketStatus.FIELD_SERVICE_REQUESTED]: 'warning',
  [TicketStatus.RESOLVED]: 'success',
  [TicketStatus.CLOSED]: 'success',
  [TicketStatus.CANCELLED]: 'error',
};

export const ASSURANCE_TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  [TicketPriority.LOW]: 'Baja',
  [TicketPriority.NORMAL]: 'Normal',
  [TicketPriority.HIGH]: 'Alta',
  [TicketPriority.URGENT]: 'Urgente',
  [TicketPriority.CRITICAL]: 'Crítica',
};

export const ASSURANCE_TICKET_PRIORITY_VARIANTS: Record<TicketPriority, AssuranceBadgeVariant> = {
  [TicketPriority.LOW]: 'neutral',
  [TicketPriority.NORMAL]: 'info',
  [TicketPriority.HIGH]: 'warning',
  [TicketPriority.URGENT]: 'error',
  [TicketPriority.CRITICAL]: 'error',
};

export const ASSURANCE_REQUESTER_TYPE_LABELS: Record<TicketRequesterType, string> = {
  [TicketRequesterType.SUBSCRIBER]: 'Suscriptor',
  [TicketRequesterType.INTERNAL_USER]: 'Usuario interno',
  [TicketRequesterType.EMPLOYEE]: 'Empleado',
  [TicketRequesterType.TECHNICIAN]: 'Técnico',
  [TicketRequesterType.CONTRACTOR]: 'Contratista',
  [TicketRequesterType.PARTNER]: 'Aliado',
  [TicketRequesterType.SYSTEM]: 'Sistema',
  [TicketRequesterType.EXTERNAL]: 'Externo',
  [TicketRequesterType.ANONYMOUS]: 'Anónimo',
};

export const ASSURANCE_SUBJECT_TYPE_LABELS: Record<TicketSubjectType, string> = {
  [TicketSubjectType.SUBSCRIBER]: 'Suscriptor',
  [TicketSubjectType.CONTRACT]: 'Contrato',
  [TicketSubjectType.SERVICE]: 'Servicio',
  [TicketSubjectType.NETWORK_NODE]: 'Nodo de red',
  [TicketSubjectType.DEVICE]: 'Dispositivo',
  [TicketSubjectType.WORK_ORDER]: 'Orden de trabajo',
  [TicketSubjectType.INTERNAL_AREA]: 'Área interna',
  [TicketSubjectType.GENERAL]: 'General',
  [TicketSubjectType.EXPEDIENTE]: 'Expediente',
};

export const ASSURANCE_QUEUE_LABELS: Record<TicketQueue, string> = {
  [TicketQueue.SUPPORT]: 'Soporte',
  // Mismo nombre de producto que el perfil de monitoreo (`system-vocabulary.ts`, spec MOD10 §4 v1.1).
  [TicketQueue.NOC]: getSystemBaseRoleLabel(UserRole.NOC),
  [TicketQueue.BILLING]: 'Facturación',
  [TicketQueue.OPERATIONS]: 'Operaciones',
  [TicketQueue.SALES]: 'Ventas',
  [TicketQueue.ADMIN]: 'Administración',
  [TicketQueue.IWANA_SUPPORT]: 'Soporte iWana',
};

export const ASSURANCE_SOURCE_LABELS: Record<TicketSource, string> = {
  [TicketSource.MANUAL]: 'Manual',
  [TicketSource.PORTAL]: 'Portal',
  [TicketSource.EMAIL]: 'Correo',
  [TicketSource.NMS]: 'Monitoreo de red',
  [TicketSource.WFM]: 'Programación',
  [TicketSource.MIGRATION]: 'Importación',
  [TicketSource.INTERNAL]: 'Interno',
};

export const ASSURANCE_FIELD_DECISION_LABELS: Record<TicketFieldDecision, string> = {
  [TicketFieldDecision.NOT_REQUIRED]: 'No requiere',
  [TicketFieldDecision.NEEDS_DIAGNOSIS]: 'Por definir tras diagnóstico',
  [TicketFieldDecision.FIELD_SERVICE_REQUIRED]: 'Requerida',
};

export const ASSURANCE_SLA_STATUS_LABELS: Record<SlaBreachStatus, string> = {
  [SlaBreachStatus.OK]: 'En tiempo',
  [SlaBreachStatus.AT_RISK]: 'En riesgo',
  [SlaBreachStatus.FIRST_RESPONSE_BREACHED]: 'Primera respuesta vencida',
  [SlaBreachStatus.RESOLUTION_BREACHED]: 'Resolución vencida',
};

export const ASSURANCE_SLA_STATUS_VARIANTS: Record<SlaBreachStatus, AssuranceBadgeVariant> = {
  [SlaBreachStatus.OK]: 'success',
  [SlaBreachStatus.AT_RISK]: 'warning',
  [SlaBreachStatus.FIRST_RESPONSE_BREACHED]: 'error',
  [SlaBreachStatus.RESOLUTION_BREACHED]: 'error',
};

export const ASSURANCE_TIMELINE_EVENT_LABELS: Record<TicketTimelineEventType, string> = {
  [TicketTimelineEventType.CREATED]: 'Ticket creado',
  [TicketTimelineEventType.ASSIGNED]: 'Asignación registrada',
  [TicketTimelineEventType.REASSIGNED]: 'Reasignación registrada',
  [TicketTimelineEventType.STATUS_CHANGED]: 'Estado actualizado',
  [TicketTimelineEventType.COMMENT_ADDED]: 'Comentario agregado',
  [TicketTimelineEventType.FIELD_SERVICE_REQUESTED]: 'Visita técnica solicitada',
  [TicketTimelineEventType.WORK_ORDER_LINKED]: 'Orden de trabajo vinculada',
  [TicketTimelineEventType.EXECUTION_ORDER_CLOSED]: 'Orden de trabajo cerrada',
  [TicketTimelineEventType.SLA_BREACHED]: 'Plazo de atención vencido',
  [TicketTimelineEventType.PQR_DEADLINE_SET]: 'Plazo de la PQR registrado',
  [TicketTimelineEventType.PRIORITY_CHANGED]: 'Prioridad actualizada',
  [TicketTimelineEventType.CLOSED]: 'Ticket cerrado',
};

export const ASSURANCE_TICKET_TYPE_OPTIONS = Object.entries(ASSURANCE_TICKET_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
export const ASSURANCE_TICKET_STATUS_OPTIONS = Object.entries(ASSURANCE_TICKET_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);
export const ASSURANCE_TICKET_PRIORITY_OPTIONS = Object.entries(
  ASSURANCE_TICKET_PRIORITY_LABELS,
).map(([value, label]) => ({ value, label }));
export const ASSURANCE_REQUESTER_TYPE_OPTIONS = Object.entries(ASSURANCE_REQUESTER_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
export const ASSURANCE_SUBJECT_TYPE_OPTIONS = Object.entries(ASSURANCE_SUBJECT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
export const ASSURANCE_QUEUE_OPTIONS = Object.entries(ASSURANCE_QUEUE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
export const ASSURANCE_SOURCE_OPTIONS = Object.entries(ASSURANCE_SOURCE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
export const ASSURANCE_FIELD_DECISION_OPTIONS = Object.entries(ASSURANCE_FIELD_DECISION_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const ASSURANCE_SLA_STATUS_OPTIONS = Object.entries(ASSURANCE_SLA_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Colas de trabajo de la bandeja (spec 2026-11-18 §3 B y J). Paso 2: cada cola es `workQueue` del
 * servidor (contrato `ASSURANCE_WORK_QUEUES`) y su conteo sale de `byWorkQueue` del resumen.
 */
export type AssuranceInboxQueue = AssuranceWorkQueue;

export interface AssuranceInboxQueueDefinition {
  value: AssuranceInboxQueue;
  label: string;
  /**
   * Filtros sueltos equivalentes, solo para reconocer la cola en un enlace entrante sin `queue`
   * (H10, CA-4). La cola ya no los escribe en la URL: escribe `queue`.
   */
  filters: { status?: TicketStatus; slaBreachStatus?: SlaBreachStatus };
}

export const ASSURANCE_INBOX_QUEUES: readonly AssuranceInboxQueueDefinition[] = [
  { value: 'mine', label: 'Míos', filters: {} },
  { value: 'dueSoon', label: 'Por vencer', filters: { slaBreachStatus: SlaBreachStatus.AT_RISK } },
  { value: 'breached', label: 'Vencidos', filters: {} },
  { value: 'unassigned', label: ASSURANCE_UNASSIGNED_LABEL, filters: {} },
  {
    value: 'waitingCustomer',
    label: 'Espera del cliente',
    filters: { status: TicketStatus.PENDING_CUSTOMER },
  },
  {
    value: 'fieldService',
    label: 'Visita técnica',
    filters: { status: TicketStatus.FIELD_SERVICE_REQUESTED },
  },
  { value: 'all', label: 'Todos', filters: {} },
];

/** Cola al entrar sin filtros (D2): «Todos» para quien administra; «Míos» para el resto. */
export function getAssuranceDefaultInboxQueue(role: string | null | undefined): 'mine' | 'all' {
  return role === UserRole.ADMIN ? 'all' : 'mine';
}

export function formatAssuranceDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return 'No disponible';
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatAssuranceDate(value: string | Date | null | undefined): string {
  if (!value) {
    return 'No disponible';
  }

  return dateFormatter.format(new Date(value));
}

export function formatAssuranceReference(value: string | null | undefined): string {
  if (!value?.trim()) {
    return 'No disponible';
  }

  return value.length === 36 ? value.slice(0, 8).toUpperCase() : value;
}

export function getAssuranceTicketTypeLabel(value: string): string {
  return ASSURANCE_TICKET_TYPE_LABELS[value as TicketType] ?? formatEnumFallback(value);
}

export function getAssuranceTicketStatusLabel(value: string): string {
  return ASSURANCE_TICKET_STATUS_LABELS[value as TicketStatus] ?? formatEnumFallback(value);
}

export function getAssuranceTicketStatusVariant(value: string): AssuranceBadgeVariant {
  return ASSURANCE_TICKET_STATUS_VARIANTS[value as TicketStatus] ?? 'neutral';
}

export function getAssuranceTicketPriorityLabel(value: string): string {
  return ASSURANCE_TICKET_PRIORITY_LABELS[value as TicketPriority] ?? formatEnumFallback(value);
}

export function getAssuranceTicketPriorityVariant(value: string): AssuranceBadgeVariant {
  return ASSURANCE_TICKET_PRIORITY_VARIANTS[value as TicketPriority] ?? 'neutral';
}

export function getAssuranceRequesterTypeLabel(value: string): string {
  return ASSURANCE_REQUESTER_TYPE_LABELS[value as TicketRequesterType] ?? formatEnumFallback(value);
}

export function getAssuranceSubjectTypeLabel(value: string): string {
  return ASSURANCE_SUBJECT_TYPE_LABELS[value as TicketSubjectType] ?? formatEnumFallback(value);
}

export function getAssuranceQueueLabel(value: string | null | undefined): string {
  if (!value) {
    return ASSURANCE_EMPTY_QUEUE_LABEL;
  }

  return ASSURANCE_QUEUE_LABELS[value as TicketQueue] ?? formatEnumFallback(value);
}

export function getAssuranceSourceLabel(value: string): string {
  return ASSURANCE_SOURCE_LABELS[value as TicketSource] ?? formatEnumFallback(value);
}

export function getAssuranceFieldDecisionLabel(value: string): string {
  return ASSURANCE_FIELD_DECISION_LABELS[value as TicketFieldDecision] ?? formatEnumFallback(value);
}

export function getAssuranceSlaStatusLabel(value: string): string {
  return ASSURANCE_SLA_STATUS_LABELS[value as SlaBreachStatus] ?? formatEnumFallback(value);
}

export function getAssuranceSlaStatusVariant(value: string): AssuranceBadgeVariant {
  return ASSURANCE_SLA_STATUS_VARIANTS[value as SlaBreachStatus] ?? 'neutral';
}

export function getAssuranceTimelineEventLabel(value: string): string {
  return (
    ASSURANCE_TIMELINE_EVENT_LABELS[value as TicketTimelineEventType] ?? formatEnumFallback(value)
  );
}

function formatAssuranceUserName(user: InternalUser): string {
  const fullName = formatFullName(user.firstName, user.lastName).trim();
  return fullName || user.email;
}

/**
 * Nombre del responsable. Sin usuario resuelto devuelve «Sin asignar» (spec MOD10 §4). Lo usan el
 * panel, la bandeja (`AssuranceTicketsTable`), el formulario de creación y la ficha
 * (`SubscriberTicketsSection`, `AssuranceClient`); fuera del panel y de la bandeja siempre recibe
 * un usuario, así que solo esas dos superficies heredan el rótulo nuevo.
 */
export function getAssuranceUserDisplayName(user: InternalUser | null | undefined): string {
  return user ? formatAssuranceUserName(user) : ASSURANCE_UNASSIGNED_LABEL;
}

/**
 * Responsable de un ticket según su referencia (spec MOD10 §4 v1.1): «Sin asignar» solo cuando
 * no hay responsable; con referencia pero sin el usuario en la lista cargada (p. ej. Soporte sin
 * gestión, que no carga la lista), «Responsable no disponible».
 */
export function getAssuranceAssigneeLabel(
  assignedUserId: string | null | undefined,
  user: InternalUser | null | undefined,
): string {
  if (!assignedUserId) return ASSURANCE_UNASSIGNED_LABEL;
  return user ? formatAssuranceUserName(user) : ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL;
}

/** Autor de un comentario: sin usuario resuelto, «Usuario no disponible» (spec MOD10 §4). */
export function getAssuranceAuthorDisplayName(user: InternalUser | null | undefined): string {
  return user ? formatAssuranceUserName(user) : ASSURANCE_UNKNOWN_AUTHOR_LABEL;
}

/** Resultado de la orden en el historial: rótulo de Operaciones, nunca el valor crudo. */
export function getAssuranceExecutionResultLabel(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Sin resultado';
  return EXECUTION_ORDER_RESULT_LABELS[value as ExecutionOrderResult] ?? formatEnumFallback(value);
}

export function getAssuranceTimelineDescription(
  event: AssuranceTimelineEvent,
  usersById: Map<string, InternalUser>,
): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.eventType) {
    case TicketTimelineEventType.STATUS_CHANGED:
      return `${getAssuranceTicketStatusLabel(String(payload.from ?? ''))} → ${getAssuranceTicketStatusLabel(String(payload.to ?? ''))}`;
    case TicketTimelineEventType.ASSIGNED:
    case TicketTimelineEventType.REASSIGNED: {
      const assignedUserId =
        typeof payload.assignedUserId === 'string' ? payload.assignedUserId : null;
      const assignedUser = assignedUserId ? usersById.get(assignedUserId) : null;
      return assignedUser
        ? `Responsable: ${getAssuranceUserDisplayName(assignedUser)}`
        : 'Responsable actualizado';
    }
    case TicketTimelineEventType.PRIORITY_CHANGED:
      return `Prioridad: ${getAssuranceTicketPriorityLabel(String(payload.previousPriority ?? ''))} → ${getAssuranceTicketPriorityLabel(String(payload.priority ?? ''))}`;
    case TicketTimelineEventType.FIELD_SERVICE_REQUESTED:
      return 'Se solicitó una visita técnica.';
    case TicketTimelineEventType.WORK_ORDER_LINKED: {
      // Dos formas (spec MOD10 D4): el vínculo de la orden de ejecución trae su número
      // (`executionOrderNumber`); el heredado, el identificador de la orden de programación.
      const executionOrderNumber =
        typeof payload.executionOrderNumber === 'string' &&
        EXECUTION_ORDER_NUMBER_PATTERN.test(payload.executionOrderNumber)
          ? payload.executionOrderNumber
          : null;
      if (executionOrderNumber) {
        return `Orden de trabajo ${executionOrderNumber} vinculada al caso.`;
      }
      return `Orden de trabajo ${formatAssuranceReference(typeof payload.workOrderId === 'string' ? payload.workOrderId : null)} vinculada al caso.`;
    }
    case TicketTimelineEventType.EXECUTION_ORDER_CLOSED:
      return `Orden de trabajo ${formatAssuranceReference(typeof payload.executionOrderId === 'string' ? payload.executionOrderId : null)} cerrada con resultado «${getAssuranceExecutionResultLabel(payload.result)}».`;
    case TicketTimelineEventType.COMMENT_ADDED:
      return payload.isInternal
        ? 'Comentario interno registrado.'
        : 'Comentario visible registrado.';
    case TicketTimelineEventType.CLOSED:
      return 'Caso cerrado en la mesa de ayuda.';
    case TicketTimelineEventType.CREATED:
      return 'Caso creado y disponible para operación.';
    case TicketTimelineEventType.SLA_BREACHED:
      return 'Se venció un plazo de atención de este caso.';
    case TicketTimelineEventType.PQR_DEADLINE_SET:
      return 'Se registró el control regulatorio inicial de la PQR.';
    default:
      return getAssuranceTimelineEventLabel(event.eventType);
  }
}
