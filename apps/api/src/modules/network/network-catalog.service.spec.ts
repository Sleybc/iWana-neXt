import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AssistedCreateIpv4NetworkBodySchema,
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
const interfaceId = '99999999-9999-4999-8999-999999999999';
const siteId = '55555555-5555-4555-8555-555555555555';
const otherSiteId = '66666666-6666-4666-8666-666666666666';
const nodeId = '77777777-7777-4777-8777-777777777777';
const otherNodeId = '88888888-8888-4888-8888-888888888888';
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
            exclusions_inside: true,
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
    lockIpv4Pools: jest.fn().mockResolvedValue(undefined),
  };
  const authorization = {
    authorizedSiteScope: jest.fn().mockResolvedValue({ kind: 'TENANT_WIDE' }),
    requireTenantWideAction: jest.fn().mockResolvedValue(undefined),
    requireSiteAction: jest.fn().mockResolvedValue(undefined),
    requireSiteOrTenantWideAction: jest.fn().mockResolvedValue(undefined),
    requireCreateScope: jest.fn().mockResolvedValue(undefined),
  };
  const organizationSiteReadPort = {
    findReferenceById: jest.fn().mockResolvedValue({ id: 'site-id', isActive: true }),
    findRouterSummaryById: jest.fn(),
    listRouterOptions: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  };
  const commercialNodeReadPort = {
    findReferenceById: jest
      .fn()
      .mockResolvedValue({ id: 'node-id', isActive: true, deletedAt: null }),
    findRouterSummaryById: jest.fn(),
  };
  const service = new NetworkCatalogService(
    {} as DataSource,
    auditService as never,
    actorReadPort as unknown as NetworkActorReadPort,
    ipamService as unknown as IpamService,
    authorization as never,
    organizationSiteReadPort as never,
    commercialNodeReadPort as never,
  );
  return {
    service,
    manager,
    queryBuilder,
    transactionQuery,
    auditService,
    actorReadPort,
    ipamService,
    authorization,
    organizationSiteReadPort,
    commercialNodeReadPort,
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

function assistedNetworkBody(
  overrides: Partial<ReturnType<typeof AssistedCreateIpv4NetworkBodySchema.parse>> = {},
) {
  return AssistedCreateIpv4NetworkBodySchema.parse({
    source: { mode: 'MANUAL_CIDR', cidr: '192.0.2.0/24', gateway: '192.0.2.1' },
    assignableFrom: '192.0.2.10',
    assignableTo: '192.0.2.200',
    defaultControlMethod: 'PCQ_ADDRESS_LIST',
    ...overrides,
  });
}

function mockValidAssistedNetworkQueries(
  manager: ReturnType<typeof createHarness>['manager'],
  interfaceRow?: { id: string; name: string; status: string },
) {
  manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
    if (sql.includes('SELECT family')) {
      return [
        {
          source_prefix_assignable: true,
          confirmed_prefix_assignable: true,
          same_network: true,
        },
      ];
    }
    if (sql.includes('normalized_cidr')) {
      return [
        {
          normalized_cidr: '192.0.2.0/24',
          gateway_inside: true,
          from_inside: true,
          to_inside: true,
          range_ordered: true,
          exclusions_inside: true,
        },
      ];
    }
    if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
    if (sql.includes('COUNT(*)')) return [{ count: '0' }];
    if (sql.includes('SELECT status FROM network_routers')) return [{ status: 'ACTIVE' }];
    if (sql.includes('SELECT id, name, status FROM network_router_interfaces')) {
      return interfaceRow ? [interfaceRow] : [];
    }
    return [];
  });
}

