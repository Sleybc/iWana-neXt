import {
  mapTaskTypeToWfmWorkType,
  ScheduleEventStatus,
  TaskType,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
  TicketPriority,
} from '@iwana/shared';
import {
  assuranceApi,
  wfmApi,
  type WfmScheduleEvent,
  type WfmVisitRequest,
} from '@/lib/api-client';
import {
  buildPendingVisitInboxHref,
  buildPendingVisitSchedulingHref,
} from './pending-visit-scheduling-handoff';
import { isTerminalVisitRequestStatus } from './pending-visits-ui';
import { toLocalDateValue } from './schedule-event-time';
import { isScheduleEventTerminalStatus, parseOptionalCoordinate } from './scheduling-ui';

export type VisitRequestNextAction = 'schedule-now' | 'send-to-pending';

export type CrmInstallationFieldWorkKind = 'scheduled' | 'in_progress' | 'pending_inbox' | 'none';

export interface CrmInstallationFieldWork {
  kind: CrmInstallationFieldWorkKind;
  visitRequestId: string | null;
  scheduleEventId: string | null;
  activeEventStatus: string | null;
  scheduledStartAt: string | null;
  assignedUserId: string | null;
  href: string | null;
}

/** ADR-076 — resultado de verificación de trabajo activo para un origen. */
export interface ActiveWorkCheck {
  hasActiveWork: boolean;
  activeVisitRequestId: string | null;
  activeEventStatus: string | null;
  activeEventDate: string | null;
  activeEventTime: string | null;
  activeTechnicianName: string | null;
}

const CRM_ACTIVE_VISIT_LIST_LIMIT = 5;
const CRM_EVENTS_LIST_LIMIT = 50;
const DUPLICATE_PAYLOAD_MAX_DEPTH = 5;

const EMPTY_FIELD_WORK: CrmInstallationFieldWork = {
  kind: 'none',
  visitRequestId: null,
  scheduleEventId: null,
  activeEventStatus: null,
  scheduledStartAt: null,
  assignedUserId: null,
  href: null,
};

function sortVisitRequestsByCreatedAtDesc(left: WfmVisitRequest, right: WfmVisitRequest): number {
  const leftTs = Date.parse(left.createdAt);
  const rightTs = Date.parse(right.createdAt);
  const safeLeft = Number.isFinite(leftTs) ? leftTs : 0;
  const safeRight = Number.isFinite(rightTs) ? rightTs : 0;
  return safeRight - safeLeft;
}

function isInProgressEventStatus(status: ScheduleEventStatus): boolean {
  return status === ScheduleEventStatus.EN_ROUTE || status === ScheduleEventStatus.IN_PROGRESS;
}

function isInstallationScheduleEvent(event: WfmScheduleEvent): boolean {
  return !('type' in event) || event.type === WfmWorkType.INSTALLATION;
}

function buildAgendaHref(visitRequestId: string, scheduledStartAt?: string | null): string {
  const focusDate = scheduledStartAt ? toLocalDateValue(scheduledStartAt) : '';
  return buildPendingVisitSchedulingHref({
    source: 'pending-visits',
    visitRequestId,
    focusDate: focusDate || null,
  });
}

