import {
  ScheduleEventStatus,
  TaskType,
  TicketPriority,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { ApiError, assuranceApi, wfmApi } from '@/lib/api-client';
import {
  checkActiveWorkForOrigin,
  createAssuranceVisitRequestAndRoute,
  createCrmVisitRequestAndRoute,
  createTaskVisitRequestAndRoute,
  resolveCrmInstallationFieldWork,
} from './visit-request-origin-orchestration';

jest.mock('@/lib/api-client', () => {
  class ApiErrorMock extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
      public readonly details?: unknown,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }

  return {
    ApiError: ApiErrorMock,
    assuranceApi: {
      tickets: {
        findOrCreateInstallation: jest.fn(),
        requestFieldService: jest.fn(),
      },
    },
    wfmApi: {
      visitRequests: {
        list: jest.fn(),
        create: jest.fn(),
      },
      events: {
        list: jest.fn(),
      },
    },
  };
});

const findOrCreateInstallationMock = jest.mocked(assuranceApi.tickets.findOrCreateInstallation);
const requestFieldServiceMock = jest.mocked(assuranceApi.tickets.requestFieldService);
const visitRequestsListMock = jest.mocked(wfmApi.visitRequests.list);
const visitRequestsCreateMock = jest.mocked(wfmApi.visitRequests.create);
const eventsListMock = jest.mocked(wfmApi.events.list);

