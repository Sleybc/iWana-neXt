import type { BadgeProps } from '@iwana/ui';
import {
  ScheduleEventStatus,
  TechnicianAvailabilityType,
  UserRole,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WorkOrderStatus,
} from '@iwana/shared';
import type {
  InternalUser,
  WfmDashboardSummary,
  WfmScheduleEvent,
  WfmTechnicianAvailability,
  WfmWorkOrder,
} from '@/lib/api-client';
import { formatExpedienteDisplayRef, formatExpedienteShortLabel } from '@/lib/expediente-labels';
import { getPortalUserRoleLabel } from '@/lib/user-labels';

export type SchedulingView = 'command-center' | 'calendar' | 'list';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export interface SchedulingFilters {
  fromDate: string;
  toDate: string;
  technicianId: string;
  type: '' | WfmWorkType;
  status: '' | ScheduleEventStatus;
  view: SchedulingView;
}

export interface SchedulingCalendarDay {
  key: string;
  date: Date;
  label: string;
  shortLabel: string;
  events: WfmScheduleEvent[];
}

export interface SchedulingTimelineGroup {
  technicianId: string;
  technicianName: string;
  events: WfmScheduleEvent[];
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dayFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortDayFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
});

const workTypeMeta: Record<
  WfmWorkType,
  { label: string; description: string; badgeVariant: BadgeVariant }
> = {
  [WfmWorkType.INSTALLATION]: {
    label: 'Instalación',
    description: 'Alta técnica y activación de servicio.',
    badgeVariant: 'primary',
  },
  [WfmWorkType.SUPPORT]: {
    label: 'Soporte',
    description: 'Atención correctiva o diagnóstico puntual.',
    badgeVariant: 'warning',
  },
  [WfmWorkType.TECHNICAL_VISIT]: {
    label: 'Visita técnica',
    description: 'Inspección, validación o visita operativa.',
    badgeVariant: 'info',
  },
  [WfmWorkType.RETIREMENT]: {
    label: 'Retiro',
    description: 'Desinstalación o recuperación de servicio.',
    badgeVariant: 'error',
  },
  [WfmWorkType.MAINTENANCE]: {
    label: 'Mantenimiento',
    description: 'Trabajo preventivo o programado.',
    badgeVariant: 'lime',
  },
};

const eventStatusMeta: Record<
  ScheduleEventStatus,
  { label: string; description: string; badgeVariant: BadgeVariant }
> = {
  [ScheduleEventStatus.DRAFT]: {
    label: 'Borrador',
    description: 'Evento creado pendiente de confirmación operativa.',
    badgeVariant: 'neutral',
  },
  [ScheduleEventStatus.SCHEDULED]: {
    label: 'Programado',
    description: 'Evento confirmado y reservado en agenda.',
    badgeVariant: 'primary',
  },
  [ScheduleEventStatus.EN_ROUTE]: {
    label: 'En ruta',
    description: 'Técnico desplazándose al punto de servicio.',
    badgeVariant: 'info',
  },
  [ScheduleEventStatus.IN_PROGRESS]: {
    label: 'En progreso',
    description: 'Atención técnica en ejecución.',
    badgeVariant: 'warning',
  },
  [ScheduleEventStatus.COMPLETED]: {
    label: 'Completado',
    description: 'Trabajo finalizado correctamente.',
    badgeVariant: 'success',
  },
  [ScheduleEventStatus.CANCELLED]: {
    label: 'Cancelado',
    description: 'Evento retirado de la agenda operativa.',
    badgeVariant: 'error',
  },
  [ScheduleEventStatus.RESCHEDULED]: {
    label: 'Reagendado',
    description: 'Evento movido a una nueva franja horaria.',
    badgeVariant: 'lime',
  },
  [ScheduleEventStatus.NO_SHOW]: {
    label: 'Sin atención',
    description: 'No se logró ejecutar la visita programada.',
    badgeVariant: 'error',
  },
};

const workOrderStatusMeta: Record<
  WorkOrderStatus,
  { label: string; description: string; badgeVariant: BadgeVariant }
> = {
  [WorkOrderStatus.OPEN]: {
    label: 'Abierta',
    description: 'Orden operativa pendiente de toma.',
    badgeVariant: 'neutral',
  },
  [WorkOrderStatus.ASSIGNED]: {
    label: 'Asignada',
    description: 'Orden asignada al técnico responsable.',
    badgeVariant: 'primary',
  },
  [WorkOrderStatus.IN_PROGRESS]: {
    label: 'En progreso',
    description: 'Orden ejecutándose actualmente.',
    badgeVariant: 'warning',
  },
  [WorkOrderStatus.DONE]: {
    label: 'Cerrada',
    description: 'Orden completada.',
    badgeVariant: 'success',
  },
  [WorkOrderStatus.CANCELLED]: {
    label: 'Cancelada',
    description: 'Orden detenida o descartada.',
    badgeVariant: 'error',
  },
};

