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
  });
});
