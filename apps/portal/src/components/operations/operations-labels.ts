import type { BadgeProps } from '@iwana/ui';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskTimelineEventType,
  TaskType,
} from '@iwana/shared';

export type OperationsBadgeVariant = NonNullable<BadgeProps['variant']>;

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  [TaskType.CUSTOMER_SUPPORT]: 'Soporte al cliente',
  [TaskType.INTERNAL_OPERATION]: 'Operación interna',
  [TaskType.INSTALLATION]: 'Instalación',
  [TaskType.FIELD_VISIT]: 'Visita de campo',
  [TaskType.BACKOFFICE]: 'Backoffice',
  [TaskType.COLLECTION]: 'Cobranza',
  [TaskType.REVIEW]: 'Revisión',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.OPEN]: 'Abierta',
  [TaskStatus.READY]: 'Lista',
  [TaskStatus.SCHEDULED]: 'Programada',
  [TaskStatus.IN_PROGRESS]: 'En progreso',
  [TaskStatus.PENDING_EXTERNAL]: 'Pendiente externo',
  [TaskStatus.PENDING_INTERNAL]: 'Pendiente interno',
  [TaskStatus.BLOCKED]: 'Bloqueada',
  [TaskStatus.RESOLVED]: 'Resuelta',
  [TaskStatus.CANCELLED]: 'Cancelada',
};

export const TASK_STATUS_VARIANTS: Record<TaskStatus, OperationsBadgeVariant> = {
  [TaskStatus.OPEN]: 'neutral',
  [TaskStatus.READY]: 'info',
  [TaskStatus.SCHEDULED]: 'primary',
  [TaskStatus.IN_PROGRESS]: 'warning',
  [TaskStatus.PENDING_EXTERNAL]: 'lime',
  [TaskStatus.PENDING_INTERNAL]: 'lime',
  [TaskStatus.BLOCKED]: 'error',
  [TaskStatus.RESOLVED]: 'success',
  [TaskStatus.CANCELLED]: 'error',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Baja',
  [TaskPriority.NORMAL]: 'Normal',
  [TaskPriority.HIGH]: 'Alta',
  [TaskPriority.URGENT]: 'Urgente',
};

export const TASK_RECIPIENT_TYPE_LABELS: Record<TaskRecipientType, string> = {
  [TaskRecipientType.SUBSCRIBER]: 'Suscriptor',
  [TaskRecipientType.PROSPECT]: 'Prospecto',
  [TaskRecipientType.INTERNAL_USER]: 'Usuario interno',
  [TaskRecipientType.INTERNAL_AREA]: 'Área interna',
  [TaskRecipientType.CONTRACTOR]: 'Contratista',
  [TaskRecipientType.EXTERNAL_PARTY]: 'Tercero externo',
};

export const TASK_EXECUTION_MODE_LABELS: Record<TaskExecutionMode, string> = {
  [TaskExecutionMode.IMMEDIATE]: 'Inmediata',
  [TaskExecutionMode.DUE_DATE]: 'Con fecha límite',
  [TaskExecutionMode.SCHEDULED]: 'Programada',
  [TaskExecutionMode.FIELD_SERVICE]: 'Trabajo de campo',
};

export const TASK_ORIGIN_CONTEXT_LABELS: Record<TaskOriginContext, string> = {
  [TaskOriginContext.ASSURANCE]: 'Mesa de ayuda',
  [TaskOriginContext.CRM]: 'CRM',
  [TaskOriginContext.WFM]: 'Programación',
  [TaskOriginContext.BILLING]: 'Facturación',
  [TaskOriginContext.MANUAL]: 'Manual',
  [TaskOriginContext.SYSTEM]: 'Sistema',
};

export const TASK_TIMELINE_EVENT_LABELS: Record<TaskTimelineEventType, string> = {
  [TaskTimelineEventType.CREATED]: 'Creada',
  [TaskTimelineEventType.ASSIGNED]: 'Asignada',
  [TaskTimelineEventType.REASSIGNED]: 'Reasignada',
  [TaskTimelineEventType.STATUS_CHANGED]: 'Cambio de estado',
  [TaskTimelineEventType.SCHEDULE_LINKED]: 'Agenda vinculada',
  [TaskTimelineEventType.WORK_ORDER_LINKED]: 'OT vinculada',
  [TaskTimelineEventType.BLOCKED]: 'Bloqueada',
  [TaskTimelineEventType.RESOLVED]: 'Resuelta',
  [TaskTimelineEventType.CANCELLED]: 'Cancelada',
};

export function getTaskTypeLabel(value: TaskType): string {
  return TASK_TYPE_LABELS[value];
}

export function getTaskStatusLabel(value: TaskStatus): string {
  return TASK_STATUS_LABELS[value];
}

export function getTaskPriorityLabel(value: TaskPriority): string {
  return TASK_PRIORITY_LABELS[value];
}

export function formatTaskDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}