const workOrderPriorityMeta: Record<
  WorkOrderPriority,
  { label: string; badgeVariant: BadgeVariant }
> = {
  [WorkOrderPriority.LOW]: { label: 'Baja', badgeVariant: 'neutral' },
  [WorkOrderPriority.NORMAL]: { label: 'Normal', badgeVariant: 'info' },
  [WorkOrderPriority.HIGH]: { label: 'Alta', badgeVariant: 'warning' },
  [WorkOrderPriority.URGENT]: { label: 'Urgente', badgeVariant: 'error' },
};

const sourceContextLabels: Record<WorkOrderSourceContext, string> = {
  [WorkOrderSourceContext.CRM]: 'CRM',
  [WorkOrderSourceContext.ASSURANCE]: 'Aseguramiento',
  [WorkOrderSourceContext.PROVISIONING]: 'Provisionamiento',
  [WorkOrderSourceContext.MANUAL]: 'Manual',
};

const availabilityMeta: Record<
  TechnicianAvailabilityType,
  { label: string; badgeVariant: BadgeVariant }
> = {
  [TechnicianAvailabilityType.AVAILABLE]: { label: 'Disponible', badgeVariant: 'success' },
  [TechnicianAvailabilityType.BLOCKED]: { label: 'Bloqueado', badgeVariant: 'warning' },
  [TechnicianAvailabilityType.TIME_OFF]: { label: 'Fuera de turno', badgeVariant: 'error' },
};

const SCHEDULING_VIEW_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
]);

const SCHEDULING_MANAGE_ROLES = new Set<string>([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT]);

const SCHEDULING_COMMAND_CENTER_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
]);

export const SCHEDULE_EVENT_STATUS_OPTIONS: SelectOption<ScheduleEventStatus>[] = Object.entries(
  eventStatusMeta,
).map(([value, meta]) => ({ value: value as ScheduleEventStatus, label: meta.label }));

export const WFM_WORK_TYPE_OPTIONS: SelectOption<WfmWorkType>[] = Object.entries(workTypeMeta).map(
  ([value, meta]) => ({ value: value as WfmWorkType, label: meta.label }),
);

export const WORK_ORDER_STATUS_OPTIONS: SelectOption<WorkOrderStatus>[] = Object.entries(
  workOrderStatusMeta,
).map(([value, meta]) => ({ value: value as WorkOrderStatus, label: meta.label }));

export const WORK_ORDER_PRIORITY_OPTIONS: SelectOption<WorkOrderPriority>[] = Object.entries(
  workOrderPriorityMeta,
).map(([value, meta]) => ({ value: value as WorkOrderPriority, label: meta.label }));

export const WORK_ORDER_SOURCE_CONTEXT_OPTIONS: SelectOption<WorkOrderSourceContext>[] =
  Object.entries(sourceContextLabels).map(([value, label]) => ({
    value: value as WorkOrderSourceContext,
    label,
  }));

export const TECHNICIAN_AVAILABILITY_OPTIONS: SelectOption<TechnicianAvailabilityType>[] =
  Object.entries(availabilityMeta).map(([value, meta]) => ({
    value: value as TechnicianAvailabilityType,
    label: meta.label,
  }));

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatWfmDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return 'No disponible';
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatWfmTime(value: string | Date | null | undefined): string {
  if (!value) {
    return 'No disponible';
  }

  return timeFormatter.format(new Date(value));
}

export function formatWfmDateRange(start: string | Date, end: string | Date): string {
  return `${formatWfmDateTime(start)} · ${formatWfmTime(end)}`;
}

export function formatWfmDayLabel(value: string | Date): string {
  return dayFormatter.format(new Date(value));
}

export function formatShortWfmDayLabel(value: string | Date): string {
  return shortDayFormatter.format(new Date(value));
}

export function getWfmWorkTypeLabel(type: WfmWorkType): string {
  return workTypeMeta[type].label;
}

export function getWfmWorkTypeVariant(type: WfmWorkType): BadgeVariant {
  return workTypeMeta[type].badgeVariant;
}

export function getScheduleEventStatusLabel(status: ScheduleEventStatus): string {
  return eventStatusMeta[status].label;
}

export function getScheduleEventStatusVariant(status: ScheduleEventStatus): BadgeVariant {
  return eventStatusMeta[status].badgeVariant;
}

export function getWorkOrderStatusLabel(status: WorkOrderStatus): string {
  return workOrderStatusMeta[status].label;
}

export function getWorkOrderStatusVariant(status: WorkOrderStatus): BadgeVariant {
  return workOrderStatusMeta[status].badgeVariant;
}

