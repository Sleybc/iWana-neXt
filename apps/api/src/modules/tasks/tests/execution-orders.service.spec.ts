import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
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
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';

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
      getItemCategoryReceipt: jest.fn().mockResolvedValue({
        itemId: 'item-001',
        categoryId: 'category-001',
        categoryCode: 'CPE',
      }),
    } as unknown as jest.Mocked<ExecutionOrderInventoryService>;

    service = new ExecutionOrdersService({} as DataSource, inventoryService);
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  it('creates an execution order from scheduling context', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
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

  describe('cancelFromSchedulingWithManager', () => {
    const scheduleEventId = '22222222-2222-4222-8222-222222222222';
    const executionOrderId = 'eo-001';
    const reason = 'Cliente canceló la visita';
    const tenantId = 'tenant-001';

    it('cancela la OT y registra el motivo en closeNotes', async () => {
      const originalOrder = {
        id: executionOrderId,
        tenantId,
        scheduleEventId,
        status: ExecutionOrderStatus.ASSIGNED,
        version: 3,
        closeNotes: null,
        updatedByUserId: null,
        closedAt: null,
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue(originalOrder),
        save: jest
          .fn()
          .mockImplementation(async (_entity, payload) => ({ id: executionOrderId, ...payload })),
      };

      const result = await service.cancelFromSchedulingWithManager(
        manager as never,
        tenantId,
        executionOrderId,
        scheduleEventId,
        reason,
        actor,
      );

      expect(result).toEqual({ id: executionOrderId, status: ExecutionOrderStatus.CANCELLED });
      expect(manager.findOne).toHaveBeenCalledWith(expect.any(Function), {
        where: { id: executionOrderId, tenantId },
      });
      expect(manager.save).toHaveBeenCalled();
      const savedPayload = (manager.save as jest.Mock).mock.calls[0][1];
      expect(savedPayload.status).toBe(ExecutionOrderStatus.CANCELLED);
      expect(savedPayload.closeNotes).toBe(reason);
      expect(savedPayload.closedAt).toBeInstanceOf(Date);
      expect(savedPayload.updatedByUserId).toBe(actor.sub);
      expect(savedPayload.version).toBe(4);
    });

    it('lanza NotFoundException si la OT no existe', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      };

      await expect(
        service.cancelFromSchedulingWithManager(
          manager as never,
          tenantId,
          'nonexistent-id',
          scheduleEventId,
          reason,
          actor,
        ),
      ).rejects.toThrow('OT de ejecución no encontrada');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('lanza ConflictException si el scheduleEventId no coincide', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: executionOrderId,
          tenantId,
          scheduleEventId: '99999999-9999-4999-8999-999999999999', // distinto
          status: ExecutionOrderStatus.ASSIGNED,
          version: 2,
        }),
        save: jest.fn(),
      };

      await expect(
        service.cancelFromSchedulingWithManager(
          manager as never,
          tenantId,
          executionOrderId,
          scheduleEventId,
          reason,
          actor,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('OT no pertenece'),
      });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('no requiere runInTenantSchema — usa el manager transaccional directamente', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: executionOrderId,
          tenantId,
          scheduleEventId,
          status: ExecutionOrderStatus.ASSIGNED,
          version: 1,
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => ({ ...payload })),
      };

      // Asegurar que mockRunInTenantSchema no fue llamado
      mockRunInTenantSchema.mockClear();

      await service.cancelFromSchedulingWithManager(
        manager as never,
        tenantId,
        executionOrderId,
        scheduleEventId,
        reason,
        actor,
      );

      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });
  });

  it('calcula progress como porcentaje desde requisitos satisfechos y total', async () => {
    const closureGateEvaluator = {
      evaluate: jest.fn().mockReturnValue({
        totalRequired: 5,
        satisfiedRequired: 2,
        missingRequirements: [],
        allEvaluations: [],
        passed: false,
      }),
    };
    service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      closureGateEvaluator as never,
    );

    const queryBuilder = () => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        templateRequirementsSnapshot: [
          { key: 'one', label: 'Uno', required: true, kind: 'FIELD', fieldType: 'TEXT' },
        ],
      }),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(queryBuilder())
        .mockReturnValueOnce(queryBuilder())
        .mockReturnValueOnce(queryBuilder()),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(service.getCompletion('eo-001')).resolves.toEqual({
      progress: 40,
      completed: 2,
      total: 5,
    });
    expect(closureGateEvaluator.evaluate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ activities: [], evidences: [], itemUsages: [] }),
    );
  });

  it('rechaza el cierre cuando la OT no tiene snapshot de plantilla', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        organizationSiteId: 'site-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 1,
        templateRequirementsSnapshot: null,
      }),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.close(
        'eo-001',
        { result: ExecutionOrderResult.EXECUTED, summary: 'Cierre sin snapshot' },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLOSURE_GATE_SNAPSHOT_MISSING',
        missingRequirements: ['Plantilla de cierre'],
      }),
    });
  });

  it('publica solo labels de producto en missingRequirements del cierre', async () => {
    const closureGateEvaluator = {
      evaluate: jest.fn().mockReturnValue({
        passed: false,
        totalRequired: 1,
        satisfiedRequired: 0,
        allEvaluations: [],
        missingRequirements: [
          {
            requirementId: 'actividad-instalacion',
            label: 'Instalación de fibra',
            kind: 'ACTIVITY',
            satisfied: false,
            reason: 'No se ha registrado la actividad "Instalación de fibra".',
          },
        ],
      }),
    };
    service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      closureGateEvaluator as never,
    );

    const queryBuilder = () => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        organizationSiteId: 'site-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 1,
        templateRequirementsSnapshot: [
          {
            key: 'actividad-instalacion',
            label: 'Instalación de fibra',
            required: true,
            kind: 'ACTIVITY',
            activityType: 'INSTALLATION',
          },
        ],
      }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder()),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.close(
        'eo-001',
        { result: ExecutionOrderResult.NOT_EXECUTED, summary: 'Cierre pendiente' },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLOSURE_GATE_INCOMPLETE',
        missingRequirements: ['Instalación de fibra'],
      }),
    });
  });

  describe('MATERIAL closure context', () => {
    const materialSnapshot = [
      {
        key: 'material-ont',
        label: 'ONT requerida',
        required: true,
        kind: 'MATERIAL' as const,
        itemCategory: 'CPE',
      },
    ];

    const closeOrderWithCategory = async (categoryCode: string) => {
      inventoryService.getItemCategoryReceipt.mockResolvedValue({
        itemId: 'item-001',
        categoryId: 'category-001',
        categoryCode,
      });
      service = new ExecutionOrdersService(
        {} as DataSource,
        inventoryService,
        undefined,
        undefined,
        undefined,
        undefined,
        new ClosureGateEvaluatorService(),
      );

      const usage = {
        id: 'usage-001',
        itemId: 'item-001',
        tenantId: 'tenant-001',
        finalDisposition: InventoryDisposition.INTERNAL_CONSUMPTION,
      };
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([usage])
          .mockResolvedValueOnce([usage]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          status: ExecutionOrderStatus.IN_PROGRESS,
          version: 1,
          result: null,
          startedAt: null,
          closedAt: null,
          closeNotes: null,
          taskId: null,
          ticketId: null,
          templateRequirementsSnapshot: materialSnapshot,
        }),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      return service.close(
        'eo-001',
        { result: ExecutionOrderResult.EXECUTED, summary: 'Cierre material' },
        actor,
      );
    };

    it('satisface MATERIAL con la categoría canónica del recibo de Inventario', async () => {
      const result = await closeOrderWithCategory('CPE');

      expect(result.status).toBe(ExecutionOrderStatus.COMPLETED);
      expect(inventoryService.getItemCategoryReceipt).toHaveBeenCalledWith('item-001');
    });

    it('rechaza MATERIAL cuando el recibo real tiene otra categoría', async () => {
      await expect(closeOrderWithCategory('NETWORKING')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CLOSURE_GATE_INCOMPLETE' }),
      });
    });
  });

  it('registers item usage from technician custody and records stock movement id', async () => {
    const techSub = actor.sub; // 'support-001'
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.ASSIGNED,
        version: 1,
        assignedTechnicianId: techSub, // custody must match assignment
        assignedCrewId: null,
        startedAt: null,
        closedAt: null,
        result: null,
        closeNotes: null,
        updatedByUserId: null,
        taskId: null,
        ticketId: null,
        templateRequirementsSnapshot: null,
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.registerItemUsage(
      'eo-001',
      {
        itemId: 'item-001',
        technicianCustodyId: techSub, // matches assignedTechnicianId and actor.sub
        quantity: 1,
        serialNumber: 'SER-001',
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      },
      actor,
    );

    expect(inventoryService.consumeTechnicianCustody).not.toHaveBeenCalled();
    expect(result.itemId).toBe('item-001');
    expect(result.stockMovementId).toBeNull();
  });

  it('rejects close without customer signature when installed at customer usage exists', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        taskId: null,
        ticketId: null,
        status: ExecutionOrderStatus.IN_PROGRESS,
        templateRequirementsSnapshot: [],
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
          summary: 'Cierre sin firma',
          closeNotes: 'Cierre sin firma',
        },
        actor,
      ),
    ).rejects.toThrow('Debes registrar la evidencia de firma del cliente');
  });

  it.each([
    ['PHOTO', 'CUSTOMER_SIGNATURE', 'AVAILABLE', 'CUSTOMER_ACCEPTANCE_ARTIFACT_INVALID_TYPE'],
    ['SIGNATURE', 'OTHER_REQUIREMENT', 'AVAILABLE', 'CUSTOMER_ACCEPTANCE_ARTIFACT_INVALID_TYPE'],
    [
      'SIGNATURE',
      'CUSTOMER_SIGNATURE',
      'PENDING_ANALYSIS',
      'CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_AVAILABLE',
    ],
  ])(
    'rejects customer acceptance artifact with type %s, requirement %s and asset status %s',
    async (evidenceType, requirementKey, assetStatus, code) => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'eo-001',
            tenantId: 'tenant-001',
            taskId: null,
            ticketId: null,
            status: ExecutionOrderStatus.IN_PROGRESS,
            templateRequirementsSnapshot: [],
          })
          .mockResolvedValueOnce({
            executionOrderId: 'eo-001',
            tenantId: 'tenant-001',
            mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            evidenceType,
            requirementKey,
            assetStatus,
          }),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.NOT_EXECUTED,
            summary: 'Cierre con artefacto inválido',
            customerAcceptance: {
              artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              method: 'SIGNATURE',
            },
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code }),
      });
    },
  );

  it.each(['OTP', 'OTHER'] as const)(
    'rejects customer signature acceptance with non-canonical method %s',
    async (method) => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'eo-001',
            tenantId: 'tenant-001',
            status: ExecutionOrderStatus.IN_PROGRESS,
            templateRequirementsSnapshot: [],
          })
          .mockResolvedValueOnce({
            executionOrderId: 'eo-001',
            tenantId: 'tenant-001',
            mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            evidenceType: 'SIGNATURE',
            requirementKey: 'CUSTOMER_SIGNATURE',
            assetStatus: 'AVAILABLE',
          }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.NOT_EXECUTED,
            summary: 'Cierre con método no permitido',
            customerAcceptance: {
              artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              method,
            },
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CUSTOMER_ACCEPTANCE_METHOD_INVALID' }),
      });
    },
  );

  it('persists customer acceptance with canonical signature evidence fields', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'eo-001',
          tenantId: 'tenant-001',
          taskId: null,
          ticketId: null,
          status: ExecutionOrderStatus.IN_PROGRESS,
          templateRequirementsSnapshot: [],
        })
        .mockResolvedValueOnce({
          executionOrderId: 'eo-001',
          tenantId: 'tenant-001',
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          evidenceType: 'SIGNATURE',
          requirementKey: 'CUSTOMER_SIGNATURE',
          assetStatus: 'AVAILABLE',
        })
        .mockResolvedValueOnce({
          id: 'eo-001',
          tenantId: 'tenant-001',
          taskId: null,
          ticketId: null,
          status: ExecutionOrderStatus.IN_PROGRESS,
          templateRequirementsSnapshot: [],
        }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await service.close(
      'eo-001',
      {
        result: ExecutionOrderResult.NOT_EXECUTED,
        summary: 'Cierre con firma',
        customerAcceptance: {
          artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          method: 'SIGNATURE',
        },
      },
      actor,
    );

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        evidenceType: 'SIGNATURE',
        requirementKey: 'CUSTOMER_SIGNATURE',
        notes: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ evidenceType: 'CUSTOMER_SIGNATURE' }),
    );
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
        templateRequirementsSnapshot: [],
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
        summary: 'Cierre con ticket vinculado',
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
        templateRequirementsSnapshot: [],
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
        summary: 'No se pudo ejecutar. Reprogramar.',
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

  // ─── CA-00-01: BOLA (Broken Object Level Authorization) ────────────────

  describe('assertActorAccess (BOLA)', () => {
    it('deniega lectura a técnico no asignado', async () => {
      const techActor: JwtPayload = {
        sub: 'tech-002',
        email: 'other@example.test',
        role: UserRole.TECHNICIAN,
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-002',
        type: 'tenant',
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      // Un técnico no asignado debe recibir 404 (anti-enumeración)
      await expect(service.assertActorAccess('eo-001', techActor, true)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
    });

    it('deniega escritura a técnico no asignado', async () => {
      const techActor: JwtPayload = {
        sub: 'tech-002',
        email: 'other@example.test',
        role: UserRole.TECHNICIAN,
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-002',
        type: 'tenant',
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.assertActorAccess('eo-001', techActor, true)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
    });

    it('deniega lectura a supervisor de otro tenant con UUID conocido', async () => {
      // Tenant B intenta acceder a una OT de Tenant A
      const { TenantContext } = require('@iwana/db');
      (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
        tenantId: 'tenant-002',
        schemaName: 'tenant_002',
      });

      const manager = {
        findOne: jest.fn().mockResolvedValue(null), // No existe en tenant-002
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.assertActorAccess('eo-001', actor, false)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
    });

    it('permite lectura a supervisor del mismo tenant', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.assertActorAccess('eo-001', actor, false)).resolves.toBeUndefined();
    });

    it('deniega escritura a supervisor', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      // Los supervisores pueden leer pero no escribir
      await expect(service.assertActorAccess('eo-001', actor, true)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
    });

    it.each([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT])(
      'deniega ejecución técnica a %s aunque esté asignado',
      async (role) => {
        const assignedSupervisor: JwtPayload = { ...actor, role };
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            assignedTechnicianId: assignedSupervisor.sub,
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.assertActorAccess('eo-001', assignedSupervisor, true, true),
        ).rejects.toThrow('OT de ejecución no encontrada');
      },
    );

    it.each([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT])(
      'permite lectura a %s sin convertirla en ejecución técnica',
      async (role) => {
        const supervisor: JwtPayload = { ...actor, role };
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            assignedTechnicianId: 'tech-001',
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.assertActorAccess('eo-001', supervisor, false, false),
        ).resolves.toBeUndefined();
      },
    );

    it('permite escritura de coordinación a un supervisor sin asignación técnica', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.assertActorAccess('eo-001', actor, true, false),
      ).resolves.toBeUndefined();
    });

    it('permite escritura a técnico asignado', async () => {
      const techActor: JwtPayload = {
        sub: 'tech-001',
        email: 'tech@example.test',
        role: UserRole.TECHNICIAN,
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-001',
        type: 'tenant',
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.assertActorAccess('eo-001', techActor, true)).resolves.toBeUndefined();
    });

    it('devuelve 404 uniforme en lugar de 403 para evitar enumeración de UUID', async () => {
      const techActor: JwtPayload = {
        sub: 'tech-002',
        email: 'other@example.test',
        role: UserRole.TECHNICIAN,
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-002',
        type: 'tenant',
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          assignedTechnicianId: 'tech-001',
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      // Tanto para write como para read de un técnico no asignado, debe ser 404
      await expect(service.assertActorAccess('eo-001', techActor, true)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
      await expect(service.assertActorAccess('eo-001', techActor, false)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
    });
  });

  // ─── CA-00-03: Terminal Immutability ────────────────────────────────────

  describe('inmutabilidad de estados terminales', () => {
    const terminalStates = [
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ];

    terminalStates.forEach((status) => {
      it(`rechaza registro de actividad sobre estado ${status}`, async () => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            status,
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.registerFieldWork(
            'eo-001',
            {
              activityType: 'INSTALLATION',
              description: 'Intento post-cierre',
            },
            actor,
          ),
        ).rejects.toThrow('La OT está en un estado terminal.');
      });

      it(`rechaza consumo de material sobre estado ${status}`, async () => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            status,
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.registerItemUsage(
            'eo-001',
            {
              itemId: 'item-001',
              technicianCustodyId: 'cust-001',
              quantity: 1,
              action: ExecutionOrderItemAction.INSTALL,
              finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
            },
            actor,
          ),
        ).rejects.toThrow('La OT está en un estado terminal.');
      });

      it(`rechaza cierre sobre estado ${status}`, async () => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            status,
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.close(
            'eo-001',
            {
              result: ExecutionOrderResult.EXECUTED,
              summary: 'Segundo cierre',
              closeNotes: 'Segundo cierre',
            },
            actor,
          ),
        ).rejects.toThrow('La OT está en un estado terminal.');
      });

      it(`rechaza reasignación sobre estado ${status}`, async () => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            status,
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.assign(
            'eo-001',
            {
              assigneeType: 'TECHNICIAN',
              assigneeId: 'tech-003',
            },
            actor,
          ),
        ).rejects.toThrow('La OT está en un estado terminal.');
      });

      it(`rechaza bloqueo sobre estado ${status}`, async () => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'eo-001',
            tenantId: 'tenant-001',
            status,
          }),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.block('eo-001', { reasonCode: 'MATERIAL_MISSING' }, actor),
        ).rejects.toThrow('La OT está en un estado terminal.');
      });
    });

    it('rechaza inicio sobre estado terminal', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          status: ExecutionOrderStatus.COMPLETED,
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.start('eo-001', { note: 'Reinicio' }, actor)).rejects.toThrow(
        'La OT está en un estado terminal.',
      );
    });

    it('cierra correctamente una OT en progreso (no terminal)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          taskId: null,
          ticketId: null,
          status: ExecutionOrderStatus.IN_PROGRESS,
          templateRequirementsSnapshot: [],
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
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.EXECUTED,
            summary: 'Cierre normal',
            closeNotes: 'Cierre normal',
          },
          actor,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── CA-00-04: Concurrent Close & Idempotency ──────────────────────────

  describe('cierre concurrente e idempotencia', () => {
    it('dos cierres concurrentes producen exactamente un resultado terminal', async () => {
      // Simula una carrera: ambas transacciones leen la OT en IN_PROGRESS
      const order = {
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 1,
        taskId: null,
        ticketId: null,
        result: null,
        startedAt: null,
        closedAt: null,
        closeNotes: null,
        updatedByUserId: null,
        templateRequirementsSnapshot: [],
      };

      // Primera transacción: éxito (actualiza versión 1 → 2)
      const manager1 = {
        findOne: jest.fn().mockResolvedValue({ ...order }),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => payload),
        create: jest.fn((_entity, payload) => payload),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager: manager1 } as never),
      );

      await service.close(
        'eo-001',
        {
          result: ExecutionOrderResult.EXECUTED,
          summary: 'Primer cierre',
          closeNotes: 'Primer cierre',
        },
        actor,
      );

      // Segunda transacción: aún ve IN_PROGRESS (versión 1), pero actualización falla
      const manager2 = {
        findOne: jest.fn().mockResolvedValue({ ...order }),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 0 }), // Carrera: versión ya cambió
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => payload),
        create: jest.fn((_entity, payload) => payload),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager: manager2 } as never),
      );

      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.EXECUTED,
            summary: 'Segundo cierre concurrente',
            closeNotes: 'Segundo cierre concurrente',
          },
          actor,
        ),
      ).rejects.toThrow('La OT fue modificada por otro actor.');
    });

    it('rechaza cierre sin idempotency-key ni if-match', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          status: ExecutionOrderStatus.IN_PROGRESS,
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      // El controlador envía requireIdempotency: true por defecto
      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.EXECUTED,
            summary: 'Sin idempotency',
            closeNotes: 'Sin idempotency',
          },
          actor,
          {
            requireIdempotency: true,
            correlationId: '00000000-0000-4000-8000-000000000001',
          },
        ),
      ).rejects.toThrow('Idempotency-Key es obligatorio.');
    });

    it('rechaza cierre con idempotency-key pero sin if-match', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          status: ExecutionOrderStatus.IN_PROGRESS,
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.EXECUTED,
            summary: 'Con idempotency-key sin if-match',
            closeNotes: 'Con idempotency-key sin if-match',
          },
          actor,
          {
            requireIdempotency: true,
            idempotencyKey: 'close-key-00000001',
            correlationId: '00000000-0000-4000-8000-000000000001',
          },
        ),
      ).rejects.toThrow('If-Match es obligatorio.');
    });

    it('rechaza if-match con versión desactualizada explícitamente', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'eo-001',
          tenantId: 'tenant-001',
          status: ExecutionOrderStatus.IN_PROGRESS,
          version: 3,
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.EXECUTED,
            summary: 'Versión desactualizada',
            closeNotes: 'Versión desactualizada',
          },
          actor,
          {
            idempotencyKey: 'close-key-00000002',
            ifMatch: '1', // La OT está en version 3
            correlationId: '00000000-0000-4000-8000-000000000001',
          },
        ),
      ).rejects.toThrow('La OT fue modificada por otro actor.');
    });
  });

  // ─── OBS-02: Generación de números consecutivos de OT ──────────────────

  describe('generación de número de OT', () => {
    const buildSchedulingInput = () => ({
      visitRequestId: '11111111-1111-4111-8111-111111111111',
      scheduleEventId: '22222222-2222-4222-8222-222222222222',
      assignedTechnicianId: '33333333-3333-4333-8333-333333333333',
      originContext: 'TASKS' as const,
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
    });

    it('genera números consecutivos para dos OTs creadas en secuencia', async () => {
      // Simulamos que no hay OTs previas para el tenant
      const makeManager = () => ({
        findOne: jest.fn().mockResolvedValue(null),
        query: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null), // Sin OT previa → seq 001
          getMany: jest.fn().mockResolvedValue([]),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => ({
          id: 'eo-001',
          ...payload,
        })),
      });

      // Primera OT: sin registros previos → OTE-YYYYMMDD-001
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
        fn({ manager: makeManager() } as never),
      );

      const ot1 = await service.createFromScheduling(buildSchedulingInput(), actor);

      // Verificar que el número termina en 001
      expect(ot1.executionOrderNumber).toMatch(/^OTE-\d{8}-001$/);
      const prefix = ot1.executionOrderNumber.replace(/-001$/, '');

      // Segunda OT: simulamos que ya existe la primera
      const manager2 = makeManager();
      // El getOne para la consulta de numeración debe devolver la OT anterior
      (manager2.createQueryBuilder as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ executionOrderNumber: ot1.executionOrderNumber }),
        getMany: jest.fn().mockResolvedValue([]),
      });

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
        fn({ manager: manager2 } as never),
      );

      const ot2 = await service.createFromScheduling(buildSchedulingInput(), actor);

      // Verificar que el segundo número es consecutivo (002)
      expect(ot2.executionOrderNumber).toBe(`${prefix}-002`);

      // Verificar que son diferentes
      expect(ot1.executionOrderNumber).not.toBe(ot2.executionOrderNumber);
    });

    it('genera números independientes por tenant (tenant-scoped)', async () => {
      const { TenantContext } = require('@iwana/db');

      // ── Tenant A (tenant-001): sin OTs previas → 001 ──
      (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
      });

      const managerA = {
        findOne: jest.fn().mockResolvedValue(null),
        query: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
          getMany: jest.fn().mockResolvedValue([]),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => ({
          id: 'eo-tenant-a',
          ...payload,
        })),
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
        fn({ manager: managerA } as never),
      );

      const otTenantA = await service.createFromScheduling(buildSchedulingInput(), actor);
      expect(otTenantA.executionOrderNumber).toMatch(/^OTE-\d{8}-001$/);

      // ── Tenant B (tenant-002): sin OTs previas → 001 (independiente) ──
      (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
        tenantId: 'tenant-002',
        schemaName: 'tenant_002',
      });

      const managerB = {
        findOne: jest.fn().mockResolvedValue(null),
        query: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null), // Sin OTs en tenant B
          getMany: jest.fn().mockResolvedValue([]),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest.fn().mockImplementation(async (_entity, payload) => ({
          id: 'eo-tenant-b',
          ...payload,
        })),
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
        fn({ manager: managerB } as never),
      );

      const otTenantB = await service.createFromScheduling(buildSchedulingInput(), actor);

      // Ambos tenants comienzan desde 001
      expect(otTenantB.executionOrderNumber).toMatch(/^OTE-\d{8}-001$/);

      // Los números son idénticos pero pertenecen a tenants diferentes
      expect(otTenantA.executionOrderNumber).toBe(otTenantB.executionOrderNumber);
    });

    it('reintenta una transacción nueva si el consecutivo colisiona con 23505', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        query: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        }),
        create: jest.fn((_entity, payload) => payload),
        save: jest
          .fn()
          .mockRejectedValueOnce({
            driverError: {
              code: '23505',
              constraint: 'uq_execution_orders_tenant_number',
            },
          })
          .mockImplementation(async (_entity, payload) => ({ id: 'eo-retried', ...payload })),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const result = await service.createFromScheduling(buildSchedulingInput(), actor);

      expect(result.id).toBe('eo-retried');
      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ExecutionOrdersService — redrive y seguimiento', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-support',
    type: 'tenant',
  };
  const context = {
    idempotencyKey: 'operation-key-0001',
    requireIdempotency: true,
    requireIfMatch: false,
    correlationId: '00000000-0000-4000-8000-000000000001',
  };

  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    const { TenantContext } = require('@iwana/db') as {
      TenantContext: { getOrThrow: jest.Mock };
    };
    TenantContext.getOrThrow.mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' });
    jest.clearAllMocks();
  });

  it('reencola un evento DLQ conservando eventId/correlationId y limpia el marcador terminal', async () => {
    const event = {
      id: 'outbox-row-001',
      eventId: '11111111-1111-4111-8111-111111111111',
      tenantId: 'tenant-001',
      aggregateId: 'eo-001',
      aggregateVersion: 4,
      eventType: 'ExecutionOrderClosedV1',
      payload: { executionOrderId: 'eo-001' },
      correlationId: '22222222-2222-4222-8222-222222222222',
      lastError: 'consumer failed',
    };
    const order = {
      id: 'eo-001',
      tenantId: 'tenant-001',
      organizationSiteId: 'site-001',
      ticketId: 'ticket-001',
    };
    const updateExecute = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(event).mockResolvedValueOnce(order),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: updateExecute,
      }),
    };
    const reliability = {
      beginIdempotent: jest.fn().mockResolvedValue({
        intentId: 'intent-redrive-001',
        replay: false,
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      }),
      completeIdempotency: jest.fn().mockResolvedValue(undefined),
      appendAuditIntent: jest.fn().mockResolvedValue(undefined),
    };
    const organizationAccess = { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true) };
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      organizationAccess as never,
    );
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.redriveEvent(
        event.eventId,
        { causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' },
        actor,
        context,
      ),
    ).resolves.toEqual({
      eventId: event.eventId,
      correlationId: event.correlationId,
      status: 'QUEUED',
    });

    expect(reliability.beginIdempotent).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      'execution_event.redrive',
      context.idempotencyKey,
      expect.objectContaining({
        payload: expect.objectContaining({
          eventId: event.eventId,
          eventType: event.eventType,
          causeCode: 'DELIVERY_TIMEOUT',
          ticketId: 'ticket-001',
        }),
      }),
    );
    expect(updateExecute).toHaveBeenCalledTimes(2);
    expect(reliability.appendAuditIntent).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        operation: 'execution_event.redrive',
        resourceRef: event.eventId,
        correlationId: context.correlationId,
      }),
    );
  });

  it('redrive repetido con la misma clave devuelve replay sin reencolar ni auditar otra vez', async () => {
    const event = {
      id: 'outbox-row-002',
      eventId: '33333333-3333-4333-8333-333333333333',
      tenantId: 'tenant-001',
      aggregateId: 'eo-002',
      aggregateVersion: 5,
      eventType: 'ExecutionOrderClosedV1',
      payload: { executionOrderId: 'eo-002' },
      correlationId: '44444444-4444-4444-8444-444444444444',
      lastError: 'consumer failed',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(event).mockResolvedValueOnce({
        id: 'eo-002',
        tenantId: 'tenant-001',
        organizationSiteId: 'site-001',
        ticketId: 'ticket-001',
      }),
    };
    const reliability = {
      beginIdempotent: jest.fn().mockResolvedValue({
        intentId: 'intent-redrive-002',
        replay: true,
        resourceRef: event.eventId,
        resultStatus: 'COMPLETED',
        resourceVersion: event.aggregateVersion,
      }),
      completeIdempotency: jest.fn(),
      appendAuditIntent: jest.fn(),
    };
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true) } as never,
    );
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.redriveEvent(
        event.eventId,
        { causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' },
        actor,
        context,
      ),
    ).resolves.toEqual({
      eventId: event.eventId,
      correlationId: event.correlationId,
      status: 'QUEUED',
    });
    expect(reliability.completeIdempotency).not.toHaveBeenCalled();
    expect(reliability.appendAuditIntent).not.toHaveBeenCalled();
  });

  it('rechaza redrive de un evento que no está en DLQ', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'outbox-row-003',
        eventId: '55555555-5555-4555-8555-555555555555',
        tenantId: 'tenant-001',
        aggregateId: 'eo-003',
        aggregateVersion: 2,
        eventType: 'ExecutionOrderClosedV1',
        payload: { executionOrderId: 'eo-003' },
        correlationId: '66666666-6666-4666-8666-666666666666',
        lastError: null,
      }),
    };
    const reliability = {
      beginIdempotent: jest.fn().mockResolvedValue({
        intentId: 'intent-redrive-003',
        replay: false,
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      }),
    };
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true) } as never,
    );
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.redriveEvent(
        '55555555-5555-4555-8555-555555555555',
        { causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ response: { code: 'EVENT_NOT_IN_DLQ' } });
  });

  it('crea un seguimiento idempotente y publica ExecutionOrderFollowUpRequiredV1', async () => {
    const order = {
      id: 'eo-001',
      tenantId: 'tenant-001',
      status: ExecutionOrderStatus.COMPLETED,
      version: 3,
      organizationSiteId: 'site-001',
    };
    const savedPayloads: unknown[] = [];
    const manager = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        savedPayloads.push(payload);
        return payload;
      }),
    };
    const reliability = {
      beginIdempotent: jest.fn().mockResolvedValue({
        intentId: 'intent-followup-001',
        replay: false,
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      }),
      completeIdempotency: jest.fn().mockResolvedValue(undefined),
      appendAuditIntent: jest.fn().mockResolvedValue(undefined),
      appendOutbox: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true) } as never,
    );
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.createFollowUp(
      order.id,
      { reasonCode: 'REVISIT_REQUIRED' },
      actor,
      { ...context, idempotencyKey: 'follow-up-key-0001' },
    );

    expect(result).toMatchObject({
      intentId: 'intent-followup-001',
      status: 'ACCEPTED',
      version: 4,
    });
    expect(result.resourceRef).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(reliability.appendOutbox).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        aggregateId: order.id,
        aggregateVersion: 4,
        eventType: 'ExecutionOrderFollowUpRequiredV1',
        correlationId: context.correlationId,
        payload: expect.objectContaining({
          executionOrderId: order.id,
          followUpId: result.resourceRef,
          reasonCode: 'REVISIT_REQUIRED',
        }),
      }),
    );
    expect(savedPayloads[0]).toMatchObject({ version: 4 });
  });

  it('rechaza seguimiento sobre una OT activa que no está bloqueada', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        organizationSiteId: 'site-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 1,
      }),
    };
    const reliability = {
      beginIdempotent: jest.fn().mockResolvedValue({
        intentId: 'intent-followup-002',
        replay: false,
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      }),
    };
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(true) } as never,
    );
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.createFollowUp('eo-001', { reasonCode: 'REVISIT_REQUIRED' }, actor, {
        ...context,
        idempotencyKey: 'follow-up-key-0002',
      }),
    ).rejects.toMatchObject({ response: { code: 'FOLLOW_UP_NOT_ALLOWED' } });
  });

  it('rechaza eventos DLQ cuyo owner no es MOD11', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'outbox-row-foreign',
        eventId: '77777777-7777-4777-8777-777777777777',
        tenantId: 'tenant-001',
        aggregateId: 'eo-foreign',
        aggregateVersion: 1,
        eventType: 'VisitCancelledV1',
        payload: { executionOrderId: 'eo-foreign' },
        correlationId: '88888888-8888-4888-8888-888888888888',
        lastError: 'consumer failed',
      }),
    };
    const service = new ExecutionOrdersService({} as DataSource);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.redriveEvent(
        '77777777-7777-4777-8777-777777777777',
        { causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' },
        actor,
        context,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('falla cerrado si la asignación de supervisión fue revocada antes del comando', async () => {
    const event = {
      id: 'outbox-row-revoked',
      eventId: '99999999-9999-4999-8999-999999999999',
      tenantId: 'tenant-001',
      aggregateId: 'eo-revoked',
      aggregateVersion: 2,
      eventType: 'ExecutionOrderClosedV1',
      payload: { executionOrderId: 'eo-revoked' },
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lastError: 'consumer failed',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(event).mockResolvedValueOnce({
        id: 'eo-revoked',
        tenantId: 'tenant-001',
        organizationSiteId: 'site-revoked',
        ticketId: 'ticket-001',
      }),
      createQueryBuilder: jest.fn(),
    };
    const reliability = { beginIdempotent: jest.fn() };
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliability as never,
      undefined,
      undefined,
      undefined,
      { canSuperviseExecutionOrder: jest.fn().mockResolvedValue(false) } as never,
    );
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.redriveEvent(
        event.eventId,
        { causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' },
        actor,
        context,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reliability.beginIdempotent).not.toHaveBeenCalled();
  });
});
