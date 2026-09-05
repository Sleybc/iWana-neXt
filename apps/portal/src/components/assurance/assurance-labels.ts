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
} from '@iwana/shared';
import type { AssuranceTimelineEvent, InternalUser } from '@/lib/api-client';

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
  [TicketStatus.FIELD_SERVICE_REQUESTED]: 'Trabajo de campo solicitado',
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
  [TicketSubjectType.WORK_ORDER]: 'Work order',
  [TicketSubjectType.INTERNAL_AREA]: 'Área interna',
  [TicketSubjectType.GENERAL]: 'General',
  [TicketSubjectType.EXPEDIENTE]: 'Expediente',
};

export const ASSURANCE_QUEUE_LABELS: Record<TicketQueue, string> = {
  [TicketQueue.SUPPORT]: 'Soporte',
  [TicketQueue.NOC]: 'NOC',
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
  [TicketSource.NMS]: 'NMS',
  [TicketSource.WFM]: 'WFM',
  [TicketSource.MIGRATION]: 'Migración',
  [TicketSource.INTERNAL]: 'Interno',
};

export const ASSURANCE_FIELD_DECISION_LABELS: Record<TicketFieldDecision, string> = {
  [TicketFieldDecision.NOT_REQUIRED]: 'No requiere campo',
  [TicketFieldDecision.NEEDS_DIAGNOSIS]: 'Requiere diagnóstico',
  [TicketFieldDecision.FIELD_SERVICE_REQUIRED]: 'Requiere trabajo de campo',
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
  [TicketTimelineEventType.FIELD_SERVICE_REQUESTED]: 'Trabajo de campo solicitado',
  [TicketTimelineEventType.WORK_ORDER_LINKED]: 'Work order vinculada',
  [TicketTimelineEventType.EXECUTION_ORDER_CLOSED]: 'Orden de trabajo cerrada',
  [TicketTimelineEventType.SLA_BREACHED]: 'Incidencia SLA',
  [TicketTimelineEventType.PQR_DEADLINE_SET]: 'Deadline PQR registrada',
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
    return 'Sin cola';
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

export function getAssuranceUserDisplayName(user: InternalUser | null | undefined): string {
  if (!user) {
    return 'No asignado';
  }

  const fullName = formatFullName(user.firstName, user.lastName).trim();
  return fullName || user.email;
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
      return 'Se escaló el caso a trabajo de campo.';
    case TicketTimelineEventType.WORK_ORDER_LINKED:
      return `Work order ${formatAssuranceReference(typeof payload.workOrderId === 'string' ? payload.workOrderId : null)} vinculada al ticket.`;
    case TicketTimelineEventType.EXECUTION_ORDER_CLOSED:
      return `OT ${formatAssuranceReference(typeof payload.executionOrderId === 'string' ? payload.executionOrderId : null)} cerrada con resultado ${String(payload.result ?? 'sin resultado')}.`;
    case TicketTimelineEventType.COMMENT_ADDED:
      return payload.isInternal
        ? 'Comentario interno registrado.'
        : 'Comentario visible registrado.';
    case TicketTimelineEventType.CLOSED:
      return 'Caso cerrado en la mesa de ayuda.';
    case TicketTimelineEventType.CREATED:
      return 'Caso creado y disponible para operación.';
    case TicketTimelineEventType.SLA_BREACHED:
      return 'Se detectó un incumplimiento SLA para este ticket.';
    case TicketTimelineEventType.PQR_DEADLINE_SET:
      return 'Se registró el control regulatorio inicial de la PQR.';
    default:
      return getAssuranceTimelineEventLabel(event.eventType);
  }
}
