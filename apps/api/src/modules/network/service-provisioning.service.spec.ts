import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { NetworkAuthorizationFacade } from './authorization/network-authorization.facade';

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
  siteDecision?: 'OUT_OF_SCOPE' | 'IN_SCOPE_NO_ACTION' | 'ALLOWED';
  reservationsPaused?: boolean;
}) {
  const executionOrderReadPort = {
    getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
    getExecutionReference: jest.fn().mockImplementation(async (executionOrderId: string) => ({
      id: executionOrderId,
      assignedTechnicianId: 'technician-001',
    })),
    getExecutionSnapshots: jest.fn(),
    hasEvidence: jest.fn(),
    listProvisioningEvidence: jest.fn().mockResolvedValue([]),
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
  manager.findOne.mockImplementation(async (entity, query?: unknown) => {
    const where = (query as { where?: { id?: string } } | undefined)?.where;
    if (entity === NetworkRouter)
      return {
        id: where?.id ?? 'router-001',
        tenantId: 'tenant-001',
        organizationSiteId: null,
        status: 'ACTIVE',
        supportedControlMethods: ['PCQ_ADDRESS_LIST'],
      } as never;
    if (entity === Ipv4Network)
      return {
        id: where?.id ?? 'network-001',
        tenantId: 'tenant-001',
        routerId:
          where?.id === '33333333-3333-4333-8333-333333333333'
            ? '22222222-2222-4222-8222-222222222222'
            : 'router-001',
        status: 'ACTIVE',
      } as never;
    return null;
  });
  runInTenant.mockImplementation(async (_dataSource, _schema, operation) =>
    operation({ manager } as never),
  );
  const effectivePermissionScope = {
    authorizeTenantWide: jest.fn(
      async ({ permissionKey }: { permissionKey: AccessPermissionKey }) =>
        overrides?.permissions === undefined || overrides.permissions.includes(permissionKey),
    ),
    evaluateSite: jest.fn(
      async () =>
        overrides?.siteDecision ??
        (overrides?.permissions === undefined || overrides.permissions.length > 0
          ? 'ALLOWED'
          : 'IN_SCOPE_NO_ACTION'),
    ),
    listAuthorizedSiteScope: jest.fn().mockResolvedValue({ kind: 'TENANT_WIDE' }),
  };
  const routerProvisioningPort = {
    apply: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
    remove: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
    suspend: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
    sync: jest.fn().mockResolvedValue({ supported: false }),
  };
  const ipamService = {
    reserveIp: jest.fn().mockResolvedValue('192.0.2.10'),
    lockIpv4Pools: jest.fn().mockResolvedValue(undefined),
    assertActiveNetwork: jest.fn().mockResolvedValue(undefined),
    assertAssignmentNotLocallyProtected: jest.fn().mockResolvedValue(undefined),
  };
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
    effectivePermissionScope as never,
    new NetworkAuthorizationFacade(effectivePermissionScope as never),
    routerProvisioningPort as never,
    eventEmitter as never,
    overrides?.reservationsPaused ?? false,
  );
  return {
    service,
    manager,
    executionOrderReadPort,
    effectivePermissionScope,
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

function mockProvisioningAndParents(
  manager: ReturnType<typeof createService>['manager'],
  row: Record<string, unknown> | null,
  options: {
    siteId?: string | null;
    routerStatus?: string;
    networkStatus?: string;
    assignment?: Record<string, unknown> | null;
  } = {},
) {
  const routerId = typeof row?.routerId === 'string' ? row.routerId : 'router-001';
  const networkId = typeof row?.ipv4NetworkId === 'string' ? row.ipv4NetworkId : 'network-001';
  manager.findOne.mockImplementation(async (entity) => {
    if (entity === ServiceProvisioning) return row as never;
    if (entity === NetworkRouter)
      return {
        id: routerId,
        organizationSiteId: options.siteId ?? null,
        status: options.routerStatus ?? 'ACTIVE',
        supportedControlMethods: ['PCQ_ADDRESS_LIST'],
      } as never;
    if (entity === Ipv4Network)
      return {
        id: networkId,
        routerId,
        status: options.networkStatus ?? 'ACTIVE',
      } as never;
    if (entity === IpAssignment) return (options.assignment ?? null) as never;
    return null;
  });
}

function expectMinimalAuthorizationProjection(
  manager: ReturnType<typeof createService>['manager'],
  expectedProvisioningLookups = 1,
): void {
  const provisioningCalls = manager.findOne.mock.calls.filter(
    ([entity]) => entity === ServiceProvisioning,
  );
  const routerCalls = manager.findOne.mock.calls.filter(([entity]) => entity === NetworkRouter);
  const networkCalls = manager.findOne.mock.calls.filter(([entity]) => entity === Ipv4Network);

  expect(provisioningCalls).toHaveLength(expectedProvisioningLookups);
  expect(provisioningCalls[0]?.[1]).toMatchObject({
    select: { id: true, routerId: true, ipv4NetworkId: true },
  });
  expect(routerCalls).toHaveLength(1);
  expect(routerCalls[0]?.[1]).toMatchObject({ select: { id: true, organizationSiteId: true } });
  expect(networkCalls).toHaveLength(1);
  expect(networkCalls[0]?.[1]).toMatchObject({ select: { id: true, routerId: true } });
}

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
    reservationsPaused?: boolean;
  } = {},
) {
  const { service, manager, ...ports } = createService({
    ...(options.reservationsPaused !== undefined
      ? { reservationsPaused: options.reservationsPaused }
      : {}),
    executionOrderReadPort: {
      getExecutionSnapshot: jest
        .fn()
        .mockResolvedValue(options.order === null ? null : order('technician-001', options.order)),
      getExecutionReference: jest
        .fn()
        .mockResolvedValue(
          options.order === null ? null : { id: 'eo-001', assignedTechnicianId: 'technician-001' },
        ),
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
          status: 'ACTIVE',
          organizationSiteId: null,
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
          status: 'ACTIVE',
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
  it('expone solo el estado de pausa y exige permiso tenant-wide de aprovisionamiento', async () => {
    const paused = createService({ reservationsPaused: true });
    await expect(paused.service.getProvisioningMeta(actor)).resolves.toEqual({
      reservationsPaused: true,
    });
    expect(paused.effectivePermissionScope.authorizeTenantWide).toHaveBeenCalledWith({
      actorId: actor.sub,
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    });

    const forbidden = createService({ reservationsPaused: true, permissions: [] });
    await expect(forbidden.service.getProvisioningMeta(actor)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('pausa reserve y regularize antes de mutar o reemitir instrucciones', async () => {
    const reserve = prepareReserve({ reservationsPaused: true });
    await expect(reserve.service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: { code: 'RESERVATIONS_PAUSED' },
    });
    expect(reserve.manager.query).not.toHaveBeenCalled();
    expect(reserve.manager.save).not.toHaveBeenCalled();
    expect(reserve.ipamService.reserveIp).not.toHaveBeenCalled();
    expect(reserve.routerProvisioningPort.apply).not.toHaveBeenCalled();
    expect(reserve.auditService.logWithin).not.toHaveBeenCalled();

    const replay = prepareReserve({ reservationsPaused: true, existing: reserveRow() });
    await expect(replay.service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: { code: 'RESERVATIONS_PAUSED' },
    });
    expect(replay.manager.save).not.toHaveBeenCalled();
    expect(replay.ipamService.reserveIp).not.toHaveBeenCalled();
    expect(replay.routerProvisioningPort.apply).not.toHaveBeenCalled();
    expect(replay.auditService.logWithin).not.toHaveBeenCalled();

    const regularize = createService({
      reservationsPaused: true,
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
    await expect(regularize.service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: { code: 'RESERVATIONS_PAUSED' },
    });
    expect(regularize.manager.query).not.toHaveBeenCalled();
    expect(regularize.manager.save).not.toHaveBeenCalled();
    expect(regularize.ipamService.reserveIp).not.toHaveBeenCalled();
    expect(regularize.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(regularize.routerProvisioningPort.apply).not.toHaveBeenCalled();
    expect(regularize.auditService.logWithin).not.toHaveBeenCalled();
  });

  it('resuelve orden y sede persistida antes de decidir permiso exacto en mutaciones', async () => {
    const reserve = createService({
      siteDecision: 'IN_SCOPE_NO_ACTION',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    reserve.manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return { id: 'router-001', organizationSiteId: 'site-a', status: 'ACTIVE' } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-001', status: 'ACTIVE' } as never;
      return null;
    });
    await expect(reserve.service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      }),
    });
    expect(reserve.effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
    });
    expect(reserve.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(reserve.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(reserve.subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();

    const regularize = createService({
      siteDecision: 'IN_SCOPE_NO_ACTION',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order('tech-1', {
            id: regularizeBody.executionOrderId,
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
    });
    regularize.manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return {
          id: regularizeBody.routerId,
          organizationSiteId: 'site-a',
          status: 'ACTIVE',
        } as never;
      if (entity === Ipv4Network)
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
        } as never;
      return null;
    });
    await expect(regularize.service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    expect(regularize.effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    });
    expect(regularize.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(regularize.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(regularize.subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();

    const certify = createService({
      siteDecision: 'IN_SCOPE_NO_ACTION',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    certify.manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return reserveRow() as never;
      if (entity === NetworkRouter)
        return { id: 'router-001', organizationSiteId: 'site-a', status: 'ACTIVE' } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-001', status: 'ACTIVE' } as never;
      return null;
    });
    await expect(
      certify.service.certify(
        'provisioning-001',
        { version: 1, evidenceId: 'evidence-001' },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      }),
    });
    expect(certify.effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    });
    expect(certify.executionOrderReadPort.hasEvidence).not.toHaveBeenCalled();
    expect(certify.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(certify.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(certify.manager.save).not.toHaveBeenCalled();

    const release = createService({
      siteDecision: 'IN_SCOPE_NO_ACTION',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    release.manager.findOne.mockImplementation(async (entity) => {
      if (entity === ServiceProvisioning) return reserveRow() as never;
      if (entity === NetworkRouter)
        return { id: 'router-001', organizationSiteId: 'site-a', status: 'ACTIVE' } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-001', status: 'ACTIVE' } as never;
      return null;
    });
    await expect(
      release.service.release(
        'provisioning-001',
        { version: 1, reason: 'Liberación justificada' },
        actor,
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(release.effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
    });
    expect(release.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(release.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(release.manager.save).not.toHaveBeenCalled();

    const inbox = createService({ permissions: [] });
    runInTenant.mockClear();
    await expect(
      inbox.service.listInbox({ queue: 'FAILED', page: 1, limit: 20 }, actor),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(runInTenant).not.toHaveBeenCalled();
    expect(inbox.effectivePermissionScope.authorizeTenantWide).toHaveBeenCalledWith({
      actorId: actor.sub,
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    });

    const subscriberList = createService({ permissions: [] });
    runInTenant.mockClear();
    await expect(
      subscriberList.service.listSubscriberProvisionings('subscriber-001', actor),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(runInTenant).not.toHaveBeenCalled();
    expect(subscriberList.effectivePermissionScope.authorizeTenantWide).toHaveBeenCalledWith({
      actorId: actor.sub,
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    });
  });

  beforeEach(() => jest.clearAllMocks());

  it('R6 ter: no reserva si la OT no tiene técnico asignado', async () => {
    const { service, executionOrderReadPort, effectivePermissionScope } = createService({
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
    expect(executionOrderReadPort.getExecutionReference).toHaveBeenCalledWith('eo-001');
    expect(executionOrderReadPort.getExecutionSnapshot).toHaveBeenCalledWith('eo-001');
    expect(effectivePermissionScope.authorizeTenantWide.mock.invocationCallOrder[0]!).toBeLessThan(
      (executionOrderReadPort.getExecutionSnapshot as jest.Mock).mock.invocationCallOrder[0]!,
    );
    expect(runInTenant).toHaveBeenCalledTimes(2);
  });

  it('reserva mantiene el orden de locks L1 → pools L2 → padres sin adquirir L0', async () => {
    const { service, manager, ipamService } = prepareReserve();

    await service.reserve(reserveBody as never, actor);

    const orderLockIndex = manager.query.mock.calls.findIndex(
      ([sql, parameters]) =>
        String(sql).includes('pg_advisory_xact_lock') &&
        (parameters as unknown[] | undefined)?.[0] === 'provisioning-order:eo-001',
    );
    const lockedRouterCallIndex = manager.findOne.mock.calls.findIndex(
      ([entity, options]) =>
        entity === NetworkRouter &&
        (options as { lock?: { mode?: string } } | undefined)?.lock?.mode === 'pessimistic_read',
    );
    const orderLockOrder = manager.query.mock.invocationCallOrder[orderLockIndex];
    const poolLockOrder = ipamService.lockIpv4Pools.mock.invocationCallOrder[0];
    const lockedRouterOrder = manager.findOne.mock.invocationCallOrder[lockedRouterCallIndex];

    expect(orderLockIndex).toBeGreaterThanOrEqual(0);
    expect(lockedRouterCallIndex).toBeGreaterThanOrEqual(0);
    expect(orderLockOrder).toBeDefined();
    expect(poolLockOrder).toBeDefined();
    expect(lockedRouterOrder).toBeDefined();
    expect(
      manager.query.mock.calls.some(
        ([sql, parameters]) =>
          String(sql).includes('pg_advisory_xact_lock') &&
          (parameters as unknown[] | undefined)?.[0] === 'ipv4-catalog:tenant-001',
      ),
    ).toBe(false);
    expect(orderLockOrder).toBeLessThan(poolLockOrder as number);
    expect(poolLockOrder).toBeLessThan(lockedRouterOrder as number);
    expect(ipamService.assertActiveNetwork).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-001',
      'network-001',
    );
  });

  it('oculta un router fuera de alcance con el mismo 404 que un router inexistente o padre inválido', async () => {
    const outOfScope = createService({
      siteDecision: 'OUT_OF_SCOPE',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    outOfScope.manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return { id: 'router-001', organizationSiteId: 'site-b', status: 'ACTIVE' } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-001', status: 'ACTIVE' } as never;
      return null;
    });
    const outOfScopeError = await outOfScope.service
      .reserve(reserveBody as never, actor)
      .catch((error: unknown) => error);

    const missingRouter = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    missingRouter.manager.findOne.mockImplementation(async (entity) =>
      entity === NetworkRouter ? null : { id: 'network-001', routerId: 'router-001' },
    );
    const missingRouterError = await missingRouter.service
      .reserve(reserveBody as never, actor)
      .catch((error: unknown) => error);

    const wrongParent = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    wrongParent.manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return { id: 'router-001', organizationSiteId: 'site-a', status: 'ACTIVE' } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-other', status: 'ACTIVE' } as never;
      return null;
    });
    const wrongParentError = await wrongParent.service
      .reserve(reserveBody as never, actor)
      .catch((error: unknown) => error);

    expect(outOfScopeError).toBeInstanceOf(NotFoundException);
    expect((outOfScopeError as NotFoundException).getResponse()).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La referencia no está disponible para esta operación.',
    });
    expect(missingRouterError).toBeInstanceOf(NotFoundException);
    expect(wrongParentError).toBeInstanceOf(NotFoundException);
    expect((missingRouterError as NotFoundException).getResponse()).toEqual(
      (outOfScopeError as NotFoundException).getResponse(),
    );
    expect((wrongParentError as NotFoundException).getResponse()).toEqual(
      (outOfScopeError as NotFoundException).getResponse(),
    );
    expect(outOfScope.effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-b',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
    });
    expect(outOfScope.subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();
    expect(
      outOfScope.installedEquipmentReadPort.getFirstInstalledAtCustomer,
    ).not.toHaveBeenCalled();
    expect(missingRouter.effectivePermissionScope.evaluateSite).not.toHaveBeenCalled();
    expect(wrongParent.effectivePermissionScope.evaluateSite).not.toHaveBeenCalled();
    expect(outOfScope.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(outOfScope.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(missingRouter.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(missingRouter.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(wrongParent.executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
    expect(wrongParent.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
  });

  it('autoriza router/sede antes de resolver la OT y devuelve 404 si la referencia falta', async () => {
    const missingOrder = createService({
      executionOrderReadPort: {
        getExecutionReference: jest.fn().mockResolvedValue(null),
      },
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE],
    });

    await expect(missingOrder.service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      }),
    });
    expect(missingOrder.executionOrderReadPort.getExecutionReference).toHaveBeenCalledWith(
      reserveBody.executionOrderId,
    );
    expect(missingOrder.executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(
      missingOrder.effectivePermissionScope.authorizeTenantWide.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      (missingOrder.executionOrderReadPort.getExecutionReference as jest.Mock).mock
        .invocationCallOrder[0]!,
    );
  });

  it('comprueba el estado de router después de ALLOWED', async () => {
    const { service, manager, effectivePermissionScope, executionOrderReadPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return {
          id: 'router-001',
          organizationSiteId: 'site-a',
          status: 'INACTIVE',
        } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-001', status: 'ACTIVE' } as never;
      return null;
    });

    await expect(service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
    expect(effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
    });
    expect(executionOrderReadPort.getExecutionReference).not.toHaveBeenCalled();
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
          organizationSiteId: null,
          status: 'ACTIVE',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      }
      if (entity === Ipv4Network) {
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
        } as never;
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
    const row = reserveRow({ executionOrderId: 'eo-001', version: 3 });
    mockProvisioningAndParents(manager, row);

    await expect(
      service.certify('provisioning-001', { evidenceId: 'evidence-001', version: 3 }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' }),
    });
    expect(executionOrderReadPort.hasEvidence).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('R6 bis: liberar un servicio CERTIFIED requiere permiso de certificar', async () => {
    const { service, manager, executionOrderReadPort, effectivePermissionScope } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE],
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    mockProvisioningAndParents(manager, reserveRow({ status: 'CERTIFIED', version: 3 }));

    await expect(
      service.release(
        'provisioning-001',
        { version: 3, reason: 'Corrección operativa válida' },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    expect(effectivePermissionScope.authorizeTenantWide).toHaveBeenCalledWith({
      actorId: actor.sub,
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    });
    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('construye al técnico solo la proyección pública de cinco campos', async () => {
    const { service, manager, executionOrderReadPort, routerProvisioningPort } = createService({
      permissions: [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ],
      reservationsPaused: true,
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order(actor.sub)),
        getExecutionReference: jest
          .fn()
          .mockResolvedValue({ id: 'eo-001', assignedTechnicianId: actor.sub }),
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
    expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
    expect(routerProvisioningPort.apply).not.toHaveBeenCalled();
  });

  it('bloquea con RESERVATIONS_PAUSED el contexto completo que reemitiría instrucciones', async () => {
    const { service, manager, routerProvisioningPort } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
      reservationsPaused: true,
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(commercialContext) },
    });
    mockProvisioningAndParents(manager, reserveRow(), {
      assignment: { id: 'assignment-001', ip: '192.0.2.10', status: 'ACTIVE' },
    });

    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RESERVATIONS_PAUSED' }),
    });
    expect(routerProvisioningPort.apply).not.toHaveBeenCalled();
  });

  it('sin pausa el contexto completo conserva la instrucción de router', async () => {
    const instruction = { mode: 'MANUAL' as const, steps: ['Aplicar instrucción sintética'] };
    const { service, manager, routerProvisioningPort } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
      reservationsPaused: false,
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(commercialContext) },
    });
    routerProvisioningPort.apply.mockResolvedValueOnce(instruction);
    mockProvisioningAndParents(manager, reserveRow(), {
      assignment: { id: 'assignment-001', ip: '192.0.2.10', status: 'ACTIVE' },
    });

    const response = await service.getOrderContext('eo-001', actor);

    expect(response).toMatchObject({ provisioning: { routerInstruction: instruction } });
    expect(routerProvisioningPort.apply).toHaveBeenCalledTimes(1);
  });

  it('consulta la proyección de evidencia del owner después de permitir contexto completo', async () => {
    const evidence = [
      {
        id: 'evidence-001',
        evidenceType: 'PHOTO' as const,
        requirementKey: 'ROUTER_LABEL',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ];
    const { service, manager, executionOrderReadPort } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
      executionOrderReadPort: {
        listProvisioningEvidence: jest.fn().mockResolvedValue(evidence),
      },
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(commercialContext) },
    });
    mockProvisioningAndParents(manager, reserveRow());

    const response = await service.getOrderContext('eo-001', actor);

    expect(executionOrderReadPort.listProvisioningEvidence).toHaveBeenCalledWith('eo-001');
    expect(response).toMatchObject({ evidences: evidence });
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
    expect(runInTenant).toHaveBeenCalledTimes(2);
  });

  it('regularize rechaza una OT sin técnico después de resolver sede y permiso', async () => {
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
    expect(runInTenant).toHaveBeenCalledTimes(2);
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
    expect(runInTenant).toHaveBeenCalledTimes(2);
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
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return {
          id: regularizeBody.routerId,
          organizationSiteId: null,
          status: 'ACTIVE',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      if (entity === Ipv4Network)
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
        } as never;
      if (entity === ServiceProvisioning) return active as never;
      if (entity === IpAssignment) return null;
      return null;
    });

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
      if (entity === NetworkRouter)
        return {
          id: regularizeBody.routerId,
          name: 'Router',
          organizationSiteId: null,
          status: 'ACTIVE',
        } as never;
      if (entity === Ipv4Network)
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          name: 'Red',
          cidr: '192.0.2.0/24',
          status: 'ACTIVE',
        } as never;
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

  it('listInbox FAILED pagina y proyecta servicio, IP, técnico y defaults sin servicio', async () => {
    const row = reserveRow({
      id: 'provisioning-failed',
      executionOrderId: 'eo-failed',
      status: 'FAILED',
      failureReason: 'CLOSED_WITHOUT_CERTIFICATION',
      updatedAt: new Date('2026-10-25T10:00:00.000Z'),
    });
    const firstOrder = order('technician-001', {
      id: 'eo-failed',
      status: ExecutionOrderStatus.COMPLETED,
      closedAt: '2026-10-25T09:00:00.000Z',
    });
    const secondOrder = order(null, {
      id: 'eo-without-service',
      status: ExecutionOrderStatus.COMPLETED,
      closedAt: null,
    });
    const { service, manager, executionOrderReadPort, actorReadPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshots: jest.fn().mockResolvedValue([firstOrder, secondOrder]),
      },
    });
    manager.findAndCount.mockResolvedValue([[row as never], 2]);
    manager.find.mockResolvedValue([
      {
        id: 'assignment-failed',
        serviceProvisioningId: row.id,
        ip: '198.51.100.15/24',
        status: 'ACTIVE',
      } as never,
    ]);

    const result = await service.listInbox({ queue: 'FAILED', page: 0, limit: 0 }, actor);

    expect(manager.findAndCount).toHaveBeenCalledWith(ServiceProvisioning, {
      where: { tenantId: 'tenant-001', status: 'FAILED' },
      order: { updatedAt: 'DESC' },
      skip: 0,
      take: 1,
    });
    expect(executionOrderReadPort.getExecutionSnapshots).toHaveBeenCalledWith(['eo-failed']);
    expect(manager.find).toHaveBeenCalledWith(
      IpAssignment,
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-001', status: expect.anything() }),
      }),
    );
    expect(actorReadPort.findByIds).toHaveBeenCalledWith('tenant_001', ['technician-001']);
    expect(result.data).toEqual([
      expect.objectContaining({
        queue: 'FAILED',
        executionOrderId: 'eo-failed',
        assignedTechnician: { id: 'technician-001', name: null },
        serviceProvisioningId: 'provisioning-failed',
        provisioningStatus: 'FAILED',
        ip: '198.51.100.15',
        failureReason: 'CLOSED_WITHOUT_CERTIFICATION',
        updatedAt: '2026-10-25T10:00:00.000Z',
      }),
      expect.objectContaining({
        executionOrderId: 'eo-without-service',
        assignedTechnician: null,
        serviceProvisioningId: null,
        provisioningStatus: null,
        ip: null,
        failureReason: null,
        updatedAt: new Date(0).toISOString(),
      }),
    ]);
    expect(result.meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasMore: true,
    });
  });

  it('listInbox IN_EXECUTION excluye órdenes ya aprovisionadas y proyecta filas encontradas', async () => {
    const orderInProgress = order('technician-001', { id: 'eo-in-progress' });
    const row = reserveRow({ id: 'provisioning-certified', executionOrderId: 'eo-in-progress' });
    const assignment = {
      id: 'assignment-certified',
      serviceProvisioningId: row.id,
      ip: '192.0.2.80/24',
      status: 'ACTIVE',
    };
    const { service, manager, executionOrderReadPort, actorReadPort } = createService({
      executionOrderReadPort: {
        listInstallationOrders: jest.fn().mockResolvedValue({ rows: [orderInProgress], total: 1 }),
      },
    });
    manager.find
      .mockResolvedValueOnce([{ executionOrderId: 'eo-already-provisioned' } as never])
      .mockResolvedValueOnce([row as never])
      .mockResolvedValueOnce([assignment as never]);
    actorReadPort.findByIds.mockResolvedValue([{ id: 'technician-001', name: 'Técnico' }]);

    const result = await service.listInbox({ queue: 'IN_EXECUTION', page: 2, limit: 10 }, actor);

    expect(manager.find).toHaveBeenNthCalledWith(
      1,
      ServiceProvisioning,
      expect.objectContaining({
        where: { tenantId: 'tenant-001', status: expect.anything() },
        select: ['executionOrderId'],
      }),
    );
    expect(executionOrderReadPort.listInstallationOrders).toHaveBeenCalledWith({
      group: 'IN_PROGRESS',
      excludeIds: ['eo-already-provisioned'],
      page: 2,
      limit: 10,
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        queue: 'IN_EXECUTION',
        executionOrderId: 'eo-in-progress',
        assignedTechnician: { id: 'technician-001', name: 'Técnico' },
        serviceProvisioningId: 'provisioning-certified',
        provisioningStatus: 'RESERVED',
        ip: '192.0.2.80',
        failureReason: null,
      }),
    ]);
    expect(manager.find).toHaveBeenCalledTimes(3);
  });

  it('listInbox CLOSED_UNPROVISIONED maneja una página vacía y acota el límite', async () => {
    const { service, manager, executionOrderReadPort } = createService({
      executionOrderReadPort: {
        listInstallationOrders: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      },
    });
    manager.find.mockResolvedValueOnce([]);

    const result = await service.listInbox(
      { queue: 'CLOSED_UNPROVISIONED', page: 3, limit: 500 },
      actor,
    );

    expect(executionOrderReadPort.listInstallationOrders).toHaveBeenCalledWith({
      group: 'CLOSED_EXECUTED',
      excludeIds: [],
      page: 3,
      limit: 100,
    });
    expect(manager.find).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([]);
    expect(result.meta).toMatchObject({
      page: 3,
      limit: 100,
      total: 0,
      totalPages: 0,
      hasMore: false,
    });
  });

  it('listSubscriberProvisionings devuelve resultados tenant-scoped y tolera una lista vacía', async () => {
    const { service, manager, actorReadPort } = createService();
    const row = reserveRow({ createdAt: new Date('2026-10-24T12:00:00.000Z') });
    manager.find.mockResolvedValueOnce([row as never]).mockResolvedValueOnce([]);

    const results = await service.listSubscriberProvisionings('subscriber-001', actor);
    const empty = await service.listSubscriberProvisionings('subscriber-empty', actor);

    expect(manager.find).toHaveBeenNthCalledWith(1, ServiceProvisioning, {
      where: { tenantId: 'tenant-001', subscriberId: 'subscriber-001' },
      order: { createdAt: 'DESC' },
    });
    expect(manager.find).toHaveBeenNthCalledWith(2, ServiceProvisioning, {
      where: { tenantId: 'tenant-001', subscriberId: 'subscriber-empty' },
      order: { createdAt: 'DESC' },
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'provisioning-001', status: 'RESERVED' });
    expect(empty).toEqual([]);
    expect(actorReadPort.findByIds).toHaveBeenCalledWith('tenant_001', [actor.sub]);
  });

  it('getOrderContext devuelve 404 si la proyección completa cambió de padre tras autorizar', async () => {
    const { service, manager, executionOrderReadPort, subscriberContextPort } = createService({
      permissions: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
    });
    manager.findOne.mockImplementation(async (entity, query?: unknown) => {
      const options = query as { select?: Record<string, boolean> } | undefined;
      if (entity === ServiceProvisioning) {
        return options?.select
          ? { id: 'provisioning-001', routerId: 'router-001', ipv4NetworkId: 'network-001' }
          : reserveRow({ ipv4NetworkId: 'network-changed-after-auth' });
      }
      if (entity === NetworkRouter)
        return { id: 'router-001', organizationSiteId: null, status: 'ACTIVE' } as never;
      if (entity === Ipv4Network)
        return { id: 'network-001', routerId: 'router-001', status: 'ACTIVE' } as never;
      return null;
    });

    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }),
    });

    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
    expect(subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalledWith(IpAssignment, expect.anything());
  });

  it.each(['OUT_OF_SCOPE', 'IN_SCOPE_NO_ACTION'] as const)(
    'getOrderContext devuelve 404 al técnico si su proyección mínima cambia R1/N1 por R2/N2 (%s)',
    async (siteDecision) => {
      const { service, manager, executionOrderReadPort, effectivePermissionScope } = createService({
        permissions: [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ],
        siteDecision,
        executionOrderReadPort: {
          getExecutionReference: jest
            .fn()
            .mockResolvedValue({ id: 'eo-001', assignedTechnicianId: actor.sub }),
        },
      });
      manager.findOne.mockImplementation(async (entity, query?: unknown) => {
        const select = (query as { select?: Record<string, boolean> } | undefined)?.select;
        if (entity === ServiceProvisioning) {
          if (select?.status) {
            return {
              id: 'provisioning-001',
              routerId: 'router-r2',
              ipv4NetworkId: 'network-n2',
              status: 'RESERVED',
              updatedAt: new Date('2026-10-26T12:00:00.000Z'),
            } as never;
          }
          return {
            id: 'provisioning-001',
            routerId: 'router-r1',
            ipv4NetworkId: 'network-n1',
          } as never;
        }
        if (entity === NetworkRouter)
          return { id: 'router-r1', organizationSiteId: 'site-b' } as never;
        if (entity === Ipv4Network) return { id: 'network-n1', routerId: 'router-r1' } as never;
        return null;
      });

      await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'RESOURCE_NOT_FOUND',
          message: 'La referencia no está disponible para esta operación.',
        }),
      });

      expect(executionOrderReadPort.getExecutionReference).toHaveBeenCalledWith('eo-001');
      expect(effectivePermissionScope.authorizeTenantWide).toHaveBeenCalledWith({
        actorId: actor.sub,
        permissionKey: AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      });
      expect(effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
        actorId: actor.sub,
        siteId: 'site-b',
        permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
      });
      const provisioningReads = manager.findOne.mock.calls.filter(
        ([entity]) => entity === ServiceProvisioning,
      );
      expect(provisioningReads).toHaveLength(2);
      expect(provisioningReads[0]?.[1]).toMatchObject({
        select: { id: true, routerId: true, ipv4NetworkId: true },
      });
      expect(provisioningReads[1]?.[1]).toMatchObject({
        select: {
          id: true,
          routerId: true,
          ipv4NetworkId: true,
          status: true,
          updatedAt: true,
        },
      });
      expect(provisioningReads.every(([, options]) => 'select' in (options ?? {}))).toBe(true);
      expect(manager.findOne).not.toHaveBeenCalledWith(IpAssignment, expect.anything());
      expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
      expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
    },
  );

  it('release CERTIFIED exige la segunda autorización de certificación para la sede', async () => {
    const row = reserveRow({ status: 'CERTIFIED', certificationEvidenceId: 'evidence-001' });
    const { service, manager, effectivePermissionScope } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    mockProvisioningAndParents(manager, row, { siteId: 'site-a' });
    manager.save.mockImplementation(async (_entity, value) => value as never);

    const result = await service.release(
      row.id as string,
      { version: 1, reason: 'Liberación justificada' },
      actor,
    );

    expect(result.status).toBe('RELEASED');
    expect(effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    });
    expect(manager.save).toHaveBeenCalledWith(
      ServiceProvisioning,
      expect.objectContaining({ status: 'RELEASED', version: 2 }),
    );
  });

  it('release CERTIFIED tenant-wide exige el permiso secundario de certificación', async () => {
    const row = reserveRow({ status: 'CERTIFIED', certificationEvidenceId: 'evidence-001' });
    const { service, manager, effectivePermissionScope } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    mockProvisioningAndParents(manager, row, { siteId: null });
    manager.save.mockImplementation(async (_entity, value) => value as never);

    const result = await service.release(
      row.id as string,
      { version: 1, reason: 'Liberación justificada' },
      actor,
    );

    expect(result.status).toBe('RELEASED');
    expect(effectivePermissionScope.authorizeTenantWide).toHaveBeenCalledWith({
      actorId: actor.sub,
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    });
  });

  it('reserve libera la reserva anterior como REPLACED al cambiar red', async () => {
    const existing = reserveRow({ id: 'provisioning-old', ipv4NetworkId: 'network-old' });
    const oldAssignment = {
      id: 'assignment-old',
      serviceProvisioningId: existing.id,
      ipv4NetworkId: 'network-old',
      ip: '192.0.2.20/24',
      status: 'RESERVED',
      releasedAt: null,
      releaseReason: null,
    };
    const newAssignment = {
      id: 'assignment-new',
      serviceProvisioningId: 'provisioning-new',
      ipv4NetworkId: 'network-001',
      ip: '192.0.2.10/24',
      status: 'RESERVED',
    };
    const { service, manager, routerProvisioningPort, auditService } = prepareReserve({
      existing,
      assignment: oldAssignment,
    });
    manager.create.mockImplementation(
      (_entity, values) =>
        reserveRow({ ...(values as Record<string, unknown>), id: 'provisioning-new' }) as never,
    );
    manager.findOne.mockImplementation(async (entity, query?: unknown) => {
      const where = (query as { where?: { serviceProvisioningId?: string } } | undefined)?.where;
      if (entity === NetworkRouter)
        return {
          id: 'router-001',
          organizationSiteId: null,
          status: 'ACTIVE',
          name: 'Router de prueba',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      if (entity === Ipv4Network)
        return {
          id: 'network-001',
          routerId: 'router-001',
          status: 'ACTIVE',
          name: 'Red de prueba',
          cidr: '192.0.2.0/24',
        } as never;
      if (entity === ServiceProvisioning) return existing as never;
      if (entity === IpAssignment)
        return (
          where?.serviceProvisioningId === 'provisioning-new' ? newAssignment : oldAssignment
        ) as never;
      return null;
    });

    const result = await service.reserve(reserveBody as never, actor);

    expect(oldAssignment).toMatchObject({ status: 'RELEASED', releaseReason: 'REPLACED' });
    expect(existing).toMatchObject({ status: 'RELEASED', releaseReason: 'REPLACED', version: 2 });
    expect(routerProvisioningPort.remove).toHaveBeenCalledWith({
      routerId: 'router-001',
      ip: '192.0.2.20',
      controlParams: reserveBody.controlParams,
    });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'provisioning-old',
        newValue: {
          action: 'RELEASE',
          releaseReason: 'REPLACED',
          fromStatus: 'RESERVED',
          toStatus: 'RELEASED',
          changedFields: ['status', 'ipAssignment'],
        },
      }),
      manager,
    );
    expect(result.id).toBe('provisioning-new');
  });

  it('regularize reutiliza la asignación compatible de un servicio FAILED', async () => {
    const failedRow = reserveRow({
      id: 'provisioning-failed',
      executionOrderId: regularizeBody.executionOrderId,
      routerId: regularizeBody.routerId,
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      status: 'FAILED',
      version: 4,
    });
    const assignment = {
      id: 'assignment-failed',
      serviceProvisioningId: failedRow.id,
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      ip: '192.0.2.30/24',
      status: 'RESERVED',
      releasedAt: new Date('2026-10-24T10:00:00.000Z'),
      releaseReason: 'REPLACED',
    };
    const { service, manager, ipamService, auditService } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order('technician-001', {
            id: regularizeBody.executionOrderId,
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(commercialContext) },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return {
          id: regularizeBody.routerId,
          organizationSiteId: null,
          status: 'ACTIVE',
          name: 'Router de prueba',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      if (entity === Ipv4Network)
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
          name: 'Red de prueba',
          cidr: '192.0.2.0/24',
        } as never;
      if (entity === ServiceProvisioning) return failedRow as never;
      if (entity === IpAssignment) return assignment as never;
      return null;
    });
    manager.save.mockImplementation(async (_entity, value) => value as never);

    const result = await service.regularize(regularizeBody, actor);

    expect(result).toMatchObject({ id: 'provisioning-failed', status: 'ACTIVE', version: 5 });
    expect(failedRow).toMatchObject({ origin: 'REGULARIZED', failureReason: null });
    expect(assignment).toMatchObject({ status: 'ACTIVE', releasedAt: null, releaseReason: null });
    expect(ipamService.reserveIp).not.toHaveBeenCalled();
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: {
          action: 'REGULARIZE',
          executionOrderId: regularizeBody.executionOrderId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
          reasonProvided: true,
          changedFields: ['status', 'ipAssignment'],
        },
      }),
      manager,
    );
  });

  it('regularize reemplaza el servicio FAILED si su asignación pertenece a otra red', async () => {
    const failedRow = reserveRow({
      id: 'provisioning-failed',
      executionOrderId: regularizeBody.executionOrderId,
      routerId: regularizeBody.routerId,
      ipv4NetworkId: 'network-old',
      status: 'FAILED',
    });
    const oldAssignment = {
      id: 'assignment-old',
      serviceProvisioningId: failedRow.id,
      ipv4NetworkId: 'network-old',
      ip: '192.0.2.40/24',
      status: 'ACTIVE',
    };
    const newAssignment = {
      id: 'assignment-new',
      serviceProvisioningId: 'provisioning-new',
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      ip: '192.0.2.41/24',
      status: 'RESERVED',
    };
    const { service, manager, ipamService, routerProvisioningPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(
          order('technician-001', {
            id: regularizeBody.executionOrderId,
            status: ExecutionOrderStatus.COMPLETED,
            result: ExecutionOrderResult.EXECUTED,
          }),
        ),
      },
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(commercialContext) },
    });
    manager.findOne.mockImplementation(async (entity, query?: unknown) => {
      const where = (query as { where?: { serviceProvisioningId?: string } } | undefined)?.where;
      if (entity === NetworkRouter)
        return {
          id: regularizeBody.routerId,
          organizationSiteId: null,
          status: 'ACTIVE',
          name: 'Router de prueba',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      if (entity === Ipv4Network)
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
          name: 'Red de prueba',
          cidr: '192.0.2.0/24',
        } as never;
      if (entity === ServiceProvisioning) return failedRow as never;
      if (entity === IpAssignment)
        return (
          where?.serviceProvisioningId === 'provisioning-new' ? newAssignment : oldAssignment
        ) as never;
      return null;
    });
    manager.create.mockImplementation(
      (_entity, values) =>
        reserveRow({ ...(values as Record<string, unknown>), id: 'provisioning-new' }) as never,
    );
    manager.save.mockImplementation(async (_entity, value) => value as never);

    const result = await service.regularize(regularizeBody, actor);

    expect(result.id).toBe('provisioning-new');
    expect(failedRow).toMatchObject({ status: 'RELEASED', releaseReason: 'REPLACED' });
    expect(oldAssignment).toMatchObject({ status: 'RELEASED', releaseReason: 'REPLACED' });
    expect(routerProvisioningPort.remove).toHaveBeenCalledWith({
      routerId: regularizeBody.routerId,
      ip: '192.0.2.40',
      controlParams: reserveBody.controlParams,
    });
    expect(ipamService.reserveIp).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ networkId: regularizeBody.ipv4NetworkId }),
    );
  });

  it('regularize devuelve IP_IN_USE cuando la reserva nueva no materializa asignación', async () => {
    const failedRow = reserveRow({
      id: 'provisioning-failed',
      executionOrderId: regularizeBody.executionOrderId,
      routerId: regularizeBody.routerId,
      ipv4NetworkId: regularizeBody.ipv4NetworkId,
      status: 'FAILED',
    });
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
      subscriberContextPort: { getForSubscriber: jest.fn().mockResolvedValue(commercialContext) },
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === NetworkRouter)
        return {
          id: regularizeBody.routerId,
          organizationSiteId: null,
          status: 'ACTIVE',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
        } as never;
      if (entity === Ipv4Network)
        return {
          id: regularizeBody.ipv4NetworkId,
          routerId: regularizeBody.routerId,
          status: 'ACTIVE',
        } as never;
      if (entity === ServiceProvisioning) return failedRow as never;
      if (entity === IpAssignment) return null;
      return null;
    });
    manager.create.mockImplementation(
      (_entity, values) =>
        reserveRow({ ...(values as Record<string, unknown>), id: 'provisioning-new' }) as never,
    );
    manager.save.mockImplementation(async (_entity, value) => value as never);

    await expect(service.regularize(regularizeBody, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IP_IN_USE' }),
    });
    expect(ipamService.reserveIp).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ provisioningId: 'provisioning-new' }),
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      IpAssignment,
      expect.objectContaining({
        where: expect.objectContaining({ serviceProvisioningId: 'provisioning-new' }),
      }),
    );
  });

  it.each([
    ['no existe', null],
    ['no es instalación', { workType: WfmWorkType.RETIREMENT }],
    ['no está en ejecución', { status: ExecutionOrderStatus.COMPLETED }],
    ['está anulada', { isAnnulled: true }],
    ['no tiene suscriptor', { subscriberId: null }],
  ] as const)('reserve rechaza una orden que %s', async (_reason, orderOverrides) => {
    const { service } = prepareReserve({ order: orderOverrides });
    await expect(service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: _reason === 'no existe' ? 'RESOURCE_NOT_FOUND' : 'PROVISIONING_ORDER_NOT_ELIGIBLE',
      }),
    });
    if (_reason === 'no existe') expect(runInTenant).toHaveBeenCalledTimes(1);
    else expect(runInTenant).toHaveBeenCalledTimes(2);
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
      expect.objectContaining({
        newValue: {
          action: 'RESERVE',
          executionOrderId: 'eo-001',
          routerId: 'router-001',
          ipv4NetworkId: 'network-001',
          controlMethod: 'PCQ_ADDRESS_LIST',
        },
      }),
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
        _case === 'método de control no soportado'
          ? 'CONTROL_METHOD_NOT_SUPPORTED'
          : 'RESOURCE_NOT_FOUND';
      await expect(service.reserve(reserveBody as never, actor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: expectedCode }),
      });
    },
  );

  it('certify retorna sin mutar una certificación con la misma evidencia', async () => {
    const row = reserveRow({ status: 'CERTIFIED', certificationEvidenceId: 'evidence-001' });
    const { service, manager, auditService, executionOrderReadPort } = createService({
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('tech-1')),
      },
    });
    mockProvisioningAndParents(manager, row);
    const result = await service.certify(
      row.id as string,
      { version: 1, evidenceId: 'evidence-001' },
      actor,
    );
    expect(result.status).toBe('CERTIFIED');
    expect(executionOrderReadPort.getExecutionSnapshot).toHaveBeenCalledWith('eo-001');
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.logWithin).not.toHaveBeenCalled();
  });

  it.each([
    ['registro ausente', null, 1, 'RESOURCE_NOT_FOUND'],
    ['versión desactualizada', reserveRow({ version: 2 }), 1, 'VERSION_CONFLICT'],
    ['estado no reservable', reserveRow({ status: 'ACTIVE' }), 1, 'PROVISIONING_STATE_INVALID'],
  ] as const)('certify rechaza cuando hay %s', async (_case, row, version, message) => {
    const { service, manager } = createService();
    mockProvisioningAndParents(manager, row as Record<string, unknown> | null);
    const result = service.certify(
      'provisioning-001',
      { version, evidenceId: 'evidence-001' },
      actor,
    );
    await expect(result).rejects.toMatchObject({
      response: expect.objectContaining({ code: message }),
    });
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
    mockProvisioningAndParents(manager, reserveRow());
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
    mockProvisioningAndParents(manager, row);
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
    mockProvisioningAndParents(manager, reserveRow());
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
    mockProvisioningAndParents(manager, reserveRow());
    await expect(
      service.release('provisioning-001', { version: 1, reason: 'Liberación justificada' }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: _case === 'sin orden' ? 'RESOURCE_NOT_FOUND' : 'PROVISIONING_ORDER_NOT_ELIGIBLE',
      }),
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
    mockProvisioningAndParents(manager, row, { assignment });
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
      expect.objectContaining({
        newValue: {
          action: 'RELEASE',
          releaseReason: 'MANUAL',
          fromStatus: 'RESERVED',
          toStatus: 'RELEASED',
          reasonProvided: true,
          changedFields: ['status', 'ipAssignment'],
        },
      }),
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
    mockProvisioningAndParents(manager, row, { assignment });
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
    mockProvisioningAndParents(manager, row);
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
    const { service, executionOrderReadPort, manager } = createService({
      permissions: [],
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    expect(executionOrderReadPort.getExecutionReference).toHaveBeenCalledWith('eo-001');
    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalledWith(IpAssignment, expect.anything());
    const provisioningCalls = manager.findOne.mock.calls.filter(
      ([entity]) => entity === ServiceProvisioning,
    );
    expect(provisioningCalls).toHaveLength(1);
    expect(provisioningCalls[0]?.[1]).toMatchObject({
      select: { id: true, routerId: true, ipv4NetworkId: true },
    });
    expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
  });

  it('getOrderContext reconoce lectura site-scoped sobre la sede persistida del router', async () => {
    const {
      service,
      manager,
      effectivePermissionScope,
      subscriberContextPort,
      executionOrderReadPort,
    } = createService({
      permissions: [],
      siteDecision: 'ALLOWED',
      executionOrderReadPort: {
        getExecutionSnapshot: jest
          .fn()
          .mockResolvedValue(order('technician-001', { subscriberId: null })),
      },
    });
    mockProvisioningAndParents(manager, reserveRow(), { siteId: 'site-a' });

    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
    });
    expect(effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    });
    expect(effectivePermissionScope.evaluateSite.mock.invocationCallOrder[0]!).toBeLessThan(
      (executionOrderReadPort.getExecutionSnapshot as jest.Mock).mock.invocationCallOrder[0]!,
    );
    expectMinimalAuthorizationProjection(manager, 2);
    const provisioningCalls = manager.findOne.mock.calls.filter(
      ([entity]) => entity === ServiceProvisioning,
    );
    expect(provisioningCalls).toHaveLength(2);
    expect(provisioningCalls[0]?.[1]).toMatchObject({
      select: { id: true, routerId: true, ipv4NetworkId: true },
    });
    expect(provisioningCalls[1]?.[1]).not.toHaveProperty('select');
    const fullServiceCallIndex = manager.findOne.mock.calls.findIndex(
      ([entity, options]) => entity === ServiceProvisioning && !('select' in (options ?? {})),
    );
    expect(effectivePermissionScope.evaluateSite.mock.invocationCallOrder[0]!).toBeLessThan(
      manager.findOne.mock.invocationCallOrder[fullServiceCallIndex]!,
    );
    expect(executionOrderReadPort.getExecutionReference).toHaveBeenCalledWith('eo-001');
    expect(subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();
  });

  it('getOrderContext devuelve 403 en sede visible sin permiso de lectura exacto', async () => {
    const {
      service,
      manager,
      effectivePermissionScope,
      subscriberContextPort,
      executionOrderReadPort,
    } = createService({
      permissions: [],
      siteDecision: 'IN_SCOPE_NO_ACTION',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('technician-001')),
      },
    });
    mockProvisioningAndParents(manager, reserveRow(), { siteId: 'site-a' });

    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    expect(effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-a',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    });
    expect(subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();
    expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalledWith(IpAssignment, expect.anything());
    expectMinimalAuthorizationProjection(manager);
  });

  it('getOrderContext devuelve 404 cuando el recurso pertenece a una sede fuera de alcance', async () => {
    const {
      service,
      manager,
      effectivePermissionScope,
      subscriberContextPort,
      executionOrderReadPort,
    } = createService({
      permissions: [],
      siteDecision: 'OUT_OF_SCOPE',
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('another-technician')),
      },
    });
    mockProvisioningAndParents(manager, reserveRow(), { siteId: 'site-b' });

    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      }),
    });
    expect(effectivePermissionScope.evaluateSite).toHaveBeenCalledWith({
      actorId: actor.sub,
      siteId: 'site-b',
      permissionKey: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    });
    expect(subscriberContextPort.getForSubscriber).not.toHaveBeenCalled();
    expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalledWith(IpAssignment, expect.anything());
    expectMinimalAuthorizationProjection(manager);
  });

  it('getOrderContext limita la lectura operativa al técnico asignado', async () => {
    const { service, manager, executionOrderReadPort } = createService({
      permissions: [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ],
      executionOrderReadPort: {
        getExecutionSnapshot: jest.fn().mockResolvedValue(order('another-technician')),
      },
    });
    await expect(service.getOrderContext('eo-001', actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    const provisioningCalls = manager.findOne.mock.calls.filter(
      ([entity]) => entity === ServiceProvisioning,
    );
    expect(provisioningCalls).toHaveLength(1);
    expect(provisioningCalls[0]?.[1]).toMatchObject({
      select: { id: true, routerId: true, ipv4NetworkId: true },
    });
    expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
    expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalledWith(IpAssignment, expect.anything());
  });

  it.each(['OUT_OF_SCOPE', 'IN_SCOPE_NO_ACTION'] as const)(
    'getOrderContext conserva la proyección reducida del técnico asignado con decisión site %s',
    async (siteDecision) => {
      const { service, manager, executionOrderReadPort, effectivePermissionScope } = createService({
        permissions: [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ],
        siteDecision,
        executionOrderReadPort: {
          getExecutionReference: jest
            .fn()
            .mockResolvedValue({ id: 'eo-001', assignedTechnicianId: actor.sub }),
        },
      });
      mockProvisioningAndParents(manager, reserveRow(), { siteId: 'site-b' });

      const response = await service.getOrderContext('eo-001', actor);

      expect(Object.keys(response).sort()).toEqual([
        'certified',
        'executionOrderId',
        'ip',
        'status',
        'updatedAt',
      ]);
      expect(response).toMatchObject({ executionOrderId: 'eo-001', status: 'RESERVED' });
      expect(executionOrderReadPort.getExecutionReference).toHaveBeenCalledWith('eo-001');
      expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
      expect(executionOrderReadPort.listProvisioningEvidence).not.toHaveBeenCalled();
      expectMinimalAuthorizationProjection(manager, 2);
      const provisioningCalls = manager.findOne.mock.calls.filter(
        ([entity]) => entity === ServiceProvisioning,
      );
      expect(provisioningCalls).toHaveLength(2);
      expect(provisioningCalls[1]?.[1]).toMatchObject({
        select: {
          id: true,
          routerId: true,
          ipv4NetworkId: true,
          status: true,
          updatedAt: true,
        },
      });
      expect(provisioningCalls[1]?.[1]).not.toHaveProperty('select.customerDisplayLabel');
      const assignmentCalls = manager.findOne.mock.calls.filter(
        ([entity]) => entity === IpAssignment,
      );
      expect(assignmentCalls).toHaveLength(1);
      expect(assignmentCalls[0]?.[1]).toMatchObject({ select: { ip: true, status: true } });
      const executionReadAuthorizationIndex =
        effectivePermissionScope.authorizeTenantWide.mock.calls.findIndex(
          ([input]) => input.permissionKey === AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
        );
      expect(executionReadAuthorizationIndex).toBeGreaterThanOrEqual(0);
      expect(
        effectivePermissionScope.authorizeTenantWide.mock.invocationCallOrder[
          executionReadAuthorizationIndex
        ],
      ).toBeLessThan(
        manager.findOne.mock.invocationCallOrder[
          manager.findOne.mock.calls.findIndex(
            ([entity, options]) =>
              entity === ServiceProvisioning &&
              (options as { select?: unknown }).select !== undefined &&
              JSON.stringify((options as { select?: unknown }).select) ===
                JSON.stringify({
                  id: true,
                  routerId: true,
                  ipv4NetworkId: true,
                  status: true,
                  updatedAt: true,
                }),
          )
        ]!,
      );
    },
  );

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
