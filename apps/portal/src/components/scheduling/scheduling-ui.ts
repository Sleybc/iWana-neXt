import type { BadgeProps } from '@iwana/ui';
import {
  PLATFORM_ONLY_ROLES,
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

export type SchedulingView = 'day' | 'week' | 'month' | 'list';

export const HIGH_DENSITY_DAY_THRESHOLD = 20;

type SchedulingViewMode = 'operational' | 'analytical';

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

export function isHighDensityScheduleDay(taskCount: number): boolean {
  return taskCount >= HIGH_DENSITY_DAY_THRESHOLD;
}

export function getDefaultSchedulingViewForRole(role?: string | null): SchedulingView {
  switch (role) {
    case UserRole.ADMIN:
    case UserRole.NOC:
    case UserRole.SUPPORT:
    case UserRole.SALES:
    case UserRole.TECHNICIAN:
    case UserRole.CONTRACTOR:
      return 'day';
    default:
      return 'day';
  }
}

export function isPrimarySchedulingView(view: SchedulingView): boolean {
  return view === 'day' || view === 'list';
}

export function getSchedulingViewHelperText(view: SchedulingView): string {
  switch (view) {
    case 'day':
      return '';
    case 'list':
      return 'Revisa todo el volumen del rango activo.';
    case 'week':
      return 'Lee capacidad, presión y huecos de la semana.';
    case 'month':
      return 'Lee carga y días críticos del mes.';
    default:
      return 'Opera la agenda del rango activo.';
  }
}

const schedulingViewMeta: Record<
  SchedulingView,
  { label: string; description: string; mode: SchedulingViewMode }
> = {
  day: {
    label: 'Día',
    description: '',
    mode: 'operational',
  },
  list: {
    label: 'Lista',
    description: 'Revisa todo el volumen del rango activo.',
    mode: 'operational',
  },
  week: {
    label: 'Semana',
    description: 'Lee capacidad, presión y huecos de la semana.',
    mode: 'analytical',
  },
  month: {
    label: 'Mes',
    description: 'Lee carga y días críticos del mes.',
    mode: 'analytical',
  },
};

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
    badgeVariant: 'success',
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
    badgeVariant: 'success',
  },
  [ScheduleEventStatus.NO_SHOW]: {
    label: 'Sin atención',
    description: 'No se logró ejecutar la visita programada.',
    badgeVariant: 'error',
  },
  [ScheduleEventStatus.EXPIRED]: {
    label: 'Vencido',
    description: 'Evento que venció sin ser cerrado a tiempo.',
    badgeVariant: 'neutral',
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
  [WorkOrderSourceContext.TASKS]: 'Tareas',
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

export function filterSchedulableUsers(users: InternalUser[]): InternalUser[] {
  return users
    .filter((user) => !PLATFORM_ONLY_ROLES.has(user.role))
    .filter((user) => user.status === 'ACTIVE')
    .filter((user) => !user.deletedAt)
    .sort((left, right) =>
      getTechnicianDisplayName(left).localeCompare(getTechnicianDisplayName(right), 'es'),
    );
}

export function filterOperationalTechnicians(users: InternalUser[]): InternalUser[] {
  return users
    .filter(
      (user) =>
        user.isOperationalResource ||
        user.role === UserRole.TECHNICIAN ||
        user.role === UserRole.CONTRACTOR,
    )
    .filter((user) => user.status === 'ACTIVE')
    .filter((user) => !user.deletedAt)
    .sort((left, right) =>
      getTechnicianDisplayName(left).localeCompare(getTechnicianDisplayName(right), 'es'),
    );
}

export function filterRecommendationCandidateUsers(users: InternalUser[]): InternalUser[] {
  const operationalUsers = filterOperationalTechnicians(users);
  if (operationalUsers.length > 0) {
    return operationalUsers;
  }

  return filterSchedulableUsers(users);
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
  return filterSchedulableUsers(users).map((user) => ({
    value: user.id,
    label: getTechnicianDisplayName(user),
  }));
}

export function getSchedulingViewDescription(view: SchedulingView): string {
  return schedulingViewMeta[view].description;
}

export function getSchedulingViewMode(view: SchedulingView): SchedulingViewMode {
  return schedulingViewMeta[view].mode;
}

export function isOperationalSchedulingView(view: SchedulingView): boolean {
  return getSchedulingViewMode(view) === 'operational';
}

function buildMonthRange(anchorDate: Date): { fromDate: string; toDate: string } {
  const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);

  return {
    fromDate: toLocalDayKey(start),
    toDate: toLocalDayKey(end),
  };
}

function buildWeekRange(anchorDate: Date): { fromDate: string; toDate: string } {
  const start = startOfDay(anchorDate);
  const end = addDays(start, 6);

  return {
    fromDate: toLocalDayKey(start),
    toDate: toLocalDayKey(end),
  };
}

function buildDayRange(anchorDate: Date): { fromDate: string; toDate: string } {
  const start = startOfDay(anchorDate);

  return {
    fromDate: toLocalDayKey(start),
    toDate: toLocalDayKey(start),
  };
}