export function getWorkOrderPriorityLabel(priority: WorkOrderPriority): string {
  return workOrderPriorityMeta[priority].label;
}

export function getWorkOrderPriorityVariant(priority: WorkOrderPriority): BadgeVariant {
  return workOrderPriorityMeta[priority].badgeVariant;
}

export function getWorkOrderSourceContextLabel(sourceContext: WorkOrderSourceContext): string {
  return sourceContextLabels[sourceContext];
}

export function formatSchedulingExpedienteLabel(expedienteId: string | null | undefined): string {
  return formatExpedienteShortLabel(expedienteId);
}

export function getWorkOrderSourceReferenceLabel(workOrder: {
  sourceContext: WorkOrderSourceContext;
  sourceRef: string | null;
}): string {
  if (!workOrder.sourceRef) {
    return 'No disponible';
  }

  if (workOrder.sourceContext === WorkOrderSourceContext.CRM) {
    return formatSchedulingExpedienteLabel(workOrder.sourceRef);
  }

  return workOrder.sourceRef;
}

export function getSchedulingVisibleDescription(description: string | null | undefined): string {
  if (!description) {
    return 'Sin descripción operativa.';
  }

  return description.replace(
    /el expediente ([0-9a-f]{8}-[0-9a-f-]{27,})/gi,
    (_match, expedienteId: string) =>
      `la oportunidad ${formatSchedulingExpedienteLabel(expedienteId)}`,
  );
}

export function getTechnicianAvailabilityLabel(type: TechnicianAvailabilityType): string {
  return availabilityMeta[type].label;
}

export function getTechnicianAvailabilityVariant(type: TechnicianAvailabilityType): BadgeVariant {
  return availabilityMeta[type].badgeVariant;
}

export function isScheduleEventTerminalStatus(status: ScheduleEventStatus): boolean {
  return [
    ScheduleEventStatus.COMPLETED,
    ScheduleEventStatus.CANCELLED,
    ScheduleEventStatus.NO_SHOW,
  ].includes(status);
}

export function isWorkOrderTerminalStatus(status: WorkOrderStatus): boolean {
  return [WorkOrderStatus.DONE, WorkOrderStatus.CANCELLED].includes(status);
}

export function canViewScheduling(role: string | null | undefined): boolean {
  return Boolean(role && SCHEDULING_VIEW_ROLES.has(role));
}

export function canManageScheduling(role: string | null | undefined): boolean {
  return Boolean(role && SCHEDULING_MANAGE_ROLES.has(role));
}

export function canViewSchedulingCommandCenter(role: string | null | undefined): boolean {
  return Boolean(role && SCHEDULING_COMMAND_CENTER_ROLES.has(role));
}

export function filterOperationalTechnicians(users: InternalUser[]): InternalUser[] {
  return users
    .filter((user) => user.role === UserRole.TECHNICIAN || user.role === UserRole.CONTRACTOR)
    .sort((left, right) =>
      getTechnicianDisplayName(left).localeCompare(getTechnicianDisplayName(right), 'es'),
    );
}

export function getTechnicianDisplayName(
  user: Pick<InternalUser, 'firstName' | 'lastName' | 'email'>,
): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email;
}

export function getTechnicianSubtitle(user: Pick<InternalUser, 'role' | 'email'>): string {
  return `${getPortalUserRoleLabel(user.role)} · ${user.email}`;
}

export function buildTechnicianOptions(users: InternalUser[]): SelectOption[] {
  return filterOperationalTechnicians(users).map((user) => ({
    value: user.id,
    label: getTechnicianDisplayName(user),
  }));
}

export function buildDefaultSchedulingFilters(
  view: SchedulingView = 'calendar',
): SchedulingFilters {
  const today = new Date();
  const start = startOfDay(today);
  const end = addDays(start, 6);

  return {
    fromDate: toLocalDayKey(start),
    toDate: toLocalDayKey(end),
    technicianId: '',
    type: '',
    status: '',
    view,
  };
}

export function toApiDateRange(filters: Pick<SchedulingFilters, 'fromDate' | 'toDate'>): {
  from: string;
  to: string;
} {
  const fromDate = filters.fromDate
    ? new Date(`${filters.fromDate}T00:00:00`)
    : startOfDay(new Date());
  const toDateSource = filters.toDate
    ? new Date(`${filters.toDate}T00:00:00`)
    : addDays(fromDate, 6);
  const toDate = toDateSource < fromDate ? fromDate : toDateSource;

  return {
    from: startOfDay(fromDate).toISOString(),
    to: endOfDay(toDate).toISOString(),
  };
}