function deriveCrmInstallationFieldWork(
  visitRequests: WfmVisitRequest[],
  events: WfmScheduleEvent[],
): CrmInstallationFieldWork {
  const activeEvent = events.find(
    (event) => !isScheduleEventTerminalStatus(event.status) && isInstallationScheduleEvent(event),
  );

  if (activeEvent) {
    const linkedVisitRequest =
      visitRequests.find((visitRequest) => visitRequest.scheduleEventId === activeEvent.id) ??
      visitRequests
        .filter((visitRequest) => visitRequest.status === VisitRequestStatus.SCHEDULED)
        .sort(sortVisitRequestsByCreatedAtDesc)[0] ??
      null;

    const visitRequestId = linkedVisitRequest?.id ?? null;
    const kind: CrmInstallationFieldWorkKind = isInProgressEventStatus(activeEvent.status)
      ? 'in_progress'
      : 'scheduled';

    return {
      kind,
      visitRequestId,
      scheduleEventId: activeEvent.id,
      activeEventStatus: activeEvent.status,
      scheduledStartAt: activeEvent.scheduledStartAt ?? null,
      assignedUserId: activeEvent.assignedUserId ?? null,
      href: visitRequestId ? buildAgendaHref(visitRequestId, activeEvent.scheduledStartAt) : null,
    };
  }

  const pendingVisitRequest = visitRequests
    .filter((visitRequest) => !isTerminalVisitRequestStatus(visitRequest.status))
    .sort(sortVisitRequestsByCreatedAtDesc)[0];

  if (pendingVisitRequest) {
    return {
      kind: 'pending_inbox',
      visitRequestId: pendingVisitRequest.id,
      scheduleEventId: pendingVisitRequest.scheduleEventId ?? null,
      activeEventStatus: null,
      scheduledStartAt: null,
      assignedUserId: null,
      href: buildPendingVisitInboxHref(pendingVisitRequest.id),
    };
  }

  const scheduledVisitRequest = visitRequests
    .filter(
      (visitRequest) =>
        visitRequest.status === VisitRequestStatus.SCHEDULED &&
        Boolean(visitRequest.scheduleEventId),
    )
    .sort(sortVisitRequestsByCreatedAtDesc)[0];

  if (scheduledVisitRequest) {
    return {
      kind: 'scheduled',
      visitRequestId: scheduledVisitRequest.id,
      scheduleEventId: scheduledVisitRequest.scheduleEventId,
      activeEventStatus: null,
      scheduledStartAt: null,
      assignedUserId: null,
      href: buildAgendaHref(scheduledVisitRequest.id),
    };
  }

  return EMPTY_FIELD_WORK;
}

/**
 * Resuelve el trabajo de campo CRM/INSTALLATION activo de un expediente
 * (evento no terminal, bandeja o VR ya agendada).
 */
export async function resolveCrmInstallationFieldWork(
  expedienteId: string,
): Promise<CrmInstallationFieldWork> {
  const [visitRequestsResult, eventsResult] = await Promise.allSettled([
    wfmApi.visitRequests.list({
      originContext: WorkOrderSourceContext.CRM,
      workType: WfmWorkType.INSTALLATION,
      originRef: expedienteId,
      page: 1,
      limit: CRM_ACTIVE_VISIT_LIST_LIMIT,
    }),
    wfmApi.events.list({
      expedienteId,
      page: 1,
      limit: CRM_EVENTS_LIST_LIMIT,
    }),
  ]);

  const visitRequests =
    visitRequestsResult.status === 'fulfilled' ? visitRequestsResult.value.items : [];
  const events = eventsResult.status === 'fulfilled' ? eventsResult.value.data : [];

  return deriveCrmInstallationFieldWork(visitRequests, events);
}

/**
 * ADR-076 — verifica si existe trabajo activo para un origen dado.
 */
export async function checkActiveWorkForOrigin(expedienteId: string): Promise<ActiveWorkCheck> {
  try {
    const fieldWork = await resolveCrmInstallationFieldWork(expedienteId);

    if (fieldWork.kind === 'none') {
      return {
        hasActiveWork: false,
        activeVisitRequestId: null,
        activeEventStatus: null,
        activeEventDate: null,
        activeEventTime: null,
        activeTechnicianName: null,
      };
    }

    return {
      hasActiveWork: true,
      activeVisitRequestId: fieldWork.visitRequestId,
      activeEventStatus: fieldWork.activeEventStatus,
      activeEventDate: fieldWork.scheduledStartAt,
      activeEventTime: fieldWork.scheduledStartAt,
      activeTechnicianName: fieldWork.assignedUserId,
    };
  } catch {
    return {
      hasActiveWork: false,
      activeVisitRequestId: null,
      activeEventStatus: null,
      activeEventDate: null,
      activeEventTime: null,
      activeTechnicianName: null,
    };
  }
}

