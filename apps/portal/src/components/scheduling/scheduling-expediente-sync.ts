interface SyncExpedienteAfterScheduleEventArgs {
  expedienteContextId: string | null;
  payloadExpedienteId?: string | null | undefined;
  transitionExpedienteStatus: (
    id: string,
    dto: { targetStatus: 'INSTALACION_AGENDADA'; reason: string },
  ) => Promise<unknown>;
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
