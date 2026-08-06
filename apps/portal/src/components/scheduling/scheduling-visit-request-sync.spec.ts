import {
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { scheduleVisitRequestWithFollowUp } from './scheduling-visit-request-sync';

const linkWorkOrderMock = jest.fn();
const linkInstallationOperationalRefsMock = jest.fn();
const scheduleVisitRequestMock = jest.fn();
const transitionExpedienteSyncMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  assuranceApi: {
    tickets: {
      linkWorkOrder: (...args: unknown[]) => linkWorkOrderMock(...args),
    },
  },
  crmApi: {
    linkInstallationOperationalRefs: (...args: unknown[]) =>
      linkInstallationOperationalRefsMock(...args),
    transitionExpedienteStatus: jest.fn(),
  },
  wfmApi: {
    visitRequests: {
      schedule: (...args: unknown[]) => scheduleVisitRequestMock(...args),
    },
  },
}));

jest.mock('./scheduling-expediente-sync', () => ({
  syncExpedienteAfterScheduleEvent: (...args: unknown[]) => transitionExpedienteSyncMock(...args),
}));

function buildVisitRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-1',
    tenantId: 'tenant-1',
    status: VisitRequestStatus.READY_TO_SCHEDULE,
    originContext: WorkOrderSourceContext.CRM,
    originRef: '550e8400-e29b-41d4-a716-446655440111',
    originLabel: 'Oportunidad EXP-001',
    workType: WfmWorkType.INSTALLATION,
    priority: WorkOrderPriority.HIGH,
    title: 'Instalación GPON barrio norte',
    description: 'Cliente listo para ventana PM.',
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    sector: 'Chapinero',
    latitude: null,
    longitude: null,
    requestedWindowStartAt: '2026-06-01T14:00:00.000Z',
    requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
    slaDueAt: '2026-06-02T23:59:59.000Z',
    organizationSiteId: '77777777-7777-4777-8777-777777777777',
    expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    subscriberId: null,
    ticketId: 'TK-001',
    contractId: null,
    workOrderId: null,
    scheduleEventId: null,
    requestedByUserId: 'user-1',
    scheduledByUserId: null,
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    scheduledStartAt: null,
    scheduledEndAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-05-30T12:00:00.000Z',
    updatedAt: '2026-05-30T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('scheduleVisitRequestWithFollowUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    scheduleVisitRequestMock.mockResolvedValue(
      buildVisitRequest({
        workOrderId: 'wo-1',
        scheduledStartAt: '2026-06-01T14:00:00.000Z',
        scheduledEndAt: '2026-06-01T16:00:00.000Z',
      }),
    );
    linkWorkOrderMock.mockResolvedValue(undefined);
    linkInstallationOperationalRefsMock.mockResolvedValue(undefined);
    transitionExpedienteSyncMock.mockResolvedValue(true);
  });

  it('retorna éxito limpio cuando todas las sincronizaciones auxiliares completan', async () => {
    const message = await scheduleVisitRequestWithFollowUp({
      visitRequest: buildVisitRequest(),
      payload: {
        assignedUserId: 'tech-1',
        scheduledStartAt: '2026-06-01T14:00:00.000Z',
        scheduledEndAt: '2026-06-01T16:00:00.000Z',
      },
      createWorkOrder: true,
      workOrderNotes: 'Equipo listo',
    });

    expect(message).toBe(
      'La solicitud Instalación GPON barrio norte quedó agendada correctamente. El expediente quedó marcado como instalación agendada.',
    );
    expect(linkWorkOrderMock).toHaveBeenCalledWith('TK-001', { workOrderId: 'wo-1' });
    expect(linkInstallationOperationalRefsMock).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440111',
      {
        ticketId: 'TK-001',
        workOrderId: 'wo-1',
      },
    );
    expect(transitionExpedienteSyncMock).toHaveBeenCalledTimes(1);
  });

  it('mantiene el éxito principal y agrega advertencias cuando fallan sincronizaciones auxiliares', async () => {
    linkWorkOrderMock.mockRejectedValue(new Error('assurance down'));
    linkInstallationOperationalRefsMock.mockRejectedValue(new Error('crm down'));
    transitionExpedienteSyncMock.mockRejectedValue(new Error('transition down'));

    const message = await scheduleVisitRequestWithFollowUp({
      visitRequest: buildVisitRequest(),
      payload: {
        assignedUserId: 'tech-1',
        scheduledStartAt: '2026-06-01T14:00:00.000Z',
        scheduledEndAt: '2026-06-01T16:00:00.000Z',
      },
      createWorkOrder: true,
      workOrderNotes: null,
    });

    expect(message).toBe(
      'La solicitud Instalación GPON barrio norte quedó agendada correctamente. Advertencias: No fue posible vincular la orden de trabajo con Aseguramiento. No fue posible persistir las referencias operativas en CRM. No fue posible actualizar el expediente automáticamente.',
    );
  });

  it('avanza el expediente a instalación agendada aunque no se cree orden de trabajo', async () => {
    scheduleVisitRequestMock.mockResolvedValue(
      buildVisitRequest({
        workOrderId: null,
        scheduleEventId: 'evt-1',
        status: VisitRequestStatus.SCHEDULED,
      }),
    );

    const message = await scheduleVisitRequestWithFollowUp({
      visitRequest: buildVisitRequest(),
      payload: {
        assignedUserId: 'tech-1',
        scheduledStartAt: '2026-06-01T14:00:00.000Z',
        scheduledEndAt: '2026-06-01T16:00:00.000Z',
      },
      createWorkOrder: false,
      workOrderNotes: null,
    });

    expect(transitionExpedienteSyncMock).toHaveBeenCalledTimes(1);
    expect(linkWorkOrderMock).not.toHaveBeenCalled();
    expect(linkInstallationOperationalRefsMock).not.toHaveBeenCalled();
    expect(message).toContain('El expediente quedó marcado como instalación agendada.');
  });
});
