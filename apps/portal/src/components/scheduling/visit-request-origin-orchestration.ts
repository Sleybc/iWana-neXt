import {
  mapTaskTypeToWfmWorkType,
  TaskType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
  TicketPriority,
} from '@iwana/shared';
import { assuranceApi, wfmApi } from '@/lib/api-client';
import {
  buildPendingVisitInboxHref,
  buildPendingVisitSchedulingHref,
} from './pending-visit-scheduling-handoff';

export type VisitRequestNextAction = 'schedule-now' | 'send-to-pending';

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
  latitude?: number | null;
  longitude?: number | null;
  nextAction: VisitRequestNextAction;
}) {
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
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
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
