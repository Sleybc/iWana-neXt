import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  TaskStatus,
  UserRole,
  WfmWorkType,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderInventoryService } from '../services/execution-order-inventory.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
}));

describe('ExecutionOrdersService', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  let service: ExecutionOrdersService;
  let inventoryService: jest.Mocked<ExecutionOrderInventoryService>;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    inventoryService = {
      consumeTechnicianCustody: jest.fn().mockResolvedValue({
        stockMovementId: 'mov-001',
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      }),
    } as unknown as jest.Mocked<ExecutionOrderInventoryService>;

    service = new ExecutionOrdersService({} as DataSource, inventoryService);
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  it('creates an execution order from scheduling context', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'eo-001',
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.createFromScheduling(
      {
        visitRequestId: '11111111-1111-4111-8111-111111111111',
        scheduleEventId: '22222222-2222-4222-8222-222222222222',
        assignedTechnicianId: '33333333-3333-4333-8333-333333333333',
        originContext: 'TASKS',
        originRefId: 'task-001',
        taskId: 'task-uuid',
        ticketId: 'ticket-uuid',
        subscriberId: 'sub-uuid',
        customerDisplayLabel: 'Cliente Torre Norte',
        serviceAddress: 'Calle 1 # 2 - 3',
        municipality: 'Bogotá',
        sector: 'Centro',
        workType: WfmWorkType.INSTALLATION,
        workSummary: 'Instalar ONU y activar servicio',
        plannedWindowStartAt: '2026-06-24T14:00:00.000Z',
        plannedWindowEndAt: '2026-06-24T16:00:00.000Z',
      },
      actor,
    );

    expect(result.status).toBe(ExecutionOrderStatus.ASSIGNED);
    expect(result.scheduleEventId).toBe('22222222-2222-4222-8222-222222222222');
    expect(result.assignedTechnicianId).toBe('33333333-3333-4333-8333-333333333333');
    expect(result.taskId).toBe('task-uuid');
    expect(result.ticketId).toBe('ticket-uuid');
    expect(result.subscriberId).toBe('sub-uuid');
  });

  it('registers item usage from technician custody and records stock movement id', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.ASSIGNED,
        startedAt: null,
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.registerItemUsage(
      'eo-001',
      {
        itemId: 'item-001',
        technicianCustodyId: 'cust-001',
        quantity: 1,
        serialNumber: 'SER-001',
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      },
      actor,
    );

    expect(inventoryService.consumeTechnicianCustody).toHaveBeenCalledWith(
      expect.objectContaining({
        technicianCustodyId: 'cust-001',
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      }),
      actor,
    );
    expect(result.itemId).toBe('item-001');
    expect(result.stockMovementId).toBe('mov-001');
  });

  it('rejects close without customer signature when installed at customer usage exists', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        taskId: null,
        ticketId: null,
        status: ExecutionOrderStatus.IN_PROGRESS,
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'usage-001',
            executionOrderId: 'eo-001',
            tenantId: 'tenant-001',
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
        ]),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.close(
        'eo-001',
        {
          result: ExecutionOrderResult.EXECUTED,
          closeNotes: 'Cierre sin firma',
        },
        actor,
      ),
    ).rejects.toThrow('Debes registrar la evidencia de firma del cliente');
  });

  it('notifies assurance when closing an order linked to a ticket', async () => {
    const assuranceNotifier = {
      notifyClosed: jest.fn().mockResolvedValue(undefined),
      notifyClosedWithManager: jest.fn().mockResolvedValue(undefined),
    };
    service = new ExecutionOrdersService(
      {} as DataSource,
      inventoryService,
      undefined,
      assuranceNotifier,
    );

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        taskId: null,
        ticketId: 'ticket-uuid',
        status: ExecutionOrderStatus.IN_PROGRESS,
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await service.close(
      'eo-001',
      {
        result: ExecutionOrderResult.EXECUTED,
        closeNotes: 'Cierre con ticket vinculado',
      },
      actor,
    );

    expect(assuranceNotifier.notifyClosedWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        ticketId: 'ticket-uuid',
        executionOrderId: 'eo-001',
        result: ExecutionOrderResult.EXECUTED,
        tenantId: 'tenant-001',
        actorUserId: actor.sub,
      }),
    );
  });

  it('does not resolve the task when the execution order was not executed', async () => {
    const tasksService = {
      transitionStatusWithManager: jest.fn().mockResolvedValue(undefined),
    };

    service = new ExecutionOrdersService({} as DataSource, inventoryService, tasksService as never);

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        taskId: 'task-uuid',
        ticketId: null,
        status: ExecutionOrderStatus.IN_PROGRESS,
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await service.close(
      'eo-001',
      {
        result: ExecutionOrderResult.NOT_EXECUTED,
        closeNotes: 'No se pudo ejecutar. Reprogramar.',
      },
      actor,
    );

    expect(tasksService.transitionStatusWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      'task-uuid',
      { status: TaskStatus.READY },
      actor,
    );
  });
});
