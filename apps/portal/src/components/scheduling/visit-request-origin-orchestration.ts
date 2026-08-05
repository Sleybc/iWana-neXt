import {
  mapTaskTypeToWfmWorkType,
  TaskType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
  TicketPriority,
} from '@iwana/shared';
import { assuranceApi, wfmApi, ApiError, type WfmVisitRequest } from '@/lib/api-client';
import {
  buildPendingVisitInboxHref,
  buildPendingVisitSchedulingHref,
} from './pending-visit-scheduling-handoff';
import { parseOptionalCoordinate } from './scheduling-ui';
import { isScheduleEventTerminalStatus } from './scheduling-ui';

export type VisitRequestNextAction = 'schedule-now' | 'send-to-pending';

/** ADR-076 — resultado de verificación de trabajo activo para un origen. */
export interface ActiveWorkCheck {
  hasActiveWork: boolean;
  activeVisitRequestId: string | null;
  activeEventStatus: string | null;
  activeEventDate: string | null;
  activeEventTime: string | null;
  activeTechnicianName: string | null;
}

/**
 * ADR-076 — verifica si existe trabajo activo para un origen dado.
 * Consulta los eventos existentes del expediente y retorna
 * información del trabajo activo si existe.
 */
export async function checkActiveWorkForOrigin(expedienteId: string): Promise<ActiveWorkCheck> {
  try {
    const eventsResponse = await wfmApi.events.list({
      expedienteId,
      page: 1,
      limit: 100,
    });

    const activeEvent = eventsResponse.data.find(
      (event) => !isScheduleEventTerminalStatus(event.status),
    );

    if (activeEvent) {
      return {
        hasActiveWork: true,
        activeVisitRequestId: activeEvent.id,
        activeEventStatus: activeEvent.status,
        activeEventDate: activeEvent.scheduledStartAt ?? null,
        activeEventTime: activeEvent.scheduledStartAt ?? null,
        activeTechnicianName: activeEvent.assignedUserId ?? null,
      };
    }

    return {
      hasActiveWork: false,
      activeVisitRequestId: null,
      activeEventStatus: null,
      activeEventDate: null,
      activeEventTime: null,
      activeTechnicianName: null,
    };
  } catch {
    // En caso de error de red, asumimos que no hay trabajo activo para no bloquear.
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
  href?: string | undefined;
}

function isDuplicateActiveWorkError(error: unknown): error is DuplicateActiveWorkError {
  if (error instanceof ApiError && error.status === 409) {
    try {
      const details = error.details as Record<string, unknown> | undefined;
      return details?.error === 'DUPLICATE_ACTIVE_WORK';
    } catch {
      return false;
    }
  }
  return false;
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
}) {
  const latitude = parseOptionalCoordinate(input.latitude);
  const longitude = parseOptionalCoordinate(input.longitude);
  const hasCoordinatePair =
    latitude !== undefined &&
    longitude !== undefined &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  const ticketResult = await assuranceApi.tickets.findOrCreateInstallation({
    expedienteId: input.expedienteId,
    expedienteFullName: input.customerLabel,
  });
  const visitRequest = await wfmApi.visitRequests.create({
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
  });

  return { visitRequest, href: resolveNextHref(visitRequest.id, input.nextAction) };
}

export async function createAssuranceVisitRequestAndRoute(input: {
  ticketId: string;
  subject: string;
  priority: TicketPriority;
  notes?: string | null;
  nextAction: VisitRequestNextAction;
}) {
  await assuranceApi.tickets.requestFieldService(input.ticketId, { notes: input.notes ?? null });
  const visitRequest = await wfmApi.visitRequests.create({
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRef: input.ticketId,
    originLabel: `Ticket ${input.ticketId}`,
    workType: WfmWorkType.SUPPORT,
    priority: mapAssurancePriorityToWorkOrder(input.priority),
    title: input.subject.slice(0, 160),
    ticketId: input.ticketId,
    description: input.notes ?? null,
  });

  return { visitRequest, href: resolveNextHref(visitRequest.id, input.nextAction) };
}

export async function createTaskVisitRequestAndRoute(input: {
  taskId: string;
  taskType: TaskType;
  title: string;
  ticketId?: string | null;
  municipality?: string | null;
  address?: string | null;
  nextAction: VisitRequestNextAction;
}) {
  const workType = mapTaskTypeToWfmWorkType(input.taskType);
  if (workType === null) {
    throw new Error('Este tipo de tarea no requiere solicitud de visita de campo.');
  }

  const visitRequest = await wfmApi.visitRequests.create({
    originContext: WorkOrderSourceContext.TASKS,
    originRef: input.taskId,
    originLabel: `Tarea ${input.taskId}`.slice(0, 160),
    workType,
    priority: WorkOrderPriority.NORMAL,
    title: input.title.slice(0, 160),
    ticketId: input.ticketId ?? null,
    municipality: input.municipality ?? null,
    address: input.address ?? null,
  });

  return { visitRequest, href: resolveNextHref(visitRequest.id, input.nextAction) };
}