/** ADR-076 — error de duplicado devuelto por el backend. */
export interface DuplicateActiveWorkError {
  error: 'DUPLICATE_ACTIVE_WORK';
  originRef: string;
  activeVisitRequestId: string;
}

/** ADR-076 — resultado de creación de visita con posible duplicado. */
export interface CreateVisitRequestResult {
  visitRequest?: WfmVisitRequest | undefined;
  duplicate?: DuplicateActiveWorkError | undefined;
  href: string;
}

/**
 * Detecta un conflicto 409 sin `instanceof ApiError` (Turbopack/HMR puede
 * duplicar la clase y romper el identity check).
 */
function isConflictApiErrorShape(error: unknown): error is {
  status: number;
  name?: string;
  details?: unknown;
  message?: unknown;
} {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    status?: unknown;
    name?: unknown;
    details?: unknown;
    message?: unknown;
  };

  if (candidate.status !== 409) {
    return false;
  }

  return (
    candidate.name === 'ApiError' ||
    'details' in candidate ||
    typeof candidate.message === 'string' ||
    'status' in candidate
  );
}

function readDuplicateActiveWorkPayload(
  value: unknown,
  depth = 0,
): DuplicateActiveWorkError | null {
  if (!value || typeof value !== 'object' || depth > DUPLICATE_PAYLOAD_MAX_DEPTH) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record.error === 'DUPLICATE_ACTIVE_WORK' && typeof record.activeVisitRequestId === 'string') {
    return {
      error: 'DUPLICATE_ACTIVE_WORK',
      originRef: typeof record.originRef === 'string' ? record.originRef : '',
      activeVisitRequestId: record.activeVisitRequestId,
    };
  }

  for (const nestedKey of ['details', 'message', 'data', 'body'] as const) {
    if (!(nestedKey in record)) {
      continue;
    }
    const nested = readDuplicateActiveWorkPayload(record[nestedKey], depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

/**
 * Extrae el contrato ADR-076 `DUPLICATE_ACTIVE_WORK` desde un error 409.
 * Soporta cuerpo plano Nest, envelope `{ message: { ... } }` y anidación
 * adicional en details/data/body. Usa duck-typing (no `instanceof`).
 */
function parseDuplicateActiveWorkError(error: unknown): DuplicateActiveWorkError | null {
  if (!isConflictApiErrorShape(error)) {
    return null;
  }

  return (
    readDuplicateActiveWorkPayload(error.details) ??
    readDuplicateActiveWorkPayload(error) ??
    readDuplicateActiveWorkPayload(error.message)
  );
}

async function createVisitRequestOrReuseExisting(
  create: () => Promise<WfmVisitRequest>,
  nextAction: VisitRequestNextAction,
): Promise<CreateVisitRequestResult> {
  try {
    const visitRequest = await create();
    return { visitRequest, href: resolveNextHref(visitRequest.id, nextAction) };
  } catch (error) {
    const duplicate = parseDuplicateActiveWorkError(error);
    if (duplicate) {
      return {
        duplicate,
        href: resolveNextHref(duplicate.activeVisitRequestId, nextAction),
      };
    }
    throw error;
  }
}

function mapAssurancePriorityToWorkOrder(priority: TicketPriority): WorkOrderPriority {
  switch (priority) {
    case TicketPriority.LOW:
      return WorkOrderPriority.LOW;
    case TicketPriority.HIGH:
      return WorkOrderPriority.HIGH;
    case TicketPriority.URGENT:
    case TicketPriority.CRITICAL:
      return WorkOrderPriority.URGENT;
    case TicketPriority.NORMAL:
    default:
      return WorkOrderPriority.NORMAL;
  }
}

function resolveNextHref(visitRequestId: string, nextAction: VisitRequestNextAction): string {
  return nextAction === 'schedule-now'
    ? buildPendingVisitSchedulingHref({ source: 'pending-visits', visitRequestId })
    : buildPendingVisitInboxHref(visitRequestId);
}

export async function createCrmVisitRequestAndRoute(input: {
  expedienteId: string;
  customerLabel: string;
  municipality?: string;
  address?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  nextAction: VisitRequestNextAction;
  isAdditional?: boolean;
  additionalReason?: string | null;
}): Promise<CreateVisitRequestResult> {
  const latitude = parseOptionalCoordinate(input.latitude);
  const longitude = parseOptionalCoordinate(input.longitude);
  const hasCoordinatePair =
    latitude !== undefined &&
    longitude !== undefined &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  const isAdditional = Boolean(input.isAdditional);
  const additionalReason = input.additionalReason?.trim() ?? '';

  if (isAdditional && !additionalReason) {
    throw new Error('Indica el motivo de la visita adicional.');
  }

  if (!isAdditional) {
    const fieldWork = await resolveCrmInstallationFieldWork(input.expedienteId);
    if (fieldWork.kind !== 'none' && fieldWork.visitRequestId) {
      return {
        visitRequest: { id: fieldWork.visitRequestId } as WfmVisitRequest,
        href: fieldWork.href ?? resolveNextHref(fieldWork.visitRequestId, input.nextAction),
      };
    }
  }

  const ticketResult = await assuranceApi.tickets.findOrCreateInstallation({
    expedienteId: input.expedienteId,
    expedienteFullName: input.customerLabel,
  });

  return createVisitRequestOrReuseExisting(
    () =>
      wfmApi.visitRequests.create({
        originContext: WorkOrderSourceContext.CRM,
        originRef: input.expedienteId,
        originLabel: `Cliente ${input.customerLabel}`.slice(0, 160),
        workType: WfmWorkType.INSTALLATION,
        priority: WorkOrderPriority.NORMAL,
        title: `Instalación para ${input.customerLabel}`.slice(0, 160),
        expedienteId: input.expedienteId,
        ticketId: ticketResult.ticket.id,
        municipality: input.municipality ?? null,
        address: input.address ?? null,
        latitude: hasCoordinatePair ? latitude : null,
        longitude: hasCoordinatePair ? longitude : null,
        ...(isAdditional
          ? {
              isAdditional: true,
              additionalReason,
            }
          : {}),
      }),
    input.nextAction,
  );
}

export async function createAssuranceVisitRequestAndRoute(input: {
  ticketId: string;
  subject: string;
  priority: TicketPriority;
  notes?: string | null;
  nextAction: VisitRequestNextAction;
}): Promise<CreateVisitRequestResult> {
  await assuranceApi.tickets.requestFieldService(input.ticketId, { notes: input.notes ?? null });

  return createVisitRequestOrReuseExisting(
    () =>
      wfmApi.visitRequests.create({
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: input.ticketId,
        originLabel: `Ticket ${input.ticketId}`,
        workType: WfmWorkType.SUPPORT,
        priority: mapAssurancePriorityToWorkOrder(input.priority),
        title: input.subject.slice(0, 160),
        ticketId: input.ticketId,
        description: input.notes ?? null,
      }),
    input.nextAction,
  );
}

export async function createTaskVisitRequestAndRoute(input: {
  taskId: string;
  taskType: TaskType;
  title: string;
  ticketId?: string | null;
  municipality?: string | null;
  address?: string | null;
  nextAction: VisitRequestNextAction;
}): Promise<CreateVisitRequestResult> {
  const workType = mapTaskTypeToWfmWorkType(input.taskType);
  if (workType === null) {
    throw new Error('Este tipo de tarea no requiere solicitud de visita de campo.');
  }

  return createVisitRequestOrReuseExisting(
    () =>
      wfmApi.visitRequests.create({
        originContext: WorkOrderSourceContext.TASKS,
        originRef: input.taskId,
        originLabel: `Tarea ${input.taskId}`.slice(0, 160),
        workType,
        priority: WorkOrderPriority.NORMAL,
        title: input.title.slice(0, 160),
        ticketId: input.ticketId ?? null,
        municipality: input.municipality ?? null,
        address: input.address ?? null,
      }),
    input.nextAction,
  );
}
