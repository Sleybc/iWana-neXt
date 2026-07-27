import {
  TaskType,
  TicketPriority,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { assuranceApi, wfmApi } from '@/lib/api-client';
import {
  createAssuranceVisitRequestAndRoute,
  createCrmVisitRequestAndRoute,
  createTaskVisitRequestAndRoute,
} from './visit-request-origin-orchestration';

jest.mock('@/lib/api-client', () => ({
  assuranceApi: {
    tickets: {
      findOrCreateInstallation: jest.fn(),
      requestFieldService: jest.fn(),
    },
  },
  wfmApi: {
    visitRequests: {
      create: jest.fn(),
    },
  },
}));

const findOrCreateInstallationMock = jest.mocked(assuranceApi.tickets.findOrCreateInstallation);
const requestFieldServiceMock = jest.mocked(assuranceApi.tickets.requestFieldService);
const visitRequestsCreateMock = jest.mocked(wfmApi.visitRequests.create);

describe('visit-request-origin-orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes CRM scheduling-now through agenda handoff', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-001' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-001',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      latitude: 4.711,
      longitude: -74.0721,
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 4.711,
        longitude: -74.0721,
      }),
    );
    expect(result.href).toBe(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    );
  });

  it('normalizes CRM coordinates serialized as PostgreSQL numeric strings', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-002' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-002',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      latitude: '4,7110000',
      longitude: '-74,0721000',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 4.711,
        longitude: -74.0721,
      }),
    );
  });

  it('omits the coordinate pair when one CRM coordinate is not normalizable', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-003' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-003',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      latitude: 'sin coordenada',
      longitude: '-74.0721',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: null,
        longitude: null,
      }),
    );
  });

  it('omits the coordinate pair when CRM coordinates are outside WFM geographic bounds', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-004' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-004',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      latitude: '91',
      longitude: '-74.0721',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: null,
        longitude: null,
      }),
    );
  });

  it('routes task scheduling-later to pending inbox with selection', async () => {
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-task-1',
      title: 'Visita de tarea',
      originContext: WorkOrderSourceContext.TASKS,
    } as never);

    const result = await createTaskVisitRequestAndRoute({
      taskId: 'task-001',
      taskType: TaskType.FIELD_VISIT,
      title: 'Visita de tarea',
      municipality: 'Bogotá',
      address: 'Cra 1 # 2-3',
      nextAction: 'send-to-pending',
    });

    expect(result.href).toBe(
      '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-task-1',
    );
  });

  it('creates assurance visit requests with SUPPORT work type', async () => {
    requestFieldServiceMock.mockResolvedValue(undefined as never);
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-assurance-1',
      title: 'Visita soporte',
      originContext: WorkOrderSourceContext.ASSURANCE,
    } as never);

    await createAssuranceVisitRequestAndRoute({
      ticketId: 'ticket-001',
      subject: 'Visita soporte',
      priority: TicketPriority.HIGH,
      notes: 'Revisar en sitio',
      nextAction: 'schedule-now',
    });

    expect(requestFieldServiceMock).toHaveBeenCalledWith('ticket-001', {
      notes: 'Revisar en sitio',
    });
    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: 'ticket-001',
        workType: WfmWorkType.SUPPORT,
        priority: WorkOrderPriority.HIGH,
        ticketId: 'ticket-001',
      }),
    );
  });

  it('creates task visit requests with TASKS origin context', async () => {
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-task-2',
      title: 'Visita de tarea',
      originContext: WorkOrderSourceContext.TASKS,
    } as never);

    await createTaskVisitRequestAndRoute({
      taskId: 'task-002',
      taskType: TaskType.FIELD_VISIT,
      title: 'Visita de tarea',
      ticketId: 'ticket-002',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originContext: WorkOrderSourceContext.TASKS,
        originRef: 'task-002',
        workType: WfmWorkType.TECHNICAL_VISIT,
        priority: WorkOrderPriority.NORMAL,
        ticketId: 'ticket-002',
      }),
    );
  });

  it('maps INSTALLATION task type to INSTALLATION work type', async () => {
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-task-install',
      title: 'Instalación de tarea',
      originContext: WorkOrderSourceContext.TASKS,
    } as never);

    await createTaskVisitRequestAndRoute({
      taskId: 'task-install',
      taskType: TaskType.INSTALLATION,
      title: 'Instalación de tarea',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workType: WfmWorkType.INSTALLATION,
      }),
    );
  });

  it('maps CUSTOMER_SUPPORT task type to SUPPORT work type', async () => {
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-task-support',
      title: 'Soporte en campo',
      originContext: WorkOrderSourceContext.TASKS,
    } as never);

    await createTaskVisitRequestAndRoute({
      taskId: 'task-support',
      taskType: TaskType.CUSTOMER_SUPPORT,
      title: 'Soporte en campo',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workType: WfmWorkType.SUPPORT,
      }),
    );
  });

  it('rejects BACKOFFICE task types without creating a visit request', async () => {
    await expect(
      createTaskVisitRequestAndRoute({
        taskId: 'task-backoffice',
        taskType: TaskType.BACKOFFICE,
        title: 'Tarea administrativa',
        nextAction: 'schedule-now',
      }),
    ).rejects.toThrow('Este tipo de tarea no requiere solicitud de visita de campo.');

    expect(visitRequestsCreateMock).not.toHaveBeenCalled();
  });
});
