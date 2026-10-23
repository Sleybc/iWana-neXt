import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  CreateIpv4NetworkBodySchema,
  CreateRouterBodySchema,
  UpdateIpv4NetworkBodySchema,
  UpdateRouterBodySchema,
} from '@iwana/shared';
import type { DataSource } from 'typeorm';
import { IpamService } from './ipam.service';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { NetworkCatalogService } from './network-catalog.service';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    ...jest.requireActual('@iwana/db').TenantContext,
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const tenant = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  tenantSlug: 'mod13-catalog-test',
  schemaName: 'tenant_mod13_catalog_test',
};
const actorId = '22222222-2222-4222-8222-222222222222';
const routerId = '33333333-3333-4333-8333-333333333333';
const networkId = '44444444-4444-4444-8444-444444444444';
const timestamp = new Date('2026-10-23T12:00:00.000Z');
const router = {
  id: routerId,
  tenantId: tenant.tenantId,
  name: 'Router fixture',
  managementHost: 'router.fixture.invalid',
  lanInterface: null,
  supportedControlMethods: ['PCQ_ADDRESS_LIST'],
  organizationSiteId: null,
  commercialNodeId: null,
  status: 'ACTIVE',
  notes: null,
  createdBy: actorId,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const network = {
  id: networkId,
  tenantId: tenant.tenantId,
  routerId,
  name: 'Red fixture',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.1/24',
  assignableFrom: '192.0.2.10/24',
  assignableTo: '192.0.2.200/24',
  excludedIps: ['192.0.2.20/24'],
  defaultControlMethod: 'PCQ_ADDRESS_LIST',
  status: 'ACTIVE',
  createdBy: actorId,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function createQueryBuilder() {
  const builder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    leftJoin: jest.fn(),
    addSelect: jest.fn(),
    clone: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getCount: jest.fn().mockResolvedValue(1),
    getMany: jest.fn().mockResolvedValue([router]),
    getRawAndEntities: jest.fn().mockResolvedValue({
      entities: [network],
      raw: [{ router_name: router.name }],
    }),
  };
  for (const method of [
    builder.where,
    builder.andWhere,
    builder.leftJoin,
    builder.addSelect,
    builder.orderBy,
    builder.addOrderBy,
    builder.skip,
    builder.take,
  ]) {
    method.mockReturnValue(builder);
  }
  builder.clone.mockReturnValue(builder);
  return builder;
}

function createHarness() {
  const queryBuilder = createQueryBuilder();
  const transactionQuery = jest.fn().mockResolvedValue([]);
  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({
      id: networkId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    })),
    save: jest.fn(async (_entity: unknown, value: Record<string, unknown>) => ({
      id: networkId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...value,
    })),
    query: jest.fn(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('normalized_cidr')) {
        return [
          {
            normalized_cidr: '192.0.2.0/24',
            gateway_inside: true,
            from_inside: true,
            to_inside: true,
            range_ordered: true,
          },
        ];
      }
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      if (sql.includes('COUNT(*)')) return [{ count: '2' }];
      return [];
    }),
  };
  runInTenant.mockImplementation(async (_source, _schema, operation) =>
    operation({ manager, query: transactionQuery } as never),
  );
  const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const actorReadPort = { findByIds: jest.fn().mockResolvedValue([]) };
  const ipamService = {
    getOccupancy: jest.fn().mockResolvedValue({ assigned: 2, available: 189 }),
  };
  const service = new NetworkCatalogService(
    {} as DataSource,
    auditService as never,
    actorReadPort as unknown as NetworkActorReadPort,
    ipamService as unknown as IpamService,
  );
  return {
    service,
    manager,
    queryBuilder,
    transactionQuery,
    auditService,
    actorReadPort,
    ipamService,
  };
}

const routerBody = CreateRouterBodySchema.parse({
  name: ' Router nuevo ',
  managementHost: 'router.example.invalid',
  supportedControlMethods: ['PCQ_ADDRESS_LIST'],
  lanInterface: 'bridge-fixture',
  notes: 'Nota sintética',
});
const networkBody = CreateIpv4NetworkBodySchema.parse({
  routerId,
  name: ' Red nueva ',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.1',
  assignableFrom: '192.0.2.10',
  assignableTo: '192.0.2.200',
  excludedIps: ['192.0.2.20'],
  defaultControlMethod: 'PCQ_ADDRESS_LIST',
});

