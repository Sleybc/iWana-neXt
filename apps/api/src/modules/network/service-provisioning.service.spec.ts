import { ConflictException } from '@nestjs/common';
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
    findAndCount: jest.fn(),
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
  const ipamService = { reserveIp: jest.fn().mockResolvedValue('192.0.2.10') };
  const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const subscriberContextPort = {
    getForSubscriber: jest.fn().mockResolvedValue(null),
    ...overrides?.subscriberContextPort,
  };
  const installedEquipmentReadPort = {
    getFirstInstalledAtCustomer: jest.fn().mockResolvedValue(null),
    ...overrides?.installedEquipmentReadPort,
  };
  const actorReadPort = { findByIds: jest.fn().mockResolvedValue([]) };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  const service = new ServiceProvisioningService(
    {} as DataSource,
    auditService as never,
    ipamService as never,
    executionOrderReadPort as unknown as ExecutionOrderReadPort,
    subscriberContextPort as unknown as SubscriberServiceContextReadPort,
    installedEquipmentReadPort as unknown as InstalledEquipmentReadPort,
    actorReadPort as unknown as NetworkActorReadPort,
    effectivePermissionsService as never,
    routerProvisioningPort as never,
    eventEmitter as never,
  );
  return {
    service,
    manager,
    executionOrderReadPort,
    effectivePermissionsService,
    routerProvisioningPort,
    ipamService,
    auditService,
    subscriberContextPort,
    installedEquipmentReadPort,
    actorReadPort,
    eventEmitter,
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

const reserveBody = {
  executionOrderId: 'eo-001',
  routerId: 'router-001',
  ipv4NetworkId: 'network-001',
  controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'subscribers' },
};

const commercialContext = {
  expedienteId: 'expediente-001',
  planId: 'plan-001',
  downloadMbps: null as number | null,
  uploadMbps: null as number | null,
  contracts: [{ id: 'contract-001', alias: 'Principal', status: 'ACTIVE' as const }],
};

const reserveRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'provisioning-001',
  tenantId: 'tenant-001',
  subscriberId: 'subscriber-001',
  expedienteId: 'expediente-001',
  contractId: 'contract-001',
  executionOrderId: 'eo-001',
  executionOrderNumber: 'OTE-20261022-001',
  routerId: 'router-001',
  ipv4NetworkId: 'network-001',
  ipAssignmentId: 'assignment-001',
  controlMethod: 'PCQ_ADDRESS_LIST',
  controlParams: reserveBody.controlParams,
  planId: 'plan-001',
  downloadMbps: null,
  uploadMbps: null,
  cpeSerialNumber: null,
  cpeMacAddress: null,
  status: 'RESERVED',
  origin: 'NORMAL',
  reservedBy: actor.sub,
  reservedAt: new Date('2026-10-22T12:00:00.000Z'),
  certifiedBy: null,
  certifiedAt: null,
  certificationEvidenceId: null,
  regularizedBy: null,
  regularizedAt: null,
  regularizationReason: null,
  activatedAt: null,
  releasedBy: null,
  releasedAt: null,
  releaseReason: null,
  failureReason: null,
  commercialActivationStatus: 'NOT_APPLICABLE',
  commercialActivationDetail: null,
  version: 1,
  createdAt: new Date('2026-10-22T12:00:00.000Z'),
  updatedAt: new Date('2026-10-22T12:00:00.000Z'),
  ...overrides,
});

