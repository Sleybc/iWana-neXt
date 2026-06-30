import { WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';
import { assuranceApi, wfmApi } from '@/lib/api-client';
import {
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

  it('routes task scheduling-later to pending inbox with selection', async () => {
    visitRequestsCreateMock.mockResolvedValue({
      id: 'vr-task-1',
      title: 'Visita de tarea',
      originContext: WorkOrderSourceContext.TASKS,
    } as never);

    const result = await createTaskVisitRequestAndRoute({
      taskId: 'task-001',
      title: 'Visita de tarea',
      municipality: 'Bogotá',
      address: 'Cra 1 # 2-3',
      nextAction: 'send-to-pending',
    });

    expect(result.href).toBe(
      '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-task-1',
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
      title: 'Visita de tarea',
      nextAction: 'schedule-now',
    });

    expect(visitRequestsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originContext: WorkOrderSourceContext.TASKS,
        originRef: 'task-002',
        workType: 'TECHNICAL_VISIT',
        priority: WorkOrderPriority.NORMAL,
      }),
    );
  });
});
