import { ExecutionOrderResult, TicketTimelineEventType } from '@iwana/shared';
import { AssuranceExecutionOrderNotifierAdapter } from '../ports/assurance-execution-order-notifier.adapter';
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

  beforeEach(() => {
    timelineService = {
      recordWithManager: jest.fn().mockResolvedValue({ id: 'timeline-001' }),
      listTimeline: jest.fn(),
    } as unknown as jest.Mocked<TimelineService>;

    adapter = new AssuranceExecutionOrderNotifierAdapter({} as never, timelineService);
    mockRunInTenantSchema.mockImplementation(
      async (
        _ds: unknown,
        _schema: string,
        callback: (qr: { manager: object }) => Promise<unknown>,
      ) => callback({ manager: {} }),
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
});
