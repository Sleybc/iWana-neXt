import { WorkOrderSourceContext } from '@iwana/shared';
import type { WfmScheduleEvent, WfmWorkOrder } from '@/lib/api-client';
import { hasScheduleEventCoordinates, parseOptionalCoordinate } from './scheduling-ui';

interface SyncExpedienteAfterScheduleEventArgs {
  expedienteContextId: string | null;
  payloadExpedienteId?: string | null | undefined;
  transitionExpedienteStatus: (
    id: string,
    dto: { targetStatus: 'INSTALACION_AGENDADA'; reason: string },
  ) => Promise<unknown>;
}

const CRM_EXPEDIENTE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveScheduleEventCrmExpedienteId(
  event: Pick<WfmScheduleEvent, 'expedienteId'>,
  workOrder?: Pick<WfmWorkOrder, 'sourceContext' | 'sourceRef'> | null,
): string | null {
  if (event.expedienteId && CRM_EXPEDIENTE_ID_PATTERN.test(event.expedienteId)) {
    return event.expedienteId;
  }

  if (workOrder?.sourceContext !== WorkOrderSourceContext.CRM) {
    return null;
  }

  const sourceRef = workOrder.sourceRef?.trim();
  if (!sourceRef || !CRM_EXPEDIENTE_ID_PATTERN.test(sourceRef)) {
    return null;
  }

  return sourceRef;
}

export async function enrichScheduleEventWithCrmCoordinates(
  event: WfmScheduleEvent,
  workOrder: WfmWorkOrder | null | undefined,
  getExpediente: (id: string) => Promise<{
    data: { latitude?: number | string | null; longitude?: number | string | null };
  }>,
): Promise<WfmScheduleEvent> {
  if (hasScheduleEventCoordinates(event)) {
    return event;
  }

  const expedienteId = resolveScheduleEventCrmExpedienteId(event, workOrder);
  if (!expedienteId) {
    return event;
  }

  try {
    const response = await getExpediente(expedienteId);
    const latitude = parseOptionalCoordinate(response.data.latitude);
    const longitude = parseOptionalCoordinate(response.data.longitude);

    if (latitude === undefined || longitude === undefined) {
      return event;
    }

    return {
      ...event,
      latitude: String(latitude),
      longitude: String(longitude),
    };
  } catch {
    return event;
  }
}

export async function syncExpedienteAfterScheduleEvent({
  expedienteContextId,
  payloadExpedienteId,
  transitionExpedienteStatus,
}: SyncExpedienteAfterScheduleEventArgs): Promise<boolean> {
  if (!expedienteContextId || payloadExpedienteId !== expedienteContextId) {
    return false;
  }

  await transitionExpedienteStatus(expedienteContextId, {
    targetStatus: 'INSTALACION_AGENDADA',
    reason: 'Instalación agendada desde WFM',
  });

  return true;
}