describe('NetworkCatalogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(tenant);
  });

  afterEach(() => jest.restoreAllMocks());

  it('proyecta el detalle de router con resúmenes owner-side y conteo tenant-local', async () => {
    const { service, manager, authorization, organizationSiteReadPort, commercialNodeReadPort } =
      createHarness();
    manager.findOne.mockResolvedValue({
      ...router,
      organizationSiteId: siteId,
      commercialNodeId: nodeId,
      legacyLanInterfaceId: null,
    });
    manager.query
      .mockResolvedValueOnce([{ count: '3' }])
      .mockResolvedValueOnce([{ interface_count: '4' }]);
    organizationSiteReadPort.findRouterSummaryById.mockResolvedValue({
      name: 'Sede de pruebas',
      siteType: 'OFFICE',
      isActive: true,
    });
    commercialNodeReadPort.findRouterSummaryById.mockResolvedValue({
      name: 'Nodo comercial de pruebas',
      isActive: true,
    });

    await expect(service.getRouterDetail(routerId, actorId)).resolves.toMatchObject({
      id: routerId,
      networkCount: 3,
      interfaceCount: 4,
      organizationSite: { name: 'Sede de pruebas', siteType: 'OFFICE', isActive: true },
      commercialNode: { name: 'Nodo comercial de pruebas', isActive: true },
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: { id: routerId, tenantId: tenant.tenantId } }),
    );
    expect(authorization.requireSiteOrTenantWideAction).toHaveBeenCalledWith(
      actorId,
      siteId,
      expect.anything(),
    );
    expect(organizationSiteReadPort.findRouterSummaryById).toHaveBeenCalledWith(siteId);
    expect(commercialNodeReadPort.findRouterSummaryById).toHaveBeenCalledWith(nodeId);
  });

  it('expone opciones de sede según el ámbito autorizado y metadatos fail-closed', async () => {
    const { service, authorization, organizationSiteReadPort } = createHarness();
    const scope = { kind: 'SITE_IDS' as const, siteIds: [siteId] };
    authorization.authorizedSiteScope.mockResolvedValue(scope);
    organizationSiteReadPort.listRouterOptions.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });

    await expect(service.listRouterSiteOptions({ page: 2, limit: 10 }, actorId)).resolves.toEqual({
      data: [],
      meta: { total: 0 },
    });
    expect(organizationSiteReadPort.listRouterOptions).toHaveBeenCalledWith({
      scope,
      page: 2,
      limit: 10,
    });
    await expect(service.getCatalogMeta(actorId)).resolves.toEqual({ ipProtection: 'PENDING' });
    expect(authorization.requireTenantWideAction).toHaveBeenCalledWith(actorId, expect.anything());
  });

  it('lista routers con filtros, paginación y conteo de redes', async () => {
    const { service, queryBuilder, manager } = createHarness();

    const result = await service.listRouters(
      {
        page: 2,
        limit: 1,
        q: '  fixture  ',
        status: 'ACTIVE',
      },
      actorId,
    );

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

    const result = await service.listRouters({ page: 1, limit: 500 }, actorId);

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.take).toHaveBeenCalledWith(100);
    expect(result.data).toEqual([]);
  });

  it('filtra GET por los sitios autorizados antes de contar resultados', async () => {
    const { service, authorization, queryBuilder } = createHarness();
    authorization.authorizedSiteScope.mockResolvedValue({ kind: 'SITE_IDS', siteIds: [siteId] });

    await service.listRouters({ page: 1, limit: 20 }, actorId);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'router.organization_site_id IN (:...authorizedSiteIds)',
      { authorizedSiteIds: [siteId] },
    );
    expect(queryBuilder.clone).toHaveBeenCalled();
  });

  it('crea un router sin persistir nombres ni valores de conexión en auditoría manual', async () => {
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
        newValue: {
          status: 'ACTIVE',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
          changedFields: [
            'name',
            'managementHost',
            'supportedControlMethods',
            'lanInterface',
            'notes',
          ],
        },
      }),
      expect.anything(),
    );
    expect(result.networkCount).toBe(2);
  });

  it('valida el nodo comercial al crear un router', async () => {
    const { service, commercialNodeReadPort } = createHarness();
    const input = CreateRouterBodySchema.parse({ ...routerBody, commercialNodeId: nodeId });

    await expect(service.createRouter(input, actorId)).resolves.toMatchObject({
      commercialNodeId: nodeId,
    });
    expect(commercialNodeReadPort.findReferenceById).toHaveBeenCalledWith(nodeId);
  });

  it('traduce la colisión única del router al error estable del contrato', async () => {
    const { service, manager } = createHarness();
    manager.save.mockRejectedValue({
      driverError: { code: '23505', constraint: 'uq_network_routers_tenant_name' },
    });

    await expect(service.createRouter(routerBody, actorId)).rejects.toMatchObject({
      response: { code: 'ROUTER_NAME_IN_USE' },
    });
  });

  it('actualiza router con versión vigente y audita solo metadatos no sensibles', async () => {
    const { service, manager, auditService } = createHarness();
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
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: {
          status: 'ACTIVE',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
          changedFields: ['name', 'supportedControlMethods'],
        },
      }),
      expect.anything(),
    );
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
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1') && sql.includes('ipv4_networks')) return [{ exists: 1 }];
      if (sql.includes('SELECT id FROM ipv4_networks')) return [{ id: networkId }];
      return [];
    });

    await expect(
      service.updateRouter(
        routerId,
        UpdateRouterBodySchema.parse({
          version: 1,
          supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'CONTROL_METHOD_IN_USE' } });
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
    ).rejects.toMatchObject({ response: { code: 'ROUTER_NAME_IN_USE' } });
  });

  it('oculta en PATCH un router fuera del ámbito y no consulta puertos propietarios', async () => {
    const { service, manager, authorization, organizationSiteReadPort, commercialNodeReadPort } =
      createHarness();
    manager.findOne.mockResolvedValue({ ...router, organizationSiteId: otherSiteId });
    authorization.requireSiteOrTenantWideAction.mockRejectedValueOnce(
      new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      }),
    );

    await expect(
      service.updateRouter(
        routerId,
        UpdateRouterBodySchema.parse({ version: 1, name: 'Cambio' }),
        actorId,
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      },
    });
    expect(authorization.requireSiteOrTenantWideAction).toHaveBeenCalledWith(
      actorId,
      otherSiteId,
      expect.anything(),
    );
    expect(organizationSiteReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('comprueba la versión antes de resolver nuevas referencias', async () => {
    const { service, manager, organizationSiteReadPort, commercialNodeReadPort } = createHarness();
    manager.findOne.mockResolvedValue({ ...router, version: 2 });

    await expect(
      service.updateRouter(
        routerId,
        UpdateRouterBodySchema.parse({
          version: 1,
          organizationSiteId: siteId,
          commercialNodeId: nodeId,
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: 'VERSION_CONFLICT' } });
    expect(organizationSiteReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('resuelve la sede propietaria antes de autorizar su alcance real', async () => {
    const { service, authorization, organizationSiteReadPort, manager, commercialNodeReadPort } =
      createHarness();
    organizationSiteReadPort.findReferenceById.mockResolvedValueOnce({
      id: siteId,
      isActive: true,
    });
    authorization.requireSiteAction.mockRejectedValueOnce(
      new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      }),
    );

    const outOfScopeError = await service
      .createRouter({ ...routerBody, organizationSiteId: siteId }, actorId)
      .catch((error: unknown) => error);

    expect(organizationSiteReadPort.findReferenceById).toHaveBeenCalledWith(siteId);
    expect(organizationSiteReadPort.findReferenceById.mock.invocationCallOrder[0]!).toBeLessThan(
      authorization.requireSiteAction.mock.invocationCallOrder[0]!,
    );
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();

    organizationSiteReadPort.findReferenceById.mockResolvedValueOnce(null);
    const missingError = await service
      .createRouter({ ...routerBody, organizationSiteId: siteId }, actorId)
      .catch((error: unknown) => error);
    expect(missingError).toBeInstanceOf(NotFoundException);
    expect((missingError as NotFoundException).getResponse()).toEqual(
      (outOfScopeError as NotFoundException).getResponse(),
    );
    expect(authorization.requireSiteAction).toHaveBeenCalledTimes(1);
  });

  it('rechaza referencia inválida o inactiva con resultado uniforme y sin persistir', async () => {
    const { service, organizationSiteReadPort, commercialNodeReadPort, manager } = createHarness();
    organizationSiteReadPort.findReferenceById.mockResolvedValueOnce(null);

    await expect(
      service.createRouter({ ...routerBody, organizationSiteId: siteId }, actorId),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      },
    });
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();

    organizationSiteReadPort.findReferenceById.mockResolvedValueOnce({
      id: siteId,
      isActive: false,
    });
    await expect(
      service.createRouter({ ...routerBody, organizationSiteId: siteId }, actorId),
    ).rejects.toMatchObject({ status: 409, response: { code: 'SITE_OR_NODE_INACTIVE' } });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('preserva referencias históricas inactivas y respeta omission, null y UUID en PATCH', async () => {
    const { service, manager, organizationSiteReadPort, commercialNodeReadPort, authorization } =
      createHarness();
    const historical = { ...router, organizationSiteId: siteId, commercialNodeId: nodeId };
    manager.findOne
      .mockResolvedValueOnce({ ...historical })
      .mockResolvedValueOnce({ ...historical })
      .mockResolvedValueOnce({ ...historical });
    organizationSiteReadPort.findReferenceById.mockResolvedValue({ id: siteId, isActive: false });
    commercialNodeReadPort.findReferenceById.mockResolvedValue({
      id: nodeId,
      isActive: false,
      deletedAt: timestamp,
    });

    const omitted = await service.updateRouter(
      routerId,
      UpdateRouterBodySchema.parse({ version: 1, name: 'Renombrado' }),
      actorId,
    );
    expect(omitted.organizationSiteId).toBe(siteId);
    expect(omitted.commercialNodeId).toBe(nodeId);
    expect(organizationSiteReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();

    const deselected = await service.updateRouter(
      routerId,
      UpdateRouterBodySchema.parse({
        version: 1,
        organizationSiteId: null,
        commercialNodeId: null,
      }),
      actorId,
    );
    expect(deselected.organizationSiteId).toBeNull();
    expect(deselected.commercialNodeId).toBeNull();
    expect(organizationSiteReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();

    organizationSiteReadPort.findReferenceById.mockResolvedValueOnce({
      id: otherSiteId,
      isActive: true,
    });
    commercialNodeReadPort.findReferenceById.mockResolvedValueOnce({
      id: otherNodeId,
      isActive: true,
      deletedAt: null,
    });
    const assigned = await service.updateRouter(
      routerId,
      UpdateRouterBodySchema.parse({
        version: 1,
        organizationSiteId: otherSiteId,
        commercialNodeId: otherNodeId,
      }),
      actorId,
    );
    expect(assigned.organizationSiteId).toBe(otherSiteId);
    expect(assigned.commercialNodeId).toBe(otherNodeId);
    expect(organizationSiteReadPort.findReferenceById).toHaveBeenCalledWith(otherSiteId);
    expect(commercialNodeReadPort.findReferenceById).toHaveBeenCalledWith(otherNodeId);
    expect(authorization.requireSiteAction).toHaveBeenCalledWith(
      actorId,
      otherSiteId,
      expect.anything(),
    );
  });

  it('cambia estado del router y audita la mutación', async () => {
    const { service, manager, auditService, ipamService } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });
    manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('SELECT id FROM ipv4_networks')) return [{ id: networkId }];
      if (sql.includes('COUNT(*)')) return [{ count: '1' }];
      return [];
    });

    const result = await service.setRouterStatus(routerId, 1, 'INACTIVE', actorId);

    expect(result.status).toBe('INACTIVE');
    expect(ipamService.lockIpv4Pools).toHaveBeenCalledWith(expect.anything(), [networkId]);
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: {
          status: 'INACTIVE',
          supportedControlMethods: ['PCQ_ADDRESS_LIST'],
          changedFields: ['status'],
        },
      }),
      expect.anything(),
    );
  });

  it('lista redes IPv4 filtradas y proyecta ocupación y nombre del router', async () => {
    const { service, queryBuilder, ipamService } = createHarness();

    const result = await service.listIpv4Networks(
      {
        page: 1,
        limit: 25,
        routerId,
        interfaceId: '99999999-9999-4999-8999-999999999999',
        status: 'ACTIVE',
        q: '  fixture  ',
      },
      actorId,
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(4);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('network.router_id = :routerId', {
      routerId,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('network.interface_id = :interfaceId', {
      interfaceId: '99999999-9999-4999-8999-999999999999',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('network.status = :status', {
      status: 'ACTIVE',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('network.name ILIKE :query', {
      query: '%fixture%',
    });
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

    const result = await service.listIpv4Networks({ page: 1, limit: 20 }, actorId);

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(result.data[0]?.routerName).toBe('');
  });

  it('aplica un alcance autorizado sin sedes y no devuelve redes', async () => {
    const { service, queryBuilder, authorization } = createHarness();
    authorization.authorizedSiteScope.mockResolvedValue({ kind: 'SITE_IDS', siteIds: [] });
    queryBuilder.getCount.mockResolvedValue(0);
    queryBuilder.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

    const result = await service.listIpv4Networks({ page: 1, limit: 25 }, actorId);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('1 = 0');
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it.each([
    {
      description: 'router sin proyección disponible',
      network: { ...network, interfaceId: null },
      routerStatus: undefined,
      interfaceStatus: undefined,
      expectedReason: 'ROUTER_INACTIVE',
    },
    {
      description: 'router inactivo',
      network: { ...network, interfaceId: null },
      routerStatus: 'INACTIVE',
      interfaceStatus: undefined,
      expectedReason: 'ROUTER_INACTIVE',
    },
    {
      description: 'red inactiva con router activo',
      network: { ...network, status: 'INACTIVE', interfaceId: null },
      routerStatus: 'ACTIVE',
      interfaceStatus: undefined,
      expectedReason: 'NETWORK_INACTIVE',
    },
    {
      description: 'interfaz asociada inactiva',
      network: { ...network, interfaceId },
      routerStatus: 'ACTIVE',
      interfaceStatus: 'INACTIVE',
      expectedReason: 'INTERFACE_INACTIVE',
    },
    {
      description: 'interfaz asociada no disponible',
      network: { ...network, interfaceId },
      routerStatus: 'ACTIVE',
      interfaceStatus: undefined,
      expectedReason: 'INTERFACE_INACTIVE',
    },
    {
      description: 'red activa sin interfaz asociada',
      network: { ...network, interfaceId: null },
      routerStatus: 'ACTIVE',
      interfaceStatus: undefined,
      expectedReason: null,
    },
  ])(
    'proyecta disponibilidad cuando hay $description',
    async ({ network: listedNetwork, routerStatus, interfaceStatus, expectedReason }) => {
      const { service, queryBuilder, manager } = createHarness();
      queryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [listedNetwork],
        raw: [{ router_name: router.name }],
      });
      manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
        if (sql.includes('SELECT status FROM network_routers')) {
          return routerStatus ? [{ status: routerStatus }] : [];
        }
        if (sql.includes('SELECT id, name, status FROM network_router_interfaces')) {
          return interfaceStatus
            ? [{ id: interfaceId, name: 'Interfaz fixture', status: interfaceStatus }]
            : [];
        }
        return [];
      });

      const result = await service.listIpv4Networks({ page: 1, limit: 25 }, actorId);

      expect(result.data[0]?.reservationAvailability).toEqual({
        available: expectedReason === null,
        reason: expectedReason,
      });
      expect(result.data[0]?.interface).toEqual(
        interfaceStatus
          ? { id: interfaceId, name: 'Interfaz fixture', status: interfaceStatus }
          : null,
      );
    },
  );

  it('crea una red activa y limita auditoría manual a metadatos no IP', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockResolvedValue({ ...router });

    const result = await service.createIpv4Network(networkBody, actorId);

    expect(result.name).toBe('Red nueva');
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Ipv4Network',
        newValue: {
          status: 'ACTIVE',
          excludedIpCount: 1,
          changedFields: ['routerId', 'name', 'gateway', 'defaultControlMethod'],
        },
      }),
      expect.anything(),
    );
  });

  it('crea una red asistida desde CIDR manual, conserva el router y no asocia interfaz por inferencia', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockResolvedValueOnce({ ...router });
    mockValidAssistedNetworkQueries(manager);

    const result = await service.createAssistedIpv4Network(
      routerId,
      assistedNetworkBody({ name: '  ', excludedIps: ['192.0.2.20'] }),
      actorId,
    );

    expect(result).toMatchObject({
      routerId,
      routerName: router.name,
      name: 'Red 192.0.2.0/24',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      interfaceId: null,
      excludedIps: ['192.0.2.20'],
      reservationAvailability: { available: true, reason: null },
    });
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'Ipv4Network',
        newValue: {
          status: 'ACTIVE',
          excludedIpCount: 1,
          changedFields: ['routerId', 'interfaceId', 'name'],
        },
      }),
      expect.anything(),
    );
  });

  it('crea una red desde prefijo cuando el CIDR coincide y acepta otro gateway utilizable del bloque', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce({ ...router });
    mockValidAssistedNetworkQueries(manager);
    const input = assistedNetworkBody({
      name: 'Red por prefijo',
      source: {
        mode: 'IP_PREFIX',
        addressWithPrefix: '192.0.2.10/24',
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '192.0.2.1',
      },
    });

    await expect(
      service.createAssistedIpv4Network(routerId, input, actorId),
    ).resolves.toMatchObject({
      name: 'Red por prefijo',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      interfaceId: null,
    });
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('SELECT family($1::inet)'), [
      '192.0.2.10/24',
      '192.0.2.0/24',
    ]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('normalized_cidr'), [
      '192.0.2.0/24',
      '192.0.2.1',
      '192.0.2.10',
      '192.0.2.200',
      [],
    ]);
  });

  it('rechaza un prefijo confirmado que no corresponde al bloque ingresado', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce({ ...router });
    manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('SELECT family')) {
        return [
          {
            source_prefix_assignable: true,
            confirmed_prefix_assignable: true,
            same_network: false,
          },
        ];
      }
      return [];
    });
    const input = assistedNetworkBody({
      source: {
        mode: 'IP_PREFIX',
        addressWithPrefix: '192.0.2.10/24',
        confirmedCidr: '198.51.100.0/24',
        confirmedGateway: '198.51.100.1',
      },
    });

    await expect(service.createAssistedIpv4Network(routerId, input, actorId)).rejects.toMatchObject(
      {
        status: 400,
        response: { code: 'NETWORK_CONFIRMATION_MISMATCH' },
      },
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza un prefijo IP no asignable con el error de dominio correspondiente', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce({ ...router });
    manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('SELECT family')) {
        return [
          {
            source_prefix_assignable: false,
            confirmed_prefix_assignable: true,
            same_network: false,
          },
        ];
      }
      return [];
    });
    const input = assistedNetworkBody({
      source: {
        mode: 'IP_PREFIX',
        addressWithPrefix: '192.0.2.10/32',
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '192.0.2.1',
      },
    });

    await expect(service.createAssistedIpv4Network(routerId, input, actorId)).rejects.toMatchObject(
      {
        status: 400,
        response: { code: 'NETWORK_PREFIX_NOT_ASSIGNABLE' },
      },
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza un gateway asistido fuera del bloque antes de persistir', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce({ ...router });
    mockValidAssistedNetworkQueries(manager);
    manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('SELECT family')) {
        return [
          {
            source_prefix_assignable: true,
            confirmed_prefix_assignable: true,
            same_network: true,
          },
        ];
      }
      if (sql.includes('normalized_cidr')) {
        return [
          {
            normalized_cidr: '192.0.2.0/24',
            gateway_inside: false,
            from_inside: true,
            to_inside: true,
            range_ordered: true,
            exclusions_inside: true,
          },
        ];
      }
      return [];
    });
    const input = assistedNetworkBody({
      source: {
        mode: 'IP_PREFIX',
        addressWithPrefix: '192.0.2.10/24',
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '198.51.100.1',
      },
    });

    await expect(service.createAssistedIpv4Network(routerId, input, actorId)).rejects.toMatchObject(
      {
        status: 400,
        response: { code: 'VALIDATION_ERROR' },
      },
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('crea red desde dirección de interfaz activa y exige permiso para leer la candidata', async () => {
    const { service, manager, authorization } = createHarness();
    const interfaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const addressId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const address = {
      id: addressId,
      tenantId: tenant.tenantId,
      routerId,
      interfaceId,
      address: '192.0.2.5/24',
      version: 3,
    };
    const activeInterface = {
      id: interfaceId,
      routerId,
      name: 'ether1',
      status: 'ACTIVE',
      version: 4,
    };
    manager.findOne
      .mockResolvedValueOnce({ ...router })
      .mockResolvedValueOnce(address)
      .mockResolvedValueOnce(activeInterface)
      .mockResolvedValueOnce(activeInterface);
    mockValidAssistedNetworkQueries(manager, {
      id: interfaceId,
      name: 'ether1',
      status: 'ACTIVE',
    });
    const input = assistedNetworkBody({
      source: {
        mode: 'INTERFACE_ADDRESS',
        interfaceAddressId: addressId,
        interfaceAddressVersion: 3,
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '192.0.2.1',
      },
      interfaceId,
      interfaceVersion: 4,
    });

    await expect(
      service.createAssistedIpv4Network(routerId, input, actorId),
    ).resolves.toMatchObject({
      name: 'ether1',
      interfaceId,
      interface: { id: interfaceId, name: 'ether1', status: 'ACTIVE' },
      reservationAvailability: { available: true, reason: null },
    });
    expect(authorization.requireSiteOrTenantWideAction).toHaveBeenNthCalledWith(
      2,
      actorId,
      null,
      expect.anything(),
    );
    expect(manager.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'NetworkRouterInterfaceIpv4Address' }),
      expect.objectContaining({ where: expect.objectContaining({ id: addressId, version: 3 }) }),
    );
  });

  it('rechaza una dirección de interfaz ausente, interfaz inactiva o confirmación de otra interfaz', async () => {
    const addressId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const interfaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const otherInterfaceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const input = assistedNetworkBody({
      source: {
        mode: 'INTERFACE_ADDRESS',
        interfaceAddressId: addressId,
        interfaceAddressVersion: 3,
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '192.0.2.1',
      },
      interfaceId,
      interfaceVersion: 4,
    });

    const missingAddress = createHarness();
    missingAddress.manager.findOne.mockResolvedValueOnce({ ...router }).mockResolvedValueOnce(null);
    await expect(
      missingAddress.service.createAssistedIpv4Network(routerId, input, actorId),
    ).rejects.toMatchObject({ status: 404, response: { code: 'RESOURCE_NOT_FOUND' } });

    const missingSourceInterface = createHarness();
    missingSourceInterface.manager.findOne
      .mockResolvedValueOnce({ ...router })
      .mockResolvedValueOnce({ id: addressId, interfaceId, address: '192.0.2.5/24', version: 3 })
      .mockResolvedValueOnce(null);
    await expect(
      missingSourceInterface.service.createAssistedIpv4Network(routerId, input, actorId),
    ).rejects.toMatchObject({ status: 404, response: { code: 'RESOURCE_NOT_FOUND' } });

    const inactiveInterface = createHarness();
    inactiveInterface.manager.findOne
      .mockResolvedValueOnce({ ...router })
      .mockResolvedValueOnce({ id: addressId, interfaceId, address: '192.0.2.5/24', version: 3 })
      .mockResolvedValueOnce({ id: interfaceId, routerId, status: 'INACTIVE' });
    await expect(
      inactiveInterface.service.createAssistedIpv4Network(routerId, input, actorId),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_NOT_AVAILABLE' } });

    const mismatch = createHarness();
    mismatch.manager.findOne
      .mockResolvedValueOnce({ ...router })
      .mockResolvedValueOnce({ id: addressId, interfaceId, address: '192.0.2.5/24', version: 3 })
      .mockResolvedValueOnce({ id: interfaceId, routerId, status: 'ACTIVE' });
    mockValidAssistedNetworkQueries(mismatch.manager);
    const mismatchInput = assistedNetworkBody({
      ...input,
      interfaceId: otherInterfaceId,
    });
    await expect(
      mismatch.service.createAssistedIpv4Network(routerId, mismatchInput, actorId),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'NETWORK_CONFIRMATION_MISMATCH' },
    });
    expect(mismatch.manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['router inexistente', null, 'RESOURCE_NOT_FOUND'],
    ['router inactivo', { ...router, status: 'INACTIVE' }, 'RESOURCE_NOT_FOUND'],
    [
      'router sin el método admitido',
      { ...router, supportedControlMethods: [] },
      'CONTROL_METHOD_NOT_SUPPORTED',
    ],
  ])('rechaza alta asistida cuando el %s', async (_scenario, routerRow, expectedCode) => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce(routerRow as never);

    await expect(
      service.createAssistedIpv4Network(routerId, assistedNetworkBody(), actorId),
    ).rejects.toMatchObject({ response: { code: expectedCode } });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['interfaz inexistente', null, 4, 'RESOURCE_NOT_FOUND'],
    [
      'versión de interfaz desactualizada',
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', routerId, status: 'ACTIVE', version: 5 },
      4,
      'VERSION_CONFLICT',
    ],
    [
      'interfaz inactiva',
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', routerId, status: 'INACTIVE', version: 4 },
      4,
      'INTERFACE_NOT_AVAILABLE',
    ],
  ])(
    'valida el estado y versión de una interfaz asociada: %s',
    async (_scenario, interfaceRow, version, expectedCode) => {
      const { service, manager } = createHarness();
      const interfaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      manager.findOne
        .mockResolvedValueOnce({ ...router })
        .mockResolvedValueOnce(interfaceRow as never);

      await expect(
        service.createAssistedIpv4Network(
          routerId,
          assistedNetworkBody({ interfaceId, interfaceVersion: version as number }),
          actorId,
        ),
      ).rejects.toMatchObject({ response: { code: expectedCode } });
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('traduce la colisión de exclusión al error estable del contrato en alta asistida', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce({ ...router });
    mockValidAssistedNetworkQueries(manager);
    manager.save.mockRejectedValueOnce({
      driverError: { code: '23P01', constraint: 'ex_ipv4_networks_overlap' },
    });

    await expect(
      service.createAssistedIpv4Network(routerId, assistedNetworkBody(), actorId),
    ).rejects.toMatchObject({ response: { code: 'NETWORK_OVERLAP' } });
  });

  it('rechaza crear una red sin router activo o con método no habilitado', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    manager.findOne.mockResolvedValueOnce({ ...router, status: 'INACTIVE' });
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      },
    });
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
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('normalized_cidr')) {
        return [
          {
            normalized_cidr: '192.0.2.0/24',
            gateway_inside: false,
            from_inside: true,
            to_inside: true,
            range_ordered: true,
            exclusions_inside: true,
          },
        ];
      }
      return [];
    });
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });

    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('normalized_cidr')) {
        return [
          {
            normalized_cidr: '192.0.2.0/24',
            gateway_inside: true,
            from_inside: true,
            to_inside: true,
            range_ordered: true,
            exclusions_inside: true,
          },
        ];
      }
      return [];
    });
    manager.save.mockRejectedValueOnce({
      driverError: { code: '23P01', constraint: 'ex_ipv4_networks_overlap' },
    });
    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toMatchObject({
      response: { code: 'NETWORK_OVERLAP' },
    });
  });

  it('rechaza exclusiones fuera del CIDR antes de persistir create o PATCH', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockImplementation(async (entity) =>
      entity.name === 'Ipv4Network' ? { ...network } : { ...router },
    );
    manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('normalized_cidr')) {
        return [
          {
            normalized_cidr: '192.0.2.0/24',
            gateway_inside: true,
            from_inside: true,
            to_inside: true,
            range_ordered: true,
            exclusions_inside: false,
          },
        ];
      }
      return [];
    });

    await expect(service.createIpv4Network(networkBody, actorId)).rejects.toMatchObject({
      status: 400,
      response: { code: 'EXCLUDED_IP_OUTSIDE_BLOCK' },
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.logWithin).not.toHaveBeenCalled();

    await expect(
      service.updateIpv4Network(
        networkId,
        UpdateIpv4NetworkBodySchema.parse({ version: 1, excludedIps: ['198.51.100.8'] }),
        actorId,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'EXCLUDED_IP_OUTSIDE_BLOCK' },
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.logWithin).not.toHaveBeenCalled();
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
            exclusions_inside: true,
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
    manager.findOne
      .mockResolvedValueOnce({ ...network, version: 2 })
      .mockResolvedValueOnce({ ...router })
      .mockResolvedValueOnce({ ...network, version: 2 });
    await expect(
      service.updateIpv4Network(networkId, { version: 1 }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
    manager.findOne.mockResolvedValueOnce({ ...network }).mockResolvedValueOnce(null);
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

  it('actualiza ambos extremos del rango asignable dentro del mismo bloque', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockImplementation(async (entity) =>
      entity.name === 'Ipv4Network' ? { ...network } : { ...router },
    );

    const result = await service.updateIpv4Network(
      networkId,
      UpdateIpv4NetworkBodySchema.parse({
        version: 1,
        assignableFrom: '192.0.2.30',
        assignableTo: '192.0.2.180',
      }),
      actorId,
    );

    expect(result).toMatchObject({ assignableFrom: '192.0.2.30', assignableTo: '192.0.2.180' });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ changedFields: ['assignableFrom', 'assignableTo'] }),
      }),
      expect.anything(),
    );
  });

  it('asocia una interfaz activa nueva al editar una red', async () => {
    const { service, manager } = createHarness();
    manager.findOne.mockImplementation(async (entity) => {
      if (entity.name === 'NetworkRouterInterface') {
        return {
          id: interfaceId,
          tenantId: tenant.tenantId,
          routerId,
          name: 'Interfaz fixture',
          status: 'ACTIVE',
          version: 2,
        };
      }
      return entity.name === 'NetworkRouter' ? { ...router } : { ...network, interfaceId: null };
    });

    const result = await service.updateIpv4Network(
      networkId,
      UpdateIpv4NetworkBodySchema.parse({ version: 1, interfaceId, interfaceVersion: 2 }),
      actorId,
    );

    expect(result.interfaceId).toBe(interfaceId);
  });

  it('conserva la interfaz asociada cuando PATCH omite interfaceId', async () => {
    const { service, manager } = createHarness();
    const current = { ...network, interfaceId };
    manager.findOne.mockImplementation(async (entity) => {
      if (entity.name === 'NetworkRouter') return { ...router };
      return { ...current };
    });

    const result = await service.updateIpv4Network(
      networkId,
      UpdateIpv4NetworkBodySchema.parse({ version: 1, name: 'Red actualizada' }),
      actorId,
    );

    expect(result.interfaceId).toBe(interfaceId);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ interfaceId, name: 'Red actualizada' }),
    );
  });

  it('conserva la interfaz seleccionada y permite quitar una interfaz en PATCH', async () => {
    const { service, manager, auditService } = createHarness();
    const current = { ...network, interfaceId };
    const selectedInterface = {
      id: interfaceId,
      tenantId: tenant.tenantId,
      routerId,
      name: 'Interfaz fixture',
      status: 'ACTIVE',
      version: 3,
    };
    manager.findOne.mockImplementation(async (entity) => {
      if (entity.name === 'NetworkRouterInterface') return { ...selectedInterface };
      if (entity.name === 'NetworkRouter') return { ...router };
      return { ...current };
    });

    const unchanged = await service.updateIpv4Network(
      networkId,
      UpdateIpv4NetworkBodySchema.parse({
        version: 1,
        interfaceId,
        interfaceVersion: selectedInterface.version,
        defaultControlMethod: 'PCQ_ADDRESS_LIST',
      }),
      actorId,
    );
    expect(unchanged.interfaceId).toBe(interfaceId);
    expect(manager.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ interfaceId, defaultControlMethod: 'PCQ_ADDRESS_LIST' }),
    );

    manager.findOne.mockImplementation(async (entity) => {
      if (entity.name === 'NetworkRouter') return { ...router };
      return { ...current };
    });
    const cleared = await service.updateIpv4Network(
      networkId,
      UpdateIpv4NetworkBodySchema.parse({ version: 1, interfaceId: null }),
      actorId,
    );
    expect(cleared.interfaceId).toBeNull();
    expect(auditService.logWithin).toHaveBeenLastCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ changedFields: ['interfaceId'] }),
      }),
      expect.anything(),
    );
  });

  it('rechaza asociar una interfaz nueva si no está activa', async () => {
    const { service, manager, auditService } = createHarness();
    manager.findOne.mockImplementation(async (entity) => {
      if (entity.name === 'NetworkRouterInterface') {
        return {
          id: interfaceId,
          tenantId: tenant.tenantId,
          routerId,
          name: 'Interfaz fixture',
          status: 'INACTIVE',
          version: 1,
        };
      }
      return entity.name === 'NetworkRouter' ? { ...router } : { ...network, interfaceId: null };
    });

    await expect(
      service.updateIpv4Network(
        networkId,
        UpdateIpv4NetworkBodySchema.parse({ version: 1, interfaceId, interfaceVersion: 1 }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_NOT_AVAILABLE' } });
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.logWithin).not.toHaveBeenCalled();
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
    await expect(service.listPlanProfiles(actorId)).resolves.toEqual([
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
    await expect(service.getNetworkSettings(actorId)).resolves.toMatchObject({
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
    await expect(service.getNetworkSettings(actorId)).resolves.toMatchObject({
      updatedBy: { id: actorId },
    });
  });
});
