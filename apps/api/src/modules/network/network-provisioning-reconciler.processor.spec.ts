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
  dataSourceQuery?: jest.Mock;
  manager?: Record<string, jest.Mock>;
  snapshots?: ExecutionSnapshot[];
}) {
  const dataSource = {
    query: input?.dataSourceQuery ?? jest.fn().mockResolvedValue([tenant]),
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
  const processor = new NetworkProvisioningReconcilerProcessor(
    dataSource,
    queue as never,
    executionOrderReadPort as never,
    auditService as never,
    eventEmitter as never,
  );
  return {
    processor,
    dataSource,
    queue,
    manager,
    executionOrderReadPort,
    auditService,
    eventEmitter,
  };
}

describe('NetworkProvisioningReconcilerProcessor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registra una repetición determinista por cada tenant activo', async () => {
    const dataSourceQuery = jest
      .fn()
      .mockResolvedValue([tenant, { ...tenant, schema_name: 'invalid schema' }]);
    const { processor, queue } = createProcessor({ dataSourceQuery });

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
});