export function buildCalendarDays(
  events: WfmScheduleEvent[],
  filters: Pick<SchedulingFilters, 'fromDate' | 'toDate'>,
): SchedulingCalendarDay[] {
  const { fromDate, toDate } = filters;
  const range = toApiDateRange({ fromDate, toDate });
  const start = new Date(range.from);
  const end = new Date(range.to);

  const grouped = new Map<string, WfmScheduleEvent[]>();
  events
    .slice()
    .sort(
      (left, right) =>
        new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
    )
    .forEach((event) => {
      const key = toLocalDayKey(new Date(event.scheduledStartAt));
      const bucket = grouped.get(key) ?? [];
      bucket.push(event);
      grouped.set(key, bucket);
    });

  const days: SchedulingCalendarDay[] = [];
  let cursor = startOfDay(start);
  while (cursor <= end) {
    const key = toLocalDayKey(cursor);
    days.push({
      key,
      date: new Date(cursor),
      label: formatWfmDayLabel(cursor),
      shortLabel: formatShortWfmDayLabel(cursor),
      events: grouped.get(key) ?? [],
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function getEventsForLocalDay(
  events: WfmScheduleEvent[],
  dayKey: string,
): WfmScheduleEvent[] {
  return events
    .filter((event) => toLocalDayKey(new Date(event.scheduledStartAt)) === dayKey)
    .sort(
      (left, right) =>
        new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
    );
}

export function buildTimelineGroups(
  events: WfmScheduleEvent[],
  techniciansById: Map<string, InternalUser>,
  dayKey: string,
): SchedulingTimelineGroup[] {
  const grouped = new Map<string, WfmScheduleEvent[]>();

  getEventsForLocalDay(events, dayKey).forEach((event) => {
    const bucket = grouped.get(event.assignedUserId) ?? [];
    bucket.push(event);
    grouped.set(event.assignedUserId, bucket);
  });

  return Array.from(grouped.entries())
    .map(([technicianId, technicianEvents]) => {
      const technician = techniciansById.get(technicianId);
      return {
        technicianId,
        technicianName: technician ? getTechnicianDisplayName(technician) : 'Técnico no disponible',
        events: technicianEvents,
      };
    })
    .sort((left, right) => left.technicianName.localeCompare(right.technicianName, 'es'));
}

export function toDatetimeLocalValue(value: string | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoFromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export function getTechnicianLoadCount(
  summary: WfmDashboardSummary | null,
  userId: string,
): number | null {
  if (!summary) {
    return null;
  }

  return summary.technicianLoad.find((item) => item.assignedUserId === userId)?.todayCount ?? 0;
}

export function getTechnicianLoadRiskLabel(
  riskLevel: WfmDashboardSummary['technicianLoad'][number]['riskLevel'],
): string {
  if (riskLevel === 'HIGH') return 'Alta';
  if (riskLevel === 'MEDIUM') return 'Media';
  return 'Baja';
}

export function getTechnicianLoadRiskVariant(
  riskLevel: WfmDashboardSummary['technicianLoad'][number]['riskLevel'],
): BadgeVariant {
  if (riskLevel === 'HIGH') return 'error';
  if (riskLevel === 'MEDIUM') return 'warning';
  return 'success';
}

export function getTechnicianLoadRiskTitle(
  riskLevel: WfmDashboardSummary['technicianLoad'][number]['riskLevel'],
): string {
  return `Saturación ${getTechnicianLoadRiskLabel(riskLevel).toLowerCase()}`;
}

export function getDashboardAlertVariant(
  severity: WfmDashboardSummary['alerts'][number]['severity'],
): BadgeVariant {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

export function getDashboardAlertSeverityLabel(
  severity: WfmDashboardSummary['alerts'][number]['severity'],
): string {
  if (severity === 'critical') return 'Crítica';
  if (severity === 'warning') return 'Advertencia';
  return 'Informativa';
}

export function getActiveWorkOrdersForTechnician(
  workOrders: WfmWorkOrder[],
  userId: string,
): WfmWorkOrder[] {
  return workOrders
    .filter(
      (workOrder) =>
        workOrder.assignedUserId === userId && !isWorkOrderTerminalStatus(workOrder.status),
    )
    .sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
}

export function getAvailabilityForTechnician(
  availability: WfmTechnicianAvailability[],
  userId: string,
): WfmTechnicianAvailability[] {
  return availability
    .filter((item) => item.userId === userId)
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

export function getEventReferenceLabel(event: WfmScheduleEvent): string {
  if (event.ticketId) return `Ticket ${event.ticketId}`;
  if (event.contractId) return 'Contrato vinculado';
  if (event.subscriberId) return 'Suscriptor vinculado';
  if (event.expedienteId) return formatExpedienteDisplayRef(event.expedienteId);
  return 'Sin referencia externa';
}