describe('NetworkCatalogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(tenant);
  });

  afterEach(() => jest.restoreAllMocks());

  it('lista routers con filtros, paginación y conteo de redes', async () => {
    const { service, queryBuilder, manager } = createHarness();

    const result = await service.listRouters({
      page: 2,
      limit: 1,
      q: '  fixture  ',
      status: 'ACTIVE',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2);
    expect(queryBuilder.skip).toHaveBeenCalledWith(1);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('COUNT(*)'), [
      tenant.tenantId,
      routerId,
    ]);
    expect(result.data[0]?.name).toBe(router.name);
    expect(result.meta.page).toBe(2);
  });

  it('lista routers sin filtros ni resultados y normaliza límites', async () => {
    const { service, queryBuilder } = createHarness();
    queryBuilder.getMany.mockResolvedValue([]);
    queryBuilder.getCount.mockResolvedValue(0);

    const result = await service.listRouters({ page: 1, limit: 500 });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.take).toHaveBeenCalledWith(100);
    expect(result.data).toEqual([]);
  });

  it('crea un router, normaliza texto y registra auditoría con los campos enviados', async () => {
    const { service, auditService, manager } = createHarness();

    const result = await service.createRouter(routerBody, actorId);

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Router nuevo',
        managementHost: 'router.example.invalid',
        status: 'ACTIVE',
      }),
    );
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          changedFields: expect.arrayContaining(['lanInterface', 'notes']),
        }),
      }),
      expect.anything(),
    );
    expect(result.networkCount).toBe(2);
  });

  it('traduce la colisión de nombre único de router al conflicto de contrato', async () => {
    const { service, manager } = createHarness();
    manager.save.mockRejectedValue({
      driverError: { code: '23505', constraint: 'uq_network_routers_tenant_name' },
    });

    await expect(service.createRouter(routerBody, actorId)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('actualiza router con versión vigente y verifica control method en redes ya creadas', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });

    const result = await service.updateRouter(
      routerId,
      UpdateRouterBodySchema.parse({
        version: 1,
        name: ' Router editado ',
        supportedControlMethods: ['PCQ_ADDRESS_LIST'],
      }),
      actorId,
    );

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('NOT (default_control_method'),
      [tenant.tenantId, routerId, ['PCQ_ADDRESS_LIST']],
    );
    expect(result.name).toBe('Router editado');
    expect(result.version).toBe(2);
  });

  it.each([
    ['no existe', null, 1],
    ['tiene versión distinta', { ...router, version: 2 }, 1],
  ])('rechaza actualizar un router que %s', async (_label, found, expectedVersion) => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValue(found);

    const operation = service.updateRouter(
      routerId,
      UpdateRouterBodySchema.parse({ version: expectedVersion, name: 'Router' }),
      actorId,
    );
    await expect(operation).rejects.toBeInstanceOf(found ? ConflictException : NotFoundException);
  });

  it('rechaza cambiar métodos del router que dejarían una red incompatible', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });
    manager.query.mockResolvedValueOnce([{ id: 1 }]);

    await expect(
      service.updateRouter(
        routerId,
        UpdateRouterBodySchema.parse({
          version: 1,
          supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'CONTROL_METHOD_NOT_SUPPORTED' } });
  });

  it('traduce la colisión única al editar router', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });
    manager.save.mockRejectedValue({ code: '23505', constraint: 'uq_network_routers_tenant_name' });

    await expect(
      service.updateRouter(
        routerId,
        UpdateRouterBodySchema.parse({ version: 1, name: 'Router' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('cambia estado del router y audita la mutación', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });

    const result = await service.setRouterStatus(routerId, 1, 'INACTIVE', actorId);

    expect(result.status).toBe('INACTIVE');
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ changedFields: ['status'] }) }),
      expect.anything(),
    );
  });

  it('lista redes IPv4 filtradas y proyecta ocupación y nombre del router', async () => {
    const { service, queryBuilder, ipamService } = createHarness();

    const result = await service.listIpv4Networks({
      page: 1,
      limit: 25,
      routerId,
      status: 'ACTIVE',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2);
    expect(ipamService.getOccupancy).toHaveBeenCalledWith(networkId, expect.anything());
    expect(result.data[0]).toMatchObject({
      routerName: router.name,
      gateway: '192.0.2.1',
      excludedIps: ['192.0.2.20'],
    });
  });

  it('lista redes sin filtros y usa nombre vacío si falta la proyección raw', async () => {
    const { service, queryBuilder } = createHarness();
    queryBuilder.getRawAndEntities.mockResolvedValue({ entities: [network], raw: [] });

    const result = await service.listIpv4Networks({ page: 1, limit: 20 });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(result.data[0]?.routerName).toBe('');
  });

  it('crea una red activa y guarda los campos permitidos en auditoría', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });

    const result = await service.createIpv4Network(networkBody, actorId);

    expect(result.name).toBe('Red nueva');
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Ipv4Network',
        newValue: expect.objectContaining({ excludedIpCount: 1 }),
      }),
      expect.anything(),
    );
  });

  it('rechaza crear una red sin router activo o con método no habilitado', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    manager.findOne.mockResolvedValueOnce({
      ...router,
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
    });
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toMatchObject({
      response: { code: 'CONTROL_METHOD_NOT_SUPPORTED' },
    });
  });

  it('rechaza rangos fuera del CIDR y traduce la exclusión de solapamiento', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });
    manager.query.mockResolvedValueOnce([
      {
        normalized_cidr: '192.0.2.0/24',
        gateway_inside: false,
        from_inside: true,
        to_inside: true,
        range_ordered: true,
      },
    ]);
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    manager.query.mockResolvedValueOnce([
      {
        normalized_cidr: '192.0.2.0/24',
        gateway_inside: true,
        from_inside: true,
        to_inside: true,
        range_ordered: true,
      },
    ]);
    manager.save.mockRejectedValueOnce({
      driverError: { code: '23P01', constraint: 'ex_ipv4_networks_overlap' },
    });
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toMatchObject({
      response: { code: 'NETWORK_OVERLAP' },
    });
  });

  it('actualiza una red con cambios opcionales y detecta IP viva fuera del nuevo rango', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity) =>
      entity.name === 'Ipv4Network' ? { ...network } : { ...router },
    );
    const update = UpdateIpv4NetworkBodySchema.parse({
      version: 1,
      name: ' Red editada ',
      excludedIps: ['192.0.2.30'],
    });

    const result = await service.updateIpv4Network(networkId, update, actorId);
    expect(result.name).toBe('Red editada');
    expect(result.excludedIps).toEqual(['192.0.2.30']);

    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('normalized_cidr'))
        return [
          {
            normalized_cidr: '192.0.2.0/24',
            gateway_inside: true,
            from_inside: true,
            to_inside: true,
            range_ordered: true,
          },
        ];
      if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
      return [];
    });
    await expect(service.updateIpv4Network(networkId, update, actorId)).rejects.toMatchObject({
      response: { code: 'IP_IN_USE' },
    });
  });

  it('rechaza editar una red con entidad, router o versión faltantes', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateIpv4Network(networkId, { version: 1 }, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
    manager.findOne.mockResolvedValueOnce({ ...network, version: 2 });
    await expect(
      service.updateIpv4Network(networkId, { version: 1 }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
    manager.findOne.mockResolvedValueOnce({ ...network });
    manager.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateIpv4Network(networkId, { version: 1 }, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza un método de red no admitido por el router', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity) =>
      entity.name === 'Ipv4Network' ? { ...network } : { ...router },
    );
    await expect(
      service.updateIpv4Network(
        networkId,
        UpdateIpv4NetworkBodySchema.parse({
          version: 1,
          defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'CONTROL_METHOD_NOT_SUPPORTED' } });
  });

  it('desactiva una red y rechaza un router inexistente al cambiar su estado', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity) =>
      entity.name === 'Ipv4Network' ? { ...network } : { ...router },
    );
    await expect(
      service.setIpv4NetworkStatus(networkId, 1, 'INACTIVE', actorId),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
    manager.findOne.mockImplementation(async (entity) =>
      entity.name === 'Ipv4Network' ? { ...network } : null,
    );
    await expect(
      service.setIpv4NetworkStatus(networkId, 1, 'ACTIVE', actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resuelve perfiles por plan y crea o actualiza el perfil PCQ con auditoría', async () => {
    const { service, manager, actorReadPort, auditService } = createHarness();
    const profile = {
      id: networkId,
      tenantId: tenant.tenantId,
      planId: 'plan-001',
      pcqAddressList: 'customers',
      createdBy: actorId,
      updatedAt: timestamp,
    };
    manager.find.mockResolvedValue([profile]);
    actorReadPort.findByIds.mockResolvedValue([{ id: actorId, name: 'Actor fixture' }]);
    await expect(service.listPlanProfiles()).resolves.toEqual([
      expect.objectContaining({
        planId: profile.planId,
        updatedBy: { id: actorId, name: 'Actor fixture' },
      }),
    ]);

    manager.findOne.mockResolvedValueOnce(null);
    await service.putPlanProfile('plan-002', 'edge-pcq', actorId);
    expect(auditService.logWithin).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'CREATE' }),
      expect.anything(),
    );
    manager.findOne.mockResolvedValueOnce({ ...profile });
    await service.putPlanProfile(profile.planId, 'updated-pcq', actorId);
    expect(auditService.logWithin).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'UPDATE' }),
      expect.anything(),
    );
  });

  it('devuelve ajustes ausentes por defecto y actualiza la guarda con auditoría', async () => {
    const { service, manager, actorReadPort, auditService } = createHarness();
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.getNetworkSettings()).resolves.toMatchObject({
      enforceProvisioningOnInstallClose: false,
      updatedAt: null,
      updatedBy: null,
    });
    actorReadPort.findByIds.mockResolvedValue([{ id: actorId, name: 'Actor fixture' }]);
    await service.updateNetworkSettings(true, actorId);
    expect(auditService.logWithin).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entityType: 'NetworkSettings',
        newValue: { enforceProvisioningOnInstallClose: { before: false, after: true } },
      }),
      expect.anything(),
    );
    manager.findOne.mockResolvedValueOnce({
      enforceProvisioningOnInstallClose: true,
      updatedAt: timestamp,
      updatedBy: actorId,
    });
    await expect(service.getNetworkSettings()).resolves.toMatchObject({
      updatedBy: { id: actorId },
    });
  });
});
