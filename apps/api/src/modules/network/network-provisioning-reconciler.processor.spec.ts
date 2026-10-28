import { DataSource, EntityManager } from 'typeorm';
import {
  AuditAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  WfmWorkType,
} from '@iwana/shared';
import { ServiceProvisioning, runInTenantSchema } from '@iwana/db';
import { ExecutionSnapshot } from '../tasks/ports/execution-order-read.port';
import { AuditService } from '../audit/audit.service';
import { IpamService } from './ipam.service';
import {
  makeNetworkProvisioningReconcileJobId,
  NETWORK_PROVISIONING_RECONCILE_INTERVAL_MS,
  NETWORK_PROVISIONING_RECONCILE_JOB,
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
  NetworkProvisioningReconcilerProcessor,
} from './network-provisioning-reconciler.processor';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'fixture-tenant',
  schema_name: 'tenant_mod13_fixture',
};

function createProcessor(input?: {
  tenantLifecycleReadPort?: {
    listActiveTenantContexts: jest.Mock;
    findTenantLifecycleById: jest.Mock;
  };
  manager?: Record<string, jest.Mock>;
  snapshots?: ExecutionSnapshot[];
}) {
  const dataSource = {
    query: jest.fn(),
  } as unknown as DataSource;
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const manager = input?.manager ?? {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    query: jest.fn(),
  };
  runInTenant.mockImplementation(async (_source, _schema, operation) =>
    operation({ manager } as never),
  );
  const executionOrderReadPort = {
    getExecutionSnapshots: jest.fn().mockResolvedValue(input?.snapshots ?? []),
  };
  const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  const ipamService = {
    lockIpv4Pools: jest.fn().mockResolvedValue(undefined),
    assertActiveNetwork: jest.fn().mockResolvedValue(undefined),
    assertAssignmentNotLocallyProtected: jest.fn().mockResolvedValue(undefined),
  };
  const tenantLifecycleReadPort = input?.tenantLifecycleReadPort ?? {
    listActiveTenantContexts: jest.fn().mockResolvedValue([
      {
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schema_name,
        status: 'ACTIVE',
        deletedAt: null,
      },
    ]),
    findTenantLifecycleById: jest.fn().mockResolvedValue({
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
      status: 'ACTIVE',
      deletedAt: null,
    }),
  };
  const processor = new NetworkProvisioningReconcilerProcessor(
    dataSource,
    queue as never,
    executionOrderReadPort as never,
    auditService as never,
    eventEmitter as never,
    ipamService as unknown as IpamService,
    tenantLifecycleReadPort as never,
  );
  return {
    processor,
    dataSource,
    queue,
    manager,
    executionOrderReadPort,
    auditService,
    eventEmitter,
    tenantLifecycleReadPort,
  };
}

