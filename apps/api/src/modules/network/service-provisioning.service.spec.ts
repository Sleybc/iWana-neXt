import { DataSource } from 'typeorm';
import {
  IpAssignment,
  Ipv4Network,
  NetworkRouter,
  runInTenantSchema,
  ServiceProvisioning,
} from '@iwana/db';
import {
  AccessPermissionKey,
  ExecutionOrderStatus,
  ExecutionOrderResult,
  UserRole,
  WfmWorkType,
  RegularizeProvisioningBodySchema,
} from '@iwana/shared';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ExecutionOrderReadPort,
  type ExecutionSnapshot,
} from '../tasks/ports/execution-order-read.port';
import { InstalledEquipmentReadPort } from '../inventory/ports/installed-equipment-read.port';
import { SubscriberServiceContextReadPort } from '../crm/ports/subscriber-service-context-read.port';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { ServiceProvisioningService } from './service-provisioning.service';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const actor: JwtPayload = {
  sub: 'noc-001',
  email: 'noc@example.test',
  role: UserRole.NOC,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-001',
  type: 'tenant',
};

function createService(overrides?: {
  executionOrderReadPort?: Partial<ExecutionOrderReadPort>;
  subscriberContextPort?: Partial<SubscriberServiceContextReadPort>;
  installedEquipmentReadPort?: Partial<InstalledEquipmentReadPort>;
  permissions?: AccessPermissionKey[];
}) {
  const executionOrderReadPort = {
    getExecutionSnapshot: jest.fn(),
    getExecutionSnapshots: jest.fn(),
    hasEvidence: jest.fn(),
    listInstallationOrders: jest.fn(),
    hasOpenWithdrawalOrders: jest.fn(),
    ...overrides?.executionOrderReadPort,
  };
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
    operation({ manager } as never),
  );
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest.fn().mockResolvedValue(overrides?.permissions ?? []),
  };
  const routerProvisioningPort = {
    apply: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
    remove: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
    suspend: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
    sync: jest.fn().mockResolvedValue({ supported: false }),
  };
  const service = new ServiceProvisioningService(
    {} as DataSource,
    { logWithin: jest.fn() } as never,
    { reserveIp: jest.fn() } as never,
    executionOrderReadPort as unknown as ExecutionOrderReadPort,
    {
      getForSubscriber: jest.fn().mockResolvedValue(null),
      ...overrides?.subscriberContextPort,
    } as unknown as SubscriberServiceContextReadPort,
    {
      getFirstInstalledAtCustomer: jest.fn().mockResolvedValue(null),
      ...overrides?.installedEquipmentReadPort,
    } as unknown as InstalledEquipmentReadPort,
    { findByIds: jest.fn().mockResolvedValue([]) } as unknown as NetworkActorReadPort,
    effectivePermissionsService as never,
    routerProvisioningPort as never,
    { emitAsync: jest.fn().mockResolvedValue([]) } as never,
  );
  return {
    service,
    manager,
    executionOrderReadPort,
    effectivePermissionsService,
    routerProvisioningPort,
  };
}

const orderBase = (assignedTechnicianId: string | null): ExecutionSnapshot => ({
  id: 'eo-001',
  executionOrderNumber: 'OTE-20261022-001',
  status: ExecutionOrderStatus.IN_PROGRESS,
  workType: WfmWorkType.INSTALLATION,
  isAnnulled: false,
  subscriberId: 'subscriber-001',
  assignedTechnicianId,
  customerDisplayLabel: 'Suscriptor de prueba',
  closedAt: null,
  result: null,
});

const order = (
  assignedTechnicianId: string | null,
  overrides: Partial<ExecutionSnapshot> = {},
) => ({ ...orderBase(assignedTechnicianId), ...overrides });

const regularizeBody = RegularizeProvisioningBodySchema.parse({
  executionOrderId: '11111111-1111-4111-8111-111111111111',
  routerId: '22222222-2222-4222-8222-222222222222',
  ipv4NetworkId: '33333333-3333-4333-8333-333333333333',
  controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'subscribers' },
  reason: 'Servicio ejecutado antes de habilitar el aprovisionamiento.',
});