export function getSchedulingAnchorDate(
  filters: Pick<SchedulingFilters, 'fromDate'>,
  fallback = new Date(),
): Date {
  return filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`) : startOfDay(fallback);
}

export function buildSchedulingRangeForView(
  view: SchedulingView,
  anchorValue: string | Date = new Date(),
): Pick<SchedulingFilters, 'fromDate' | 'toDate'> {
  const anchorDate =
    typeof anchorValue === 'string' ? new Date(`${anchorValue}T00:00:00`) : startOfDay(anchorValue);

  if (view === 'day' || view === 'list') {
    return buildDayRange(anchorDate);
  }

  if (view === 'month') {
    return buildMonthRange(anchorDate);
  }

  return buildWeekRange(anchorDate);
}

export function buildDefaultSchedulingFilters(view: SchedulingView = 'day'): SchedulingFilters {
  return {
    ...buildSchedulingRangeForView(view, new Date()),
    technicianId: '',
    type: '',
    status: '',
    view,
  };
}

export function buildSchedulingFiltersForViewSwitch(
  filters: SchedulingFilters,
  nextView: SchedulingView,
): SchedulingFilters {
  if (filters.view === nextView) {
    return filters;
  }

  if (nextView === 'list') {
    if (filters.fromDate !== filters.toDate) {
      return {
        ...filters,
        ...buildSchedulingRangeForView(nextView, getSchedulingAnchorDate(filters)),
        view: nextView,
      };
    }

    return {
      ...filters,
      view: nextView,
    };
  }

  return {
    ...filters,
    ...buildSchedulingRangeForView(nextView, getSchedulingAnchorDate(filters)),
    view: nextView,
  };
}

export function getRecommendedSchedulingViewForDensity(
  filters: Pick<SchedulingFilters, 'fromDate' | 'toDate'>,
  taskCount: number,
): SchedulingView | null {
  if (filters.fromDate !== filters.toDate) {
    return null;
  }

  return isHighDensityScheduleDay(taskCount) ? 'list' : null;
}

export function shiftSchedulingAnchorDate(
  view: SchedulingView,
  anchorValue: string | Date,
  direction: -1 | 1,
): Date {
  const anchorDate =
    typeof anchorValue === 'string' ? new Date(`${anchorValue}T00:00:00`) : startOfDay(anchorValue);

  if (view === 'day' || view === 'list') {
    return addDays(anchorDate, direction);
  }

  if (view === 'month') {
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1);
  }

  return addDays(anchorDate, direction * 7);
}

const monthFormatter = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
});

const shortRangeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
});

export function formatSchedulingRangeLabel(
  filters: Pick<SchedulingFilters, 'fromDate' | 'toDate' | 'view'>,
): string {
  const fromDate = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`) : new Date();
  const toDate = filters.toDate ? new Date(`${filters.toDate}T00:00:00`) : fromDate;

  if (filters.view === 'month') {
    return monthFormatter.format(fromDate);
  }

  if (filters.view === 'day' || filters.view === 'list') {
    return formatWfmDayLabel(fromDate);
  }

  return `${shortRangeFormatter.format(fromDate)} - ${shortRangeFormatter.format(toDate)}`;
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
        technicianName: technician
          ? getTechnicianDisplayName(technician)
          : 'Responsable no disponible',
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

export function parseOptionalCoordinate(
  value: number | string | null | undefined,
): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function hasScheduleEventCoordinates(
  event: Pick<WfmScheduleEvent, 'latitude' | 'longitude'>,
): boolean {
  const latitude = parseOptionalCoordinate(event.latitude);
  const longitude = parseOptionalCoordinate(event.longitude);
  return latitude !== undefined && longitude !== undefined;
}

export function formatScheduleEventCoordinates(
  event: Pick<WfmScheduleEvent, 'latitude' | 'longitude'>,
): string | null {
  const latitude = parseOptionalCoordinate(event.latitude);
  const longitude = parseOptionalCoordinate(event.longitude);

  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  return `${latitude}, ${longitude}`;
}

export function getEventReferenceLabel(
  event: WfmScheduleEvent,
  workOrder?: WfmWorkOrder | null,
): string {
  if (event.ticketId) return `Ticket ${event.ticketId}`;
  if (event.contractId) return 'Contrato vinculado';
  if (event.subscriberId) return 'Suscriptor vinculado';
  if (event.expedienteId) return formatExpedienteDisplayRef(event.expedienteId);

  const crmExpedienteId = resolveCrmExpedienteIdFromWorkOrder(workOrder);
  if (crmExpedienteId) {
    return formatExpedienteDisplayRef(crmExpedienteId);
  }

  if (workOrder?.sourceRef?.trim()) {
    return workOrder.sourceRef;
  }

  return 'Sin referencia externa';
}

const CRM_EXPEDIENTE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveCrmExpedienteIdFromWorkOrder(workOrder?: WfmWorkOrder | null): string | null {
  if (!workOrder || workOrder.sourceContext !== WorkOrderSourceContext.CRM) {
    return null;
  }

  const sourceRef = workOrder.sourceRef?.trim();
  if (!sourceRef || !CRM_EXPEDIENTE_ID_PATTERN.test(sourceRef)) {
    return null;
  }

  return sourceRef;
}