describe('NetworkProvisioningReconcilerProcessor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registra una repetición determinista por cada tenant activo', async () => {
    const tenantLifecycleReadPort = {
      listActiveTenantContexts: jest.fn().mockResolvedValue([
        {
          id: tenant.id,
          slug: tenant.slug,
          schemaName: tenant.schema_name,
          status: 'ACTIVE',
          deletedAt: null,
        },
        {
          id: tenant.id,
          slug: tenant.slug,
          schemaName: 'invalid schema',
          status: 'ACTIVE',
          deletedAt: null,
        },
      ]),
      findTenantLifecycleById: jest.fn(),
    };
    const { processor, queue } = createProcessor({ tenantLifecycleReadPort });

    await processor.onApplicationBootstrap();

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      NETWORK_PROVISIONING_RECONCILE_JOB,
      { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name },
      expect.objectContaining({
        jobId: makeNetworkProvisioningReconcileJobId(tenant.schema_name),
        repeat: { every: NETWORK_PROVISIONING_RECONCILE_INTERVAL_MS },
      }),
    );
    expect(NETWORK_PROVISIONING_RECONCILE_QUEUE).toBe('network-provisioning-reconcile');
  });

  it('obtiene tenants activos mediante el puerto del módulo Tenant', async () => {
    const tenantLifecycleReadPort = {
      listActiveTenantContexts: jest.fn().mockResolvedValue([
        {
          id: tenant.id,
          slug: tenant.slug,
          schemaName: tenant.schema_name,
          status: 'ACTIVE',
          deletedAt: null,
        },
      ]),
      findTenantLifecycleById: jest.fn(),
    };
    const { processor, dataSource } = createProcessor({ tenantLifecycleReadPort });

    await processor.onApplicationBootstrap();

    expect(tenantLifecycleReadPort.listActiveTenantContexts).toHaveBeenCalledTimes(1);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('rechaza el procesamiento si el tenant dejó de estar ACTIVE o fue eliminado', async () => {
    const tenantLifecycleReadPort = {
      listActiveTenantContexts: jest.fn(),
      findTenantLifecycleById: jest.fn().mockResolvedValue({
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schema_name,
        status: 'SUSPENDED',
        deletedAt: null,
      }),
    };
    const { processor } = createProcessor({ tenantLifecycleReadPort });

    await expect(
      processor.process({
        name: NETWORK_PROVISIONING_RECONCILE_JOB,
        data: { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name },
      } as never),
    ).rejects.toThrow();
    expect(tenantLifecycleReadPort.findTenantLifecycleById).toHaveBeenCalledWith(tenant.id);
  });

  it('marca FAILED una reserva de OT cerrada como ejecutada y audita dentro de la transacción', async () => {
    const service = {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: tenant.id,
      executionOrderId: '33333333-3333-4333-8333-333333333333',
      status: 'RESERVED',
      version: 1,
    } as ServiceProvisioning;
    const manager = {
      find: jest.fn().mockResolvedValue([service]),
      findOne: jest.fn().mockResolvedValue(service),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
      query: jest.fn().mockResolvedValue([]),
    };
    const snapshot: ExecutionSnapshot = {
      id: service.executionOrderId,
      executionOrderNumber: 'OTE-MOD13-0001',
      status: ExecutionOrderStatus.COMPLETED,
      workType: WfmWorkType.INSTALLATION,
      isAnnulled: false,
      subscriberId: '44444444-4444-4444-8444-444444444444',
      assignedTechnicianId: '55555555-5555-4555-8555-555555555555',
      customerDisplayLabel: 'Fixture',
      closedAt: new Date().toISOString(),
      result: ExecutionOrderResult.EXECUTED,
    };
    const { processor, auditService } = createProcessor({ manager, snapshots: [snapshot] });

    await processor.process({
      name: NETWORK_PROVISIONING_RECONCILE_JOB,
      data: { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name },
    } as never);

    expect(service.status).toBe('FAILED');
    expect(service.failureReason).toBe('CLOSED_WITHOUT_CERTIFICATION');
    expect(manager.save).toHaveBeenCalledWith(ServiceProvisioning, service);
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        newValue: expect.objectContaining({ action: 'FAIL', eventId: 'RECONCILED' }),
      }),
      manager,
    );
  });

  it('consulta todos los candidatos en lotes de máximo 100 órdenes', async () => {
    const executionOrderIds = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );
    const candidates = executionOrderIds.map((executionOrderId, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      tenantId: tenant.id,
      executionOrderId,
      status: 'RESERVED',
      version: 1,
    })) as ServiceProvisioning[];
    const snapshotsById = new Map<string, ExecutionSnapshot>(
      executionOrderIds.map((id, index) => [
        id,
        {
          id,
          executionOrderNumber: `OTE-MOD13-${String(index + 1).padStart(4, '0')}`,
          status: ExecutionOrderStatus.IN_PROGRESS,
          workType: WfmWorkType.INSTALLATION,
          isAnnulled: false,
          subscriberId: '44444444-4444-4444-8444-444444444444',
          assignedTechnicianId: '55555555-5555-4555-8555-555555555555',
          customerDisplayLabel: 'Fixture',
          closedAt: null,
          result: null,
        },
      ]),
    );
    const manager = {
      find: jest.fn().mockResolvedValue(candidates),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      query: jest.fn(),
    };
    const { processor, executionOrderReadPort } = createProcessor({ manager });
    executionOrderReadPort.getExecutionSnapshots.mockImplementation(async (ids: string[]) => {
      if (ids.length > 100) {
        throw new Error('La consulta admite máximo 100 órdenes de ejecución.');
      }
      return ids.flatMap((id) => {
        const snapshot = snapshotsById.get(id);
        return snapshot ? [snapshot] : [];
      });
    });

    await processor.process({
      name: NETWORK_PROVISIONING_RECONCILE_JOB,
      data: { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name },
    } as never);

    const requestedIds = executionOrderReadPort.getExecutionSnapshots.mock.calls.flatMap(
      ([ids]) => ids,
    );
    expect(
      executionOrderReadPort.getExecutionSnapshots.mock.calls.map(([ids]) => ids.length),
    ).toEqual([100, 1]);
    expect(requestedIds).toStrictEqual(executionOrderIds);
    expect(new Set(requestedIds).size).toBe(101);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