describe('ServiceProvisioningService B2 guardrails', () => {
  beforeEach(() => jest.clearAllMocks());

  it('R6 ter: no reserva si la OT no tiene técnico asignado', async () => {
    const { service, executionOrderReadPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order(null)),
      },
    });

    await expect(
      service.reserve(
        {
          executionOrderId: 'eo-001',
          routerId: 'router-001',
          ipv4NetworkId: 'network-001',
          controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'subscribers' },
        },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' }),
    });
    expect(executionOrderReadPort.getExecutionSnapshot).toHaveBeenCalledWith('eo-001');
    expect(runInTenant).not.toHaveBeenCalled();
  });

  it('R6 ter: no certifica cuando la OT no tiene técnico asignado', async () => {
    const { service, manager, executionOrderReadPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order(null)),
      },
    });
    manager.findOne.mockResolvedValue({
      id: 'provisioning-001',
      tenantId: 'tenant-001',
      executionOrderId: 'eo-001',
      version: 3,
      status: 'RESERVED',
    });

    await expect(
      service.certify('provisioning-001', { evidenceId: 'evidence-001', version: 3 }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' }),
    });
    expect(executionOrderReadPort.hasEvidence).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('R6 bis: liberar un servicio CERTIFIED requiere permiso de certificar', async () => {
    const { service, manager, executionOrderReadPort, effectivePermissionsService } = createService(
      {
        permissions: [AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE],
      },
    );
    manager.findOne.mockResolvedValue({
      id: 'provisioning-001',
      tenantId: 'tenant-001',
      executionOrderId: 'eo-001',
      version: 3,
      status: 'CERTIFIED',
    });

    await expect(
      service.release(
        'provisioning-001',
        { version: 3, reason: 'Corrección operativa válida' },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    expect(effectivePermissionsService.getEffectivePermissionsForUser).toHaveBeenCalledWith(
      actor.sub,
    );
    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('construye al técnico solo la proyección pública de cinco campos', async () => {
    const { service, manager } = createService({
      permissions: [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ],
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order(actor.sub)),
      },
    });
    manager.findOne.mockResolvedValue(null);

    const response = await service.getOrderContext('eo-001', actor);

    expect(Object.keys(response).sort()).toEqual([
      'certified',
      'executionOrderId',
      'ip',
      'status',
      'updatedAt',
    ]);
    expect(response).toEqual({
      executionOrderId: 'eo-001',
      status: null,
      ip: null,
      certified: false,
      updatedAt: null,
    });
  });

  it('regularize rechaza una OT que no es instalación ejecutada y cerrada', async () => {
    const { service } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order(actor.sub, {
            status: ExecutionOrderStatus.IN_PROGRESS,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
    });

    await expect(service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
    expect(runInTenant).not.toHaveBeenCalled();
  });

  it('regularize rechaza una OT sin técnico antes de abrir transacción', async () => {
    const { service } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order(null, {
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
    });

    await expect(service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' }),
    });
    expect(runInTenant).not.toHaveBeenCalled();
  });

  it('regularize aplica maker-checker contra el técnico asignado', async () => {
    const { service } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order(actor.sub, {
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
    });

    await expect(service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_CERTIFIER_IS_EXECUTOR' }),
    });
    expect(runInTenant).not.toHaveBeenCalled();
  });

  it('regularize rechaza un servicio activo con una petición distinta', async () => {
    const active = {
      id: '44444444-4444-4444-8444-444444444444',
      status: 'ACTIVE',
      origin: 'NORMAL',
      regularizationReason: null,
      routerId: regularizeBody.routerId,
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      controlParams: regularizeBody.controlParams,
    };
    const { service, manager } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order('technician-001', {
            id: regularizeBody.executionOrderId,
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
    });
    manager.findOne.mockResolvedValueOnce(active).mockResolvedValueOnce(null);

    await expect(service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ALREADY_ACTIVE' }),
    });
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`provisioning-order:${regularizeBody.executionOrderId}`],
    );
  });

  it('regularize repite la misma petición activa de forma idempotente y vuelve a emitir activación', async () => {
    const active = {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: 'tenant-001',
      subscriberId: '55555555-5555-4555-8555-555555555555',
      expedienteId: null,
      contractId: null,
      executionOrderId: regularizeBody.executionOrderId,
      executionOrderNumber: 'OTE-20261022-001',
      routerId: regularizeBody.routerId,
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      controlMethod: regularizeBody.controlParams.method,
      controlParams: regularizeBody.controlParams,
      planId: null,
      downloadMbps: null,
      uploadMbps: null,
      cpeSerialNumber: null,
      cpeMacAddress: null,
      status: 'ACTIVE',
      origin: 'REGULARIZED',
      regularizationReason: regularizeBody.reason,
      regularizedBy: actor.sub,
      regularizedAt: new Date(),
      activatedAt: new Date(),
      reservedBy: null,
      reservedAt: null,
      certifiedBy: null,
      certifiedAt: null,
      certificationEvidenceId: null,
      releasedBy: null,
      releasedAt: null,
      releaseReason: null,
      failureReason: null,
      commercialActivationStatus: 'PENDING',
      commercialActivationDetail: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const assignment = {
      id: '66666666-6666-4666-8666-666666666666',
      tenantId: 'tenant-001',
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      ip: '192.0.2.18',
      serviceProvisioningId: active.id,
      status: 'ACTIVE',
      releasedAt: null,
      releaseReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { service, manager } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order('technician-001', {
            id: regularizeBody.executionOrderId,
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
    });
    let activeLookups = 0;
    let maxConcurrentLookups = 0;
    manager.findOne.mockImplementation(async (entity) => {
      activeLookups += 1;
      maxConcurrentLookups = Math.max(maxConcurrentLookups, activeLookups);
      await Promise.resolve();
      activeLookups -= 1;
      if (entity === ServiceProvisioning) return active as never;
      if (entity === IpAssignment) return assignment as never;
      if (entity === NetworkRouter) return { id: regularizeBody.routerId, name: 'Router' } as never;
      if (entity === Ipv4Network)
        return { id: regularizeBody.ipv4NetworkId, name: 'Red', cidr: '192.0.2.0/24' } as never;
      return null;
    });

    const response = await service.regularize(regularizeBody, actor);

    expect(response.id).toBe(active.id);
    expect(response.status).toBe('ACTIVE');
    expect(manager.save).not.toHaveBeenCalled();
    expect(maxConcurrentLookups).toBe(1);
  });
});