describe('visit-request-origin-orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    visitRequestsListMock.mockResolvedValue({
      items: [],
      meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
    });
    eventsListMock.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
    } as never);
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

    expect(visitRequestsListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originContext: WorkOrderSourceContext.CRM,
        workType: WfmWorkType.INSTALLATION,
        originRef: '550e8400-e29b-41d4-a716-446655440000',
        limit: 5,
      }),
    );
    expect(eventsListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expedienteId: '550e8400-e29b-41d4-a716-446655440000',
        page: 1,
        limit: 50,
      }),
    );
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

  it('reuses an active CRM visit from list before posting create', async () => {
    visitRequestsListMock.mockResolvedValue({
      items: [
        {
          id: 'vr-list-active',
          status: VisitRequestStatus.READY_TO_SCHEDULE,
          originContext: WorkOrderSourceContext.CRM,
          originRef: '550e8400-e29b-41d4-a716-446655440000',
          expedienteId: '550e8400-e29b-41d4-a716-446655440000',
          workType: WfmWorkType.INSTALLATION,
          createdAt: '2026-08-01T10:00:00.000Z',
        } as never,
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      nextAction: 'schedule-now',
    });

    expect(result.href).toBe(
      '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-list-active',
    );
    expect(result.visitRequest?.id).toBe('vr-list-active');
    expect(findOrCreateInstallationMock).not.toHaveBeenCalled();
    expect(visitRequestsCreateMock).not.toHaveBeenCalled();
  });

  it('reuses a scheduled CRM visit without create when scheduleEventId is present', async () => {
    visitRequestsListMock.mockResolvedValue({
      items: [
        {
          id: 'vr-scheduled-linked',
          status: VisitRequestStatus.SCHEDULED,
          scheduleEventId: 'evt-scheduled-1',
          originContext: WorkOrderSourceContext.CRM,
          originRef: '550e8400-e29b-41d4-a716-446655440000',
          expedienteId: '550e8400-e29b-41d4-a716-446655440000',
          workType: WfmWorkType.INSTALLATION,
          createdAt: '2026-08-02T10:00:00.000Z',
        } as never,
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      nextAction: 'schedule-now',
    });

    expect(result.href).toBe(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-scheduled-linked',
    );
    expect(result.visitRequest?.id).toBe('vr-scheduled-linked');
    expect(findOrCreateInstallationMock).not.toHaveBeenCalled();
    expect(visitRequestsCreateMock).not.toHaveBeenCalled();
  });

  it('resolves scheduled field work from a non-terminal installation event', async () => {
    visitRequestsListMock.mockResolvedValue({
      items: [
        {
          id: 'vr-linked',
          status: VisitRequestStatus.SCHEDULED,
          scheduleEventId: 'evt-active-1',
          createdAt: '2026-08-02T10:00:00.000Z',
        } as never,
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    eventsListMock.mockResolvedValue({
      data: [
        {
          id: 'evt-active-1',
          type: WfmWorkType.INSTALLATION,
          status: ScheduleEventStatus.SCHEDULED,
          scheduledStartAt: '2026-08-10T14:30:00.000Z',
          assignedUserId: 'tech-1',
        },
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    } as never);

    const fieldWork = await resolveCrmInstallationFieldWork('550e8400-e29b-41d4-a716-446655440000');

    expect(fieldWork).toEqual(
      expect.objectContaining({
        kind: 'scheduled',
        visitRequestId: 'vr-linked',
        scheduleEventId: 'evt-active-1',
        assignedUserId: 'tech-1',
      }),
    );
    expect(fieldWork.href).toContain('visitRequestId=vr-linked');
    expect(fieldWork.href).toContain('focusDate=');
  });

  it('marks in-progress installation events and exposes the real visitRequestId', async () => {
    visitRequestsListMock.mockResolvedValue({
      items: [
        {
          id: 'vr-in-progress',
          status: VisitRequestStatus.SCHEDULED,
          scheduleEventId: 'evt-progress-1',
          createdAt: '2026-08-02T10:00:00.000Z',
        } as never,
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    eventsListMock.mockResolvedValue({
      data: [
        {
          id: 'evt-progress-1',
          type: WfmWorkType.INSTALLATION,
          status: ScheduleEventStatus.IN_PROGRESS,
          scheduledStartAt: '2026-08-10T09:00:00.000Z',
          assignedUserId: 'tech-2',
        },
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    } as never);

    const fieldWork = await resolveCrmInstallationFieldWork('550e8400-e29b-41d4-a716-446655440000');
    const activeWork = await checkActiveWorkForOrigin('550e8400-e29b-41d4-a716-446655440000');

    expect(fieldWork.kind).toBe('in_progress');
    expect(activeWork.activeVisitRequestId).toBe('vr-in-progress');
    expect(activeWork.activeVisitRequestId).not.toBe('evt-progress-1');
  });

  it('creates an additional CRM visit when isAdditional includes a reason', async () => {
    visitRequestsListMock.mockResolvedValue({
      items: [
        {
          id: 'vr-existing-scheduled',
          status: VisitRequestStatus.SCHEDULED,
          scheduleEventId: 'evt-existing',
          createdAt: '2026-08-02T10:00:00.000Z',
        } as never,
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-ADDITIONAL' } as never,
      created: false,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-additional',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      nextAction: 'schedule-now',
      isAdditional: true,
      additionalReason: 'Requiere segunda visita técnica',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isAdditional: true,
        additionalReason: 'Requiere segunda visita técnica',
      }),
    );
    expect(result.href).toBe(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-additional',
    );
  });

  it('rejects additional CRM visits without a reason', async () => {
    await expect(
      createCrmVisitRequestAndRoute({
        expedienteId: '550e8400-e29b-41d4-a716-446655440000',
        customerLabel: 'Cliente Demo',
        nextAction: 'schedule-now',
        isAdditional: true,
        additionalReason: '   ',
      }),
    ).rejects.toThrow('Indica el motivo de la visita adicional.');

    expect(visitRequestsCreateMock).not.toHaveBeenCalled();
  });

  it('ignores terminal CRM visits from list and continues to create', async () => {
    visitRequestsListMock.mockResolvedValue({
      items: [
        {
          id: 'vr-scheduled',
          status: VisitRequestStatus.SCHEDULED,
          scheduleEventId: null,
          originContext: WorkOrderSourceContext.CRM,
          originRef: '550e8400-e29b-41d4-a716-446655440000',
          expedienteId: '550e8400-e29b-41d4-a716-446655440000',
          workType: WfmWorkType.INSTALLATION,
          createdAt: '2026-08-01T10:00:00.000Z',
        } as never,
      ],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-AFTER-TERMINAL' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-new-after-terminal',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      nextAction: 'send-to-pending',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalled();
    expect(result.href).toBe(
      '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-new-after-terminal',
    );
  });

  it('falls back to create when list fails', async () => {
    visitRequestsListMock.mockRejectedValue(new Error('list unavailable'));
    eventsListMock.mockRejectedValue(new Error('events unavailable'));
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-LIST-FAIL' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-after-list-fail',
      title: 'Instalación',
      originContext: WorkOrderSourceContext.CRM,
    } as never);

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalled();
    expect(result.href).toBe(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-after-list-fail',
    );
  });

  it('reuses the active CRM visit request when create returns DUPLICATE_ACTIVE_WORK', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-DUP' } as never,
      created: false,
    });
    visitRequestsCreateMock.mockRejectedValue(
      new ApiError(409, 'UNKNOWN', 'Error del servidor', {
        error: 'DUPLICATE_ACTIVE_WORK',
        originRef: '550e8400-e29b-41d4-a716-446655440000',
        activeVisitRequestId: 'vr-existing-crm',
      }),
    );

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerLabel: 'Cliente Demo',
      nextAction: 'schedule-now',
    });

    expect(result.href).toBe(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-existing-crm',
    );
    expect(result.duplicate).toEqual({
      error: 'DUPLICATE_ACTIVE_WORK',
      originRef: '550e8400-e29b-41d4-a716-446655440000',
      activeVisitRequestId: 'vr-existing-crm',
    });
  });

  it('parses DUPLICATE_ACTIVE_WORK with duck-typing when instanceof would fail', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-DUCK' } as never,
      created: false,
    });
    // Simula clase duplicada por HMR/Turbopack: misma shape, distinta identidad.
    const foreignApiError = Object.assign(new Error('Error del servidor'), {
      name: 'ApiError',
      status: 409,
      code: 'UNKNOWN',
      details: {
        message: {
          error: 'DUPLICATE_ACTIVE_WORK',
          originRef: '550e8400-e29b-41d4-a716-446655440099',
          activeVisitRequestId: 'vr-duck-typed',
        },
        error: 'Conflict',
        statusCode: 409,
      },
    });
    visitRequestsCreateMock.mockRejectedValue(foreignApiError);

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440099',
      customerLabel: 'Cliente Demo',
      nextAction: 'schedule-now',
    });

    expect(foreignApiError).not.toBeInstanceOf(ApiError);
    expect(result.href).toBe(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-duck-typed',
    );
    expect(result.duplicate?.activeVisitRequestId).toBe('vr-duck-typed');
  });

  it('routes CRM send-to-pending to the existing visit when create conflicts', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-DUP-2' } as never,
      created: false,
    });
    visitRequestsCreateMock.mockRejectedValue(
      new ApiError(409, 'UNKNOWN', 'Error del servidor', {
        message: {
          error: 'DUPLICATE_ACTIVE_WORK',
          originRef: '550e8400-e29b-41d4-a716-446655440001',
          activeVisitRequestId: 'vr-existing-pending',
        },
        error: 'Conflict',
        statusCode: 409,
      }),
    );

    const result = await createCrmVisitRequestAndRoute({
      expedienteId: '550e8400-e29b-41d4-a716-446655440001',
      customerLabel: 'Cliente Demo',
      nextAction: 'send-to-pending',
    });

    expect(result.href).toBe(
      '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-existing-pending',
    );
  });

  it('propagates non-duplicate CRM create failures', async () => {
    findOrCreateInstallationMock.mockResolvedValue({
      ticket: { id: 'TK-FAIL' } as never,
      created: true,
    });
    visitRequestsCreateMock.mockRejectedValue(
      new ApiError(500, 'UNKNOWN', 'Error del servidor', { error: 'INTERNAL' }),
    );

    await expect(
      createCrmVisitRequestAndRoute({
        expedienteId: '550e8400-e29b-41d4-a716-446655440000',
        customerLabel: 'Cliente Demo',
        nextAction: 'schedule-now',
      }),
    ).rejects.toBeInstanceOf(ApiError);
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
