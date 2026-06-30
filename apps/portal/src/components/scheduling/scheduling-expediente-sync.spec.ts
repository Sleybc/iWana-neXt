import {
  enrichScheduleEventWithCrmCoordinates,
  syncExpedienteAfterScheduleEvent,
} from './scheduling-expediente-sync';

describe('scheduling-expediente-sync', () => {
  it('should transicionar el expediente cuando el evento se crea desde el contexto CRM activo', async () => {
    const transitionExpedienteStatus = jest.fn().mockResolvedValue({});

    await expect(
      syncExpedienteAfterScheduleEvent({
        expedienteContextId: '550e8400-e29b-41d4-a716-446655440000',
        payloadExpedienteId: '550e8400-e29b-41d4-a716-446655440000',
        transitionExpedienteStatus,
      }),
    ).resolves.toBe(true);

    expect(transitionExpedienteStatus).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      {
        targetStatus: 'INSTALACION_AGENDADA',
        reason: 'Instalación agendada desde WFM',
      },
    );
  });

  it('should omitir la transición cuando el payload no coincide con el contexto CRM', async () => {
    const transitionExpedienteStatus = jest.fn().mockResolvedValue({});

    await expect(
      syncExpedienteAfterScheduleEvent({
        expedienteContextId: '550e8400-e29b-41d4-a716-446655440000',
        payloadExpedienteId: '0d5c6c0f-55ae-4ef0-bb03-4ad8ae935dc4',
        transitionExpedienteStatus,
      }),
    ).resolves.toBe(false);

    expect(transitionExpedienteStatus).not.toHaveBeenCalled();
  });

  it('hidrata coordenadas desde CRM cuando el evento no las tiene persistidas', async () => {
    const event = {
      id: 'evt-1',
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      latitude: null,
      longitude: null,
    } as any;

    const enriched = await enrichScheduleEventWithCrmCoordinates(event, null, async () => ({
      data: {
        latitude: 4.43712,
        longitude: -74.52198,
      },
    }));

    expect(enriched.latitude).toBe('4.43712');
    expect(enriched.longitude).toBe('-74.52198');
  });
});
