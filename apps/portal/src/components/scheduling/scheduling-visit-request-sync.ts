import type { WfmVisitRequest } from '@/lib/api-client';
import { assuranceApi, crmApi, wfmApi } from '@/lib/api-client';
import { WorkOrderSourceContext } from '@iwana/shared';
import { syncExpedienteAfterScheduleEvent } from './scheduling-expediente-sync';
import type { ManualSchedulePayload } from './VisitRequestRecommendationPanel';

interface ScheduleVisitRequestWithFollowUpInput {
  visitRequest: WfmVisitRequest;
  payload: ManualSchedulePayload;
  createWorkOrder: boolean;
  workOrderNotes: string | null;
  /** ADR-076 — visita adicional sobre trabajo activo. */
  isAdditional?: boolean;
  /** ADR-076 — motivo de la visita adicional. */
  additionalReason?: string | null;
  /** ADR-077 D4 — override al límite de 3 intentos. */
  attemptDecision?: 'FORCE_RESCHEDULE' | 'CLOSE_CASE' | null;
}

export async function scheduleVisitRequestWithFollowUp({
  visitRequest,
  payload,
  createWorkOrder,
  workOrderNotes,
  isAdditional = false,
  additionalReason = null,
  attemptDecision = null,
}: ScheduleVisitRequestWithFollowUpInput): Promise<string> {
  const scheduledVisitRequest = await wfmApi.visitRequests.schedule(visitRequest.id, {
    assignedUserId: payload.assignedUserId,
    scheduledStartAt: payload.scheduledStartAt,
    scheduledEndAt: payload.scheduledEndAt,
    ...(visitRequest.organizationSiteId
      ? { organizationSiteId: visitRequest.organizationSiteId }
      : {}),
    createWorkOrder,
    workOrderNotes: createWorkOrder ? workOrderNotes?.trim() || null : null,
    ...(isAdditional ? { isAdditional: true, additionalReason } : {}),
    ...(attemptDecision ? { attemptDecision } : {}),
  });

  let feedbackMessage = `La solicitud ${visitRequest.title} quedó agendada correctamente.`;
  if (isAdditional) {
    feedbackMessage = `La segunda visita para ${visitRequest.title} quedó agendada. El motivo quedó registrado en la orden de trabajo.`;
  }
  const syncWarnings: string[] = [];

  if (
    scheduledVisitRequest.originContext === WorkOrderSourceContext.CRM &&
    scheduledVisitRequest.expedienteId &&
    scheduledVisitRequest.workOrderId
  ) {
    if (scheduledVisitRequest.ticketId) {
      try {
        await assuranceApi.tickets.linkWorkOrder(scheduledVisitRequest.ticketId, {
          workOrderId: scheduledVisitRequest.workOrderId,
        });
      } catch {
        syncWarnings.push('No fue posible vincular la orden de trabajo con Aseguramiento.');
      }

      try {
        await crmApi.linkInstallationOperationalRefs(scheduledVisitRequest.expedienteId, {
          ticketId: scheduledVisitRequest.ticketId,
          workOrderId: scheduledVisitRequest.workOrderId,
        });
      } catch {
        syncWarnings.push('no fue posible persistir las referencias operativas en CRM.');
      }
    }

    try {
      const synced = await syncExpedienteAfterScheduleEvent({
        expedienteContextId: scheduledVisitRequest.expedienteId,
        payloadExpedienteId: scheduledVisitRequest.expedienteId,
        transitionExpedienteStatus: crmApi.transitionExpedienteStatus,
      });

      if (synced) {
        feedbackMessage += ' El expediente quedó marcado como instalación agendada.';
      }
    } catch {
      syncWarnings.push('no fue posible actualizar el expediente automáticamente.');
    }
  }

  if (syncWarnings.length > 0) {
    feedbackMessage += ` Advertencias: ${syncWarnings
      .map((warning, index) =>
        index === 0 ? warning : `${warning.charAt(0).toUpperCase()}${warning.slice(1)}`,
      )
      .join(' ')}`;
  }

  return feedbackMessage;
}
