import {
  ExecutionOrderResult,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
} from '@iwana/shared';
import { AssuranceExecutionOrderNotifierAdapter } from '../ports/assurance-execution-order-notifier.adapter';
import { SlaService } from '../services/sla.service';
import { TimelineService } from '../services/timeline.service';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

describe('AssuranceExecutionOrderNotifierAdapter', () => {
  let timelineService: jest.Mocked<TimelineService>;
  let adapter: AssuranceExecutionOrderNotifierAdapter;
  let slaService: jest.Mocked<SlaService>;
  let manager: { findOne: jest.Mock; update: jest.Mock };
  const installationTicket = {
    id: 'ticket-001',
    tenantId: 'tenant-001',
    type: TicketType.OPERATIONAL_TASK,
    subjectType: TicketSubjectType.EXPEDIENTE,
    status: TicketStatus.OPEN,
    firstRespondedAt: null,
  };
  const closeWith = (result: ExecutionOrderResult) =>
    adapter.notifyClosedWithManager(manager as never, {
      ticketId: 'ticket-001',
      executionOrderId: 'eo-001',
      result,
      tenantId: 'tenant-001',
      actorUserId: 'user-001',
    });

  beforeEach(() => {
    timelineService = {
      recordWithManager: jest.fn().mockResolvedValue({ id: 'timeline-001' }),
      listTimeline: jest.fn(),
    } as unknown as jest.Mocked<TimelineService>;

    slaService = {
      deriveBreachStatus: jest.fn().mockReturnValue('WITHIN_SLA'),
    } as unknown as jest.Mocked<SlaService>;
    manager = {
      findOne: jest.fn().mockResolvedValue({ ...installationTicket }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    adapter = new AssuranceExecutionOrderNotifierAdapter({} as never, timelineService, slaService);
    mockRunInTenantSchema.mockImplementation(
      async (
        _ds: unknown,
        _schema: string,
        callback: (qr: { manager: object }) => Promise<unknown>,
      ) => callback({ manager }),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registra EXECUTION_ORDER_CLOSED en timeline del ticket', async () => {
    await adapter.notifyClosed({
      ticketId: 'ticket-001',
      executionOrderId: 'eo-001',
      result: ExecutionOrderResult.EXECUTED,
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
      actorUserId: 'user-001',
    });

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_001',
      expect.any(Function),
    );
    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ticketId: 'ticket-001',
        tenantId: 'tenant-001',
        eventType: TicketTimelineEventType.EXECUTION_ORDER_CLOSED,
        payload: {
          executionOrderId: 'eo-001',
          result: ExecutionOrderResult.EXECUTED,
        },
        actorUserId: 'user-001',
      }),
    );
  });
  describe('resolución automática del ticket de instalación', () => {
    it('resuelve el ticket cuando la orden cierra como ejecutada y lo deja en el historial', async () => {
      await closeWith(ExecutionOrderResult.EXECUTED);

      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'ticket-001', tenantId: 'tenant-001' },
        expect.objectContaining({
          status: TicketStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          firstRespondedAt: expect.any(Date),
          slaBreachStatus: 'WITHIN_SLA',
        }),
      );
      expect(timelineService.recordWithManager).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: TicketTimelineEventType.STATUS_CHANGED,
          payload: expect.objectContaining({
            from: TicketStatus.OPEN,
            to: TicketStatus.RESOLVED,
            automatic: true,
            executionOrderId: 'eo-001',
          }),
          actorUserId: 'user-001',
        }),
      );
    });

    it.each([
      ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
      ExecutionOrderResult.REQUIRES_FOLLOW_UP,
      ExecutionOrderResult.NOT_EXECUTED,
      ExecutionOrderResult.CANCELLED,
    ])(
      'deja el ticket abierto si la orden cierra como %s (queda algo pendiente)',
      async (result) => {
        await closeWith(result);

        expect(manager.update).not.toHaveBeenCalled();
        expect(timelineService.recordWithManager).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['un ticket de cliente', { type: TicketType.CUSTOMER_INCIDENT }],
      [
        'una tarea operativa que no es de instalación',
        { subjectType: TicketSubjectType.SUBSCRIBER },
      ],
      ['un ticket ya resuelto', { status: TicketStatus.RESOLVED }],
      ['un ticket cerrado', { status: TicketStatus.CLOSED }],
      ['un ticket cancelado', { status: TicketStatus.CANCELLED }],
    ])('no toca %s aunque la orden cierre como ejecutada', async (_label, patch) => {
      manager.findOne.mockResolvedValue({ ...installationTicket, ...patch });

      await closeWith(ExecutionOrderResult.EXECUTED);

      expect(manager.update).not.toHaveBeenCalled();
      expect(timelineService.recordWithManager).toHaveBeenCalledTimes(1);
    });

    it('no falla si el ticket ya no existe', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(closeWith(ExecutionOrderResult.EXECUTED)).resolves.toBeUndefined();
      expect(manager.update).not.toHaveBeenCalled();
    });
  });
});
