import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('../services/tasks.service', () => ({ TasksService: class TasksService {} }));
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
}));

const actor: JwtPayload = {
  sub: 'noc-001',
  email: 'noc@example.test',
  role: UserRole.NOC,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-001',
  type: 'tenant',
};

const provisioningPort = { getGateStatus: jest.fn() };
const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

function createManager() {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const order = {
    id: 'eo-001',
    tenantId: 'tenant-001',
    organizationSiteId: 'site-001',
    workType: WfmWorkType.INSTALLATION,
    status: ExecutionOrderStatus.IN_PROGRESS,
    version: 1,
    result: null,
    startedAt: null,
    closedAt: null,
    closeNotes: null,
    updatedByUserId: null,
    taskId: null,
    ticketId: null,
    templateRequirementsSnapshot: [
      {
        key: 'service-provisioning',
        label: 'Aprovisionamiento certificado',
        required: true,
        kind: 'PROVISIONING',
      },
    ],
  };
  const manager = {
    findOne: jest.fn().mockResolvedValue(order),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    save: jest.fn().mockImplementation(async (_entity, value) => value),
    query: jest.fn().mockResolvedValue([]),
  };
  return { manager, order, queryBuilder };
}

describe('ExecutionOrdersService provisioning closure gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['CERTIFIED', 'RESERVED', null] as const)(
    'blocks an executed installation when enforcement is on and status is %s',
    async (status) => {
      const { manager } = createManager();
      runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
        operation({ manager } as never),
      );
      provisioningPort.getGateStatus.mockResolvedValue({ enforced: true, status });
      const service = new ExecutionOrdersService(
        {} as DataSource,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        new ClosureGateEvaluatorService(),
        undefined,
        undefined,
        undefined,
        provisioningPort as never,
      );

      if (status === 'CERTIFIED') {
        // A certified provisioning is the only satisfied state; continue to
        // the ordinary close path, which is covered by the tasks suite.
        await expect(
          service.close(
            'eo-001',
            { result: ExecutionOrderResult.EXECUTED, summary: 'Instalación lista' },
            actor,
          ),
        ).resolves.toMatchObject({ status: ExecutionOrderStatus.COMPLETED });
      } else {
        await expect(
          service.close(
            'eo-001',
            { result: ExecutionOrderResult.EXECUTED, summary: 'Instalación sin certificar' },
            actor,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'CLOSURE_GATE_INCOMPLETE',
            missingRequirements: ['Aprovisionamiento certificado'],
          }),
        });
      }
      expect(provisioningPort.getGateStatus).toHaveBeenCalledTimes(1);
    },
  );

  it('permits an executed installation when the gate is disabled', async () => {
    const { manager } = createManager();
    runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
      operation({ manager } as never),
    );
    provisioningPort.getGateStatus.mockResolvedValue({ enforced: false, status: null });
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new ClosureGateEvaluatorService(),
      undefined,
      undefined,
      undefined,
      provisioningPort as never,
    );

    await expect(
      service.close(
        'eo-001',
        { result: ExecutionOrderResult.EXECUTED, summary: 'Instalación sin gate' },
        actor,
      ),
    ).resolves.toMatchObject({ status: ExecutionOrderStatus.COMPLETED });
    expect(provisioningPort.getGateStatus).toHaveBeenCalledTimes(1);
  });

  it('does not consult MOD13 when an installation is closed as NOT_EXECUTED', async () => {
    const { manager } = createManager();
    const inventoryService = { getItemCategoryReceipt: jest.fn() };
    runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
      operation({ manager } as never),
    );
    const service = new ExecutionOrdersService(
      {} as DataSource,
      inventoryService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      new ClosureGateEvaluatorService(),
      undefined,
      undefined,
      undefined,
      provisioningPort as never,
    );

    await expect(
      service.close(
        'eo-001',
        {
          result: ExecutionOrderResult.NOT_EXECUTED,
          reasonCode: 'CUSTOMER_UNAVAILABLE',
          summary: 'Sin ejecución',
        },
        actor,
      ),
    ).resolves.toMatchObject({ status: ExecutionOrderStatus.NOT_EXECUTED });
    expect(provisioningPort.getGateStatus).not.toHaveBeenCalled();
    expect(inventoryService.getItemCategoryReceipt).not.toHaveBeenCalled();
  });

  it.each([undefined, '   '])(
    'requires a non-empty reason for NOT_EXECUTED before opening the transaction (%s)',
    async (reasonCode) => {
      const service = new ExecutionOrdersService({} as DataSource);
      await expect(
        service.close(
          'eo-001',
          {
            result: ExecutionOrderResult.NOT_EXECUTED,
            reasonCode,
            summary: 'Sin ejecución',
          } as never,
          actor,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'CLOSE_NOT_EXECUTED_REASON_REQUIRED',
          message: 'Elige una causa para cerrar como no ejecutada.',
        },
      });
      expect(runInTenant).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['CERTIFIED', true],
    ['RESERVED', false],
  ] as const)(
    'checks MOD13 for REQUIRES_FOLLOW_UP when status is %s',
    async (status, shouldClose) => {
      const { manager } = createManager();
      runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
        operation({ manager } as never),
      );
      provisioningPort.getGateStatus.mockResolvedValue({ enforced: true, status });
      const service = new ExecutionOrdersService(
        {} as DataSource,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        new ClosureGateEvaluatorService(),
        undefined,
        undefined,
        undefined,
        provisioningPort as never,
      );

      const close = service.close(
        'eo-001',
        { result: ExecutionOrderResult.REQUIRES_FOLLOW_UP, summary: 'Queda seguimiento' },
        actor,
      );
      if (shouldClose) {
        await expect(close).resolves.toMatchObject({
          status: ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
        });
      } else {
        await expect(close).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'CLOSURE_GATE_INCOMPLETE',
            missingRequirements: ['Aprovisionamiento certificado'],
          }),
        });
      }
      expect(provisioningPort.getGateStatus).toHaveBeenCalledTimes(1);
    },
  );

  it('blocks NOT_EXECUTED while an installed-equipment consumption remains active', async () => {
    const { manager, queryBuilder } = createManager();
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'usage-001',
        finalDisposition: 'INSTALLED_AT_CUSTOMER',
      },
    ] as never);
    runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
      operation({ manager } as never),
    );
    const service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new ClosureGateEvaluatorService(),
      undefined,
      undefined,
      undefined,
      provisioningPort as never,
    );

    await expect(
      service.close(
        'eo-001',
        {
          result: ExecutionOrderResult.NOT_EXECUTED,
          reasonCode: 'PARTIAL_EXECUTION',
          summary: 'Se revierte el equipo antes de cerrar.',
        },
        actor,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CLOSE_NOT_EXECUTED_HAS_INSTALLED_EQUIPMENT',
        message:
          'Hay equipos registrados como instalados en el cliente. Revierte esos consumos antes de cerrar como no ejecutada.',
      },
    });
    expect(provisioningPort.getGateStatus).not.toHaveBeenCalled();
  });
});