function prepareReserve(
  options: {
    order?: Partial<ExecutionSnapshot> | null;
    commercial?: typeof commercialContext | null;
    equipment?: { serialNumber: string; macAddress: string | null } | null;
    router?: Record<string, unknown> | null;
    network?: Record<string, unknown> | null;
    existing?: Record<string, unknown> | null;
    assignment?: Record<string, unknown> | null;
    downloadMbps?: number | null;
    uploadMbps?: number | null;
  } = {},
) {
  const { service, manager, ...ports } = createService({
    executionOrderReadPort: {
      getExecutionSnapshot: jest
        .fn()
        .mockResolvedValue(options.order === null ? null : order('technician-001', options.order)),
    },
    subscriberContextPort: {
      getForSubscriber: jest.fn().mockResolvedValue(
        options.commercial === null
          ? null
          : {
              ...commercialContext,
              downloadMbps: options.downloadMbps ?? commercialContext.downloadMbps,
              uploadMbps: options.uploadMbps ?? commercialContext.uploadMbps,
              ...options.commercial,
            },
      ),
    },
    installedEquipmentReadPort: {
      getFirstInstalledAtCustomer: jest.fn().mockResolvedValue(options.equipment ?? null),
    },
  });
  const router =
    options.router === null
      ? null
      : {
          id: 'router-001',
          name: 'Router de prueba',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
          ...options.router,
        };
  const network =
    options.network === null
      ? null
      : {
          id: 'network-001',
          routerId: 'router-001',
          name: 'Red de prueba',
          cidr: '192.0.2.0/24',
          ...options.network,
        };
  const existing = options.existing ?? null;
  const assignment = options.assignment ?? {
    id: 'assignment-001',
    tenantId: 'tenant-001',
    serviceProvisioningId: 'provisioning-001',
    ipv4NetworkId: 'network-001',
    ip: '192.0.2.10',
    status: 'RESERVED',
    releasedAt: null,
    releaseReason: null,
  };
  manager.findOne.mockImplementation(async (entity, query?: unknown) => {
    if (entity === NetworkRouter) return router as never;
    if (entity === Ipv4Network) return network as never;
    if (entity === ServiceProvisioning) return existing as never;
    if (entity === IpAssignment) return assignment as never;
    return null;
  });
  manager.create.mockImplementation(
    (_entity, values) =>
      reserveRow({ ...(values as Record<string, unknown>), id: 'provisioning-001' }) as never,
  );
  manager.save.mockImplementation(async (_entity, value) => value as never);
  return { service, manager, ...ports, router, network, existing, assignment };
}

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

  it('regularize usa el código HTTP IP_IN_USE si no aparece la asignación reservada', async () => {
    const { service, manager, ipamService } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order('technician-001', {
            id: regularizeBody.executionOrderId,
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
      subscriberContextPort: {
        getForSubscriber: jest.fn().mockResolvedValue({
          expedienteId: null,
          planId: null,
          downloadMbps: null,
          uploadMbps: null,
          contracts: [],
        }),
      },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return null;
      if (entity === NetworkRouter) {
        return {
          id: regularizeBody.routerId,
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      }
      if (entity === Ipv4Network) {
        return { id: regularizeBody.ipv4NetworkId, routerId: regularizeBody.routerId } as never;
      }
      return null;
    });
    manager.create.mockImplementation((_entity, values) => ({
      id: '55555555-5555-4555-8555-555555555555',
      ...values,
    }));
    manager.save.mockImplementation(async (_entity, value) => value);

    const operation = service.regularize(regularizeBody, actor);

    const error = await operation.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'IP_IN_USE' });
    expect(ipamService.reserveIp).toHaveBeenCalledTimes(1);
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

describe('ServiceProvisioningService uncovered lifecycle branches', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['no existe', null],
    ['no es instalación', { workType: WfmWorkType.RETIREMENT }],
    ['no está en ejecución', { status: ExecutionOrderStatus.COMPLETED }],
    ['está anulada', { isAnnulled: true }],
    ['no tiene suscriptor', { subscriberId: null }],
  ] as const)('reserve rechaza una orden que %s', async (_reason, orderOverrides) => {
    const { service } = prepareReserve({ order: orderOverrides });
    await expect(service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
    expect(runInTenant).not.toHaveBeenCalled();
  });

  it('reserve rechaza una orden sin contrato comercial asociado', async () => {
    const { service, subscriberContextPort } = prepareReserve({ commercial: null });
    await expect(service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
    expect(subscriberContextPort.getForSubscriber).toHaveBeenCalledWith('subscriber-001');
  });

  it('reserve rechaza el contrato cuando pertenece a otro suscriptor', async () => {
    const { service } = prepareReserve();
    await expect(
      service.reserve({ ...reserveBody, contractId: 'foreign-contract' } as never, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONTRACT_NOT_OF_SUBSCRIBER' }),
    });
  });

  it('reserve crea la reserva y agrega la guía manual cuando falta CPE', async () => {
    const { service, manager, routerProvisioningPort, ipamService, auditService } =
      prepareReserve();
    const result = await service.reserve(reserveBody as never, actor);
    expect(result.status).toBe('RESERVED');
    expect(result.ip).toBe('192.0.2.10');
    expect(result.routerInstruction).toEqual({
      mode: 'MANUAL',
      steps: ['No se encontró un equipo CPE instalado en esta orden.'],
    });
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(ipamService.reserveIp).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ networkId: 'network-001', provisioningId: 'provisioning-001' }),
    );
    expect(routerProvisioningPort.apply).toHaveBeenCalledWith(
      expect.objectContaining({ routerId: 'router-001', ip: '192.0.2.10' }),
    );
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ action: 'RESERVE' }) }),
      manager,
    );
  });

  it('reserve reutiliza una petición idéntica y propaga equipo y velocidades', async () => {
    const existing = reserveRow({ status: 'CERTIFIED' });
    const { service, manager, routerProvisioningPort } = prepareReserve({
      existing,
      equipment: { serialNumber: 'CPE-001', macAddress: '02:00:00:00:00:01' },
      downloadMbps: 100,
      uploadMbps: 50,
    });
    const result = await service.reserve(reserveBody as never, actor);
    expect(result.status).toBe('CERTIFIED');
    expect(result.routerInstruction?.mode).toBe('MANUAL');
    expect(routerProvisioningPort.apply).toHaveBeenCalledWith({
      routerId: 'router-001',
      ip: '192.0.2.10',
      controlParams: reserveBody.controlParams,
      macAddress: '02:00:00:00:00:01',
      downloadMbps: 100,
      uploadMbps: 50,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['router ausente', { router: null, network: {} }],
    ['red ausente', { router: {}, network: null }],
    ['red asociada a otro router', { network: { routerId: 'router-otro' } }],
    ['método de control no soportado', { router: { supportedControlMethods: [] } }],
  ] as const)(
    'reserve rechaza cuando falta el recurso o la asociación es inválida: %s',
    async (_case, options) => {
      const { service } = prepareReserve(options);
      const expectedCode =
        _case === 'red asociada a otro router'
          ? 'NETWORK_NOT_IN_ROUTER'
          : _case === 'método de control no soportado'
            ? 'CONTROL_METHOD_NOT_SUPPORTED'
            : 'PROVISIONING_ORDER_NOT_ELIGIBLE';
      await expect(service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: expectedCode }),
      });
    },
  );

  it('certify retorna sin mutar una certificación con la misma evidencia', async () => {
    const row = reserveRow({ status: 'CERTIFIED', certificationEvidenceId: 'evidence-001' });
    const { service, manager, auditService, executionOrderReadPort } = createService();
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return row as never;
      return null;
    });
    const result = await service.certify(
      row.id as string,
      { version: 1, evidenceId: 'evidence-001' },
      actor,
    );
    expect(result.status).toBe('CERTIFIED');
    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.logWithin).not.toHaveBeenCalled();
  });

  it.each([
    ['registro ausente', null, 1, 'Aprovisionamiento no encontrado.'],
    ['versión desactualizada', reserveRow({ version: 2 }), 1, 'VERSION_CONFLICT'],
    ['estado no reservable', reserveRow({ status: 'ACTIVE' }), 1, 'PROVISIONING_STATE_INVALID'],
  ] as const)('certify rechaza cuando hay %s', async (_case, row, version, message) => {
    const { service, manager } = createService();
    manager.findOne.mockResolvedValue(row as never);
    const result = service.certify(
      'provisioning-001',
      { version, evidenceId: 'evidence-001' },
      actor,
    );
    if (message === 'Aprovisionamiento no encontrado.') {
      await expect(result).rejects.toThrow(message);
    } else {
      await expect(result).rejects.toMatchObject({
        response: expect.objectContaining({ code: message }),
      });
    }
  });

  it.each([
    ['técnico ausente', order(null), 'PROVISIONING_TECHNICIAN_REQUIRED'],
    ['actor ejecutor', order(actor.sub), 'PROVISIONING_CERTIFIER_IS_EXECUTOR'],
  ] as const)('certify bloquea el maker-checker cuando hay %s', async (_case, snapshot, code) => {
    const { service, manager, executionOrderReadPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(snapshot),
      },
    });
    manager.findOne.mockResolvedValue(reserveRow() as never);
    await expect(
      service.certify('provisioning-001', { version: 1, evidenceId: 'evidence-001' }, actor),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
  });

  it('certify exige evidencia de tipo permitido y registra la certificación', async () => {
    const { service, manager, executionOrderReadPort, auditService } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
        hasEvidence: jest.fn().mockResolvedValue(true),
      },
    });
    const row = reserveRow();
    manager.findOne.mockResolvedValue(row as never);
    manager.save.mockImplementation(async (_entity, value) => value as never);
    const result = await service.certify(
      'provisioning-001',
      { version: 1, evidenceId: 'evidence-001' },
      actor,
    );
    expect(result.status).toBe('CERTIFIED');
    expect(result.version).toBe(2);
    expect(executionOrderReadPort.hasEvidence).toHaveBeenCalledWith('eo-001', 'evidence-001', [
      'PHOTO',
      'DOCUMENT',
    ]);
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ action: 'CERTIFY' }) }),
      manager,
    );
  });

  it('certify rechaza cuando no encuentra evidencia', async () => {
    const { service, manager } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
        hasEvidence: jest.fn().mockResolvedValue(false),
      },
    });
    manager.findOne.mockResolvedValue(reserveRow() as never);
    await expect(
      service.certify('provisioning-001', { version: 1, evidenceId: 'evidence-001' }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_EVIDENCE_REQUIRED' }),
    });
  });

  it.each([
    ['sin orden', null],
    ['orden cerrada', order('technician-001', { status: ExecutionOrderStatus.COMPLETED })],
  ] as const)('release rechaza una %s', async (_case, snapshot) => {
    const { service, manager } = createService({
      executionOrderReadPort: { getExecutionSnapshot: jest.fn().mockResolvedValue(snapshot) },
    });
    manager.findOne.mockImplementation(async (entity) =>
      entity === ServiceProvisioning ? (reserveRow() as never) : null,
    );
    await expect(
      service.release('provisioning-001', { version: 1, reason: 'Liberación justificada' }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
  });

  it('release limpia una IP reservada del router y audita el cambio', async () => {
    const row = reserveRow();
    const assignment = {
      id: 'assignment-001',
      ip: '192.0.2.10/24',
      status: 'RESERVED',
      releasedAt: null,
      releaseReason: null,
    };
    const { service, manager, routerProvisioningPort, auditService } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return row as never;
      if (entity === IpAssignment) return assignment as never;
      return null;
    });
    manager.save.mockImplementation(async (_entity, value) => value as never);
    const result = await service.release(
      'provisioning-001',
      { version: 1, reason: 'Liberación justificada' },
      actor,
    );
    expect(result.status).toBe('RELEASED');
    expect(result.ip).toBeNull();
    expect(assignment).toMatchObject({ status: 'RELEASED', releaseReason: 'MANUAL' });
    expect(routerProvisioningPort.remove).toHaveBeenCalledWith({
      routerId: 'router-001',
      ip: '192.0.2.10',
      controlParams: reserveBody.controlParams,
    });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ action: 'RELEASE' }) }),
      manager,
    );
  });

  it('release mantiene el flujo cuando la asignación no tiene IP utilizable', async () => {
    const row = reserveRow();
    const assignment = { id: 'assignment-001', ip: null, status: 'RESERVED' };
    const { service, manager, routerProvisioningPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return row as never;
      if (entity === IpAssignment) return assignment as never;
      return null;
    });
    manager.save.mockImplementation(async (_entity, value) => value as never);
    await service.release(
      'provisioning-001',
      { version: 1, reason: 'Liberación justificada' },
      actor,
    );
    expect(routerProvisioningPort.remove).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      IpAssignment,
      expect.objectContaining({ status: 'RELEASED' }),
    );
  });

  it('release completa el cambio aunque no exista asignación de IP', async () => {
    const row = reserveRow();
    const { service, manager, routerProvisioningPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return row as never;
      if (entity === IpAssignment) return null;
      return null;
    });
    manager.save.mockImplementation(async (_entity, value) => value as never);

    const result = await service.release(
      'provisioning-001',
      { version: 1, reason: 'Liberación justificada' },
      actor,
    );

    expect(result.status).toBe('RELEASED');
    expect(result.ip).toBeNull();
    expect(routerProvisioningPort.remove).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('getOrderContext exige al menos un permiso de lectura', async () => {
    const { service, executionOrderReadPort } = createService();
    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
  });

  it('getOrderContext limita la lectura operativa al técnico asignado', async () => {
    const { service } = createService({
      permissions: [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ],
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('another-technician')),
      },
    });
    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
  });

  it('getOrderContext con permiso NOC rechaza la orden sin suscriptor', async () => {
    const { service } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
      executionOrderReadPort: {
        getExecutionSnapshot: jest
          .fn()
          .mockResolvedValue(order('technician-001', { subscriberId: null })),
      },
    });
    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
  });

  it('getOrderContext con permiso NOC rechaza si CRM no encuentra contexto comercial', async () => {
    const { service } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
  });
});
