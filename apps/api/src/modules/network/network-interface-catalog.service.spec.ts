import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  NetworkRouter,
  NetworkRouterInterface,
  NetworkRouterInterfaceIpv4Address,
} from '@iwana/db';
import {
  CorrectRouterInterfaceIpv4AddressBodySchema,
  CreateRouterInterfaceBodySchema,
  CreateRouterInterfaceIpv4AddressBodySchema,
  UpdateRouterInterfaceBodySchema,
  UpdateRouterInterfaceIpv4AddressBodySchema,
} from '@iwana/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { IpamService } from './ipam.service';
import { NetworkAuthorizationFacade } from './authorization/network-authorization.facade';
import { NetworkInterfaceCatalogService } from './network-interface-catalog.service';

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
  tenantSlug: 'mod13-interface-unit',
  schemaName: 'tenant_mod13_interface_unit',
};
const actorId = '22222222-2222-4222-8222-222222222222';
const routerId = '33333333-3333-4333-8333-333333333333';
const interfaceId = '44444444-4444-4444-8444-444444444444';
const addressId = '55555555-5555-4555-8555-555555555555';
const networkId = '66666666-6666-4666-8666-666666666666';
const timestamp = new Date('2026-10-26T12:00:00.000Z');

const buildRouter = (overrides: Record<string, unknown> = {}) => ({
  id: routerId,
  tenantId: tenant.tenantId,
  name: 'Router de prueba',
  managementHost: 'router.fixture.invalid',
  lanInterface: 'bridge-lan',
  legacyLanInterfaceId: null,
  supportedControlMethods: ['PCQ_ADDRESS_LIST'],
  organizationSiteId: null,
  commercialNodeId: null,
  status: 'ACTIVE',
  notes: null,
  version: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const buildInterface = (overrides: Record<string, unknown> = {}) => ({
  id: interfaceId,
  tenantId: tenant.tenantId,
  routerId,
  name: 'bridge-lan',
  kind: 'BRIDGE',
  notes: null,
  status: 'ACTIVE',
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const buildAddress = (overrides: Record<string, unknown> = {}) => ({
  id: addressId,
  tenantId: tenant.tenantId,
  routerId,
  interfaceId,
  address: '192.0.2.10/24',
  hostAddress: '192.0.2.10/32',
  notes: null,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

function createHarness(ipProtectionStatus: 'ACTIVE' | 'PENDING' = 'ACTIVE') {
  const router = buildRouter();
  const iface = buildInterface();
  const address = buildAddress();
  const query = jest.fn(async (sql: string, parameters?: unknown[]): Promise<unknown[]> => {
    if (sql.includes('family($1::inet)')) {
      const value = String(parameters?.[0] ?? '192.0.2.10/24');
      const [host, prefix] = value.split('/');
      return [{ host, prefix_length: Number(prefix ?? 32), family: 4, usable: true }];
    }
    if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
    if (sql.includes('SELECT id FROM ipv4_networks')) return [{ id: networkId }];
    if (sql.includes('ipv4_address_count')) {
      return [{ id: interfaceId, ipv4_address_count: '1', network_count: '2' }];
    }
    if (sql.includes('COUNT(*)::integer AS count FROM ipv4_networks')) {
      return [{ count: '2' }];
    }
    if (sql.includes('COUNT(*)::integer AS count FROM network_router_interfaces')) {
      return [{ count: '3' }];
    }
    return [];
  });
  const manager = {
    query,
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === NetworkRouter) return { ...router };
      if (entity === NetworkRouterInterface) return { ...iface };
      if (entity === NetworkRouterInterfaceIpv4Address) return { ...address };
      return null;
    }),
    findAndCount: jest.fn(async (entity: unknown) => {
      if (entity === NetworkRouterInterface) return [[{ ...iface }], 1];
      if (entity === NetworkRouterInterfaceIpv4Address) return [[{ ...address }], 1];
      return [[], 0];
    }),
    create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({
      id:
        values.address !== undefined
          ? addressId
          : values.name !== undefined
            ? interfaceId
            : routerId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
      ...(typeof values.address === 'string'
        ? { hostAddress: `${values.address.split('/')[0]}/32` }
        : {}),
    })),
    save: jest.fn(async (_entity: unknown, value: Record<string, unknown>) => ({
      createdAt: timestamp,
      updatedAt: timestamp,
      ...value,
      ...(typeof value.address === 'string'
        ? { hostAddress: `${value.address.split('/')[0]}/32` }
        : {}),
    })),
  };
  runInTenant.mockImplementation(async (_source, _schema, operation) =>
    operation({ manager } as never),
  );

  const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const ipamService = { lockIpv4Pools: jest.fn().mockResolvedValue(undefined) };
  const authorization = { requireSiteOrTenantWideAction: jest.fn().mockResolvedValue(undefined) };
  const service = new NetworkInterfaceCatalogService(
    {} as DataSource,
    auditService as unknown as AuditService,
    ipamService as unknown as IpamService,
    authorization as unknown as NetworkAuthorizationFacade,
    ipProtectionStatus,
  );
  return { service, manager, router, iface, address, auditService, ipamService, authorization };
}

describe('NetworkInterfaceCatalogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(TenantContext.getOrThrow).mockReturnValue(tenant);
  });

  afterEach(() => jest.restoreAllMocks());

  it('lista interfaces autorizadas con conteos y metadatos paginados', async () => {
    const { service, manager, authorization } = createHarness();

    const result = await service.listRouterInterfaces(routerId, 2, 10, actorId);

    expect(result.data[0]).toMatchObject({
      id: interfaceId,
      ipv4AddressCount: 1,
      networkCount: 2,
      version: 1,
    });
    expect(result.meta).toMatchObject({ page: 2, limit: 10, total: 1 });
    expect(manager.findAndCount).toHaveBeenCalledWith(
      NetworkRouterInterface,
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(authorization.requireSiteOrTenantWideAction).toHaveBeenCalled();
  });

  it('devuelve lista vacía sin consulta de conteos y oculta router inexistente', async () => {
    const state = createHarness();
    state.manager.findAndCount.mockResolvedValueOnce([[], 0]);
    await expect(
      state.service.listRouterInterfaces(routerId, 1, 500, actorId),
    ).resolves.toMatchObject({
      data: [],
      meta: { page: 1, limit: 100, total: 0 },
    });
    expect(state.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('ipv4_address_count'),
      expect.anything(),
    );

    state.manager.findOne.mockResolvedValueOnce(null);
    await expect(
      state.service.listRouterInterfaces(routerId, 1, 20, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea una interfaz, guarda el actor y registra auditoría', async () => {
    const { service, manager, auditService } = createHarness();
    const body = CreateRouterInterfaceBodySchema.parse({
      name: '  WAN  ',
      kind: 'PHYSICAL',
      notes: 'Enlace primario',
    });

    const result = await service.createRouterInterface(routerId, body, actorId);

    expect(result).toMatchObject({ name: 'WAN', status: 'ACTIVE', version: 1 });
    expect(manager.save).toHaveBeenCalledWith(
      NetworkRouterInterface,
      expect.objectContaining({ name: 'WAN', createdBy: actorId }),
    );
    expect(auditService.logWithin).toHaveBeenCalledTimes(1);
    expect(auditService.logWithin.mock.calls[0]?.[0].newValue).not.toHaveProperty('notes');
  });

  it('rechaza crear interfaz si el router no existe o está inactivo', async () => {
    const missing = createHarness();
    missing.manager.findOne.mockResolvedValueOnce(null);
    await expect(
      missing.service.createRouterInterface(
        routerId,
        CreateRouterInterfaceBodySchema.parse({ name: 'WAN', kind: 'PHYSICAL' }),
        actorId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const inactive = createHarness();
    inactive.manager.findOne.mockResolvedValueOnce(buildRouter({ status: 'INACTIVE' }));
    await expect(
      inactive.service.createRouterInterface(
        routerId,
        CreateRouterInterfaceBodySchema.parse({ name: 'WAN', kind: 'PHYSICAL' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'CATALOG_REFERENCE_INACTIVE' } });
  });

  it('traduce la unicidad de nombre de interfaz al error estable', async () => {
    const { service, manager } = createHarness();
    manager.save.mockRejectedValueOnce({
      driverError: { code: '23505', constraint: 'uq_network_router_interfaces_name' },
    });

    await expect(
      service.createRouterInterface(
        routerId,
        CreateRouterInterfaceBodySchema.parse({ name: 'WAN', kind: 'PHYSICAL' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_NAME_IN_USE' } });
  });

  it('convierte LAN legado y registra interfaz, asociación y dirección local', async () => {
    const { service, manager, router, auditService, ipamService } = createHarness();
    const body = CreateRouterInterfaceBodySchema.parse({
      convertLegacyLan: true,
      routerVersion: 2,
      name: 'LAN legado',
      kind: 'BRIDGE',
      address: { addressWithPrefix: '192.0.2.10/24' },
    });

    const result = await service.createRouterInterface(routerId, body, actorId);

    expect(result).toMatchObject({
      interface: { id: interfaceId, name: 'LAN legado' },
      address: { host: '192.0.2.10', prefixLength: 24 },
      router: { legacyLanInterfaceId: interfaceId, version: 3 },
    });
    expect(router.legacyLanInterfaceId).toBeNull();
    expect(ipamService.lockIpv4Pools).toHaveBeenCalledWith(manager, [networkId]);
    expect(manager.save).toHaveBeenCalledWith(
      NetworkRouterInterfaceIpv4Address,
      expect.objectContaining({ createdBy: actorId, address: '192.0.2.10/24' }),
    );
    expect(auditService.logWithin).toHaveBeenCalledTimes(3);
  });

  it('mantiene cerrada la conversión con dirección mientras protección IP está pendiente', async () => {
    const { service, manager } = createHarness('PENDING');

    await expect(
      service.createRouterInterface(
        routerId,
        CreateRouterInterfaceBodySchema.parse({
          convertLegacyLan: true,
          routerVersion: 2,
          name: 'LAN legado',
          kind: 'BRIDGE',
          address: { addressWithPrefix: '192.0.2.10/24' },
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'IP_PROTECTION_PENDING' } });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['sin LAN configurada', buildRouter({ lanInterface: null }), 'LEGACY_LAN_NOT_AVAILABLE'],
    [
      'LAN ya convertida',
      buildRouter({ legacyLanInterfaceId: interfaceId }),
      'LEGACY_LAN_ALREADY_CONVERTED',
    ],
    ['versión obsoleta', buildRouter({ version: 3 }), 'VERSION_CONFLICT'],
  ])('rechaza convertir LAN legado %s', async (_label, router, code) => {
    const { service, manager } = createHarness();
    manager.findOne.mockResolvedValueOnce(router);

    await expect(
      service.createRouterInterface(
        routerId,
        CreateRouterInterfaceBodySchema.parse({
          convertLegacyLan: true,
          routerVersion: 2,
          name: 'LAN legado',
          kind: 'BRIDGE',
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code } });
  });

  it('actualiza campos de interfaz, incrementa versión y audita', async () => {
    const { service, manager, auditService } = createHarness();
    const body = UpdateRouterInterfaceBodySchema.parse({
      name: ' WAN ',
      kind: 'VLAN',
      notes: 'Enlace primario',
      version: 1,
    });

    const result = await service.updateRouterInterface(routerId, interfaceId, body, actorId);

    expect(result).toMatchObject({
      name: 'WAN',
      kind: 'VLAN',
      notes: 'Enlace primario',
      version: 2,
    });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ changedFields: ['name', 'kind', 'notes'] }),
      }),
      expect.anything(),
    );
    expect(auditService.logWithin.mock.calls[0]?.[0].newValue).not.toHaveProperty('notes');
  });

  it('rechaza update con interfaz inexistente o versión obsoleta', async () => {
    const missing = createHarness();
    missing.manager.findOne.mockResolvedValueOnce(null);
    await expect(
      missing.service.updateRouterInterface(
        routerId,
        interfaceId,
        UpdateRouterInterfaceBodySchema.parse({ version: 1 }),
        actorId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const stale = createHarness();
    stale.manager.findOne
      .mockResolvedValueOnce(buildInterface())
      .mockResolvedValueOnce(buildRouter())
      .mockResolvedValueOnce(buildInterface({ version: 2 }));
    await expect(
      stale.service.updateRouterInterface(
        routerId,
        interfaceId,
        UpdateRouterInterfaceBodySchema.parse({ version: 1 }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });

  it('traduce colisión de nombre al actualizar interfaz', async () => {
    const state = createHarness();
    state.manager.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'uq_network_router_interfaces_name',
    });
    await expect(
      state.service.updateRouterInterface(
        routerId,
        interfaceId,
        UpdateRouterInterfaceBodySchema.parse({ version: 1, name: 'WAN' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_NAME_IN_USE' } });
  });

  it('cambia estado de interfaz y registra el cambio', async () => {
    const { service, auditService } = createHarness();
    const result = await service.setRouterInterfaceStatus(
      routerId,
      interfaceId,
      1,
      'INACTIVE',
      actorId,
    );
    expect(result).toMatchObject({ status: 'INACTIVE', version: 2 });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ changedFields: ['status'] }) }),
      expect.anything(),
    );
  });

  it('lista direcciones por interfaz con host y prefijo derivados', async () => {
    const { service, manager } = createHarness();
    const result = await service.listInterfaceIpv4Addresses(routerId, interfaceId, 1, 20, actorId);
    expect(result.data[0]).toMatchObject({
      addressWithPrefix: '192.0.2.10/24',
      host: '192.0.2.10',
      prefixLength: 24,
    });
    expect(manager.findAndCount).toHaveBeenCalledWith(
      NetworkRouterInterfaceIpv4Address,
      expect.objectContaining({ where: { tenantId: tenant.tenantId, routerId, interfaceId } }),
    );
  });

  it('rechaza listar direcciones para router o interfaz inexistente', async () => {
    const state = createHarness();
    state.manager.findOne.mockResolvedValueOnce(null);
    await expect(
      state.service.listInterfaceIpv4Addresses(routerId, interfaceId, 1, 20, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);

    state.manager.findOne.mockResolvedValueOnce(buildRouter()).mockResolvedValueOnce(null);
    await expect(
      state.service.listInterfaceIpv4Addresses(routerId, interfaceId, 1, 20, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registra dirección local solo con router/interfaz activos, host libre y protección activa', async () => {
    const { service, manager, auditService, ipamService } = createHarness();
    const input = CreateRouterInterfaceIpv4AddressBodySchema.parse({
      addressWithPrefix: '192.0.2.10/24',
    });

    const result = await service.createInterfaceIpv4Address(routerId, interfaceId, input, actorId);

    expect(result).toMatchObject({ host: '192.0.2.10', prefixLength: 24, version: 1 });
    expect(ipamService.lockIpv4Pools).toHaveBeenCalledWith(manager, [networkId]);
    expect(manager.save).toHaveBeenCalledWith(
      NetworkRouterInterfaceIpv4Address,
      expect.objectContaining({ createdBy: actorId, address: '192.0.2.10/24' }),
    );
    expect(auditService.logWithin).toHaveBeenCalledTimes(1);
  });

  it('rechaza dirección inválida, ocupada o capturada antes del cierre de IPAM', async () => {
    const invalid = createHarness();
    invalid.manager.query.mockImplementation(async (sql: string) =>
      sql.includes('family($1::inet)')
        ? [{ host: '192.0.2.0', prefix_length: 24, family: 4, usable: false }]
        : [],
    );
    await expect(
      invalid.service.createInterfaceIpv4Address(
        routerId,
        interfaceId,
        CreateRouterInterfaceIpv4AddressBodySchema.parse({ addressWithPrefix: '192.0.2.10/24' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'ADDRESS_NOT_USABLE' } });

    const used = createHarness();
    used.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('family($1::inet)'))
        return [{ host: '192.0.2.10', prefix_length: 24, family: 4, usable: true }];
      if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
      if (sql.includes('SELECT id FROM ipv4_networks')) return [{ id: networkId }];
      return [];
    });
    await expect(
      used.service.createInterfaceIpv4Address(
        routerId,
        interfaceId,
        CreateRouterInterfaceIpv4AddressBodySchema.parse({ addressWithPrefix: '192.0.2.10/24' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });

    const pending = createHarness('PENDING');
    await expect(
      pending.service.createInterfaceIpv4Address(
        routerId,
        interfaceId,
        CreateRouterInterfaceIpv4AddressBodySchema.parse({ addressWithPrefix: '192.0.2.10/24' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'IP_PROTECTION_PENDING' } });
  });

  it('rechaza dirección si el router o la interfaz cambió a inactivo durante el lock', async () => {
    const state = createHarness();
    state.manager.findOne
      .mockResolvedValueOnce(buildRouter())
      .mockResolvedValueOnce(buildInterface())
      .mockResolvedValueOnce(buildRouter({ status: 'INACTIVE' }))
      .mockResolvedValueOnce(buildInterface());
    await expect(
      state.service.createInterfaceIpv4Address(
        routerId,
        interfaceId,
        CreateRouterInterfaceIpv4AddressBodySchema.parse({ addressWithPrefix: '192.0.2.10/24' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_NOT_AVAILABLE' } });
  });

  it('traduce colisión de host local al error de dirección duplicada', async () => {
    const state = createHarness();
    state.manager.save.mockRejectedValueOnce({
      driverError: { code: '23505', constraint: 'uq_network_interface_ipv4_address' },
    });
    await expect(
      state.service.createInterfaceIpv4Address(
        routerId,
        interfaceId,
        CreateRouterInterfaceIpv4AddressBodySchema.parse({ addressWithPrefix: '192.0.2.10/24' }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_ADDRESS_DUPLICATED' } });
  });

  it('actualiza notas de dirección con control optimista de versión', async () => {
    const { service, auditService } = createHarness();
    const result = await service.updateInterfaceIpv4Address(
      routerId,
      interfaceId,
      addressId,
      UpdateRouterInterfaceIpv4AddressBodySchema.parse({ notes: 'Administración', version: 1 }),
      actorId,
    );
    expect(result).toMatchObject({ notes: 'Administración', version: 2 });
    expect(auditService.logWithin).toHaveBeenCalledTimes(1);
    expect(auditService.logWithin.mock.calls[0]?.[0].newValue).not.toHaveProperty('notes');
  });

  it('rechaza actualizar dirección faltante o con versión obsoleta', async () => {
    const missing = createHarness();
    missing.manager.findOne.mockResolvedValueOnce(null);
    await expect(
      missing.service.updateInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        UpdateRouterInterfaceIpv4AddressBodySchema.parse({ version: 1 }),
        actorId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const stale = createHarness();
    stale.manager.findOne
      .mockResolvedValueOnce(buildAddress())
      .mockResolvedValueOnce(buildRouter())
      .mockResolvedValueOnce(buildInterface())
      .mockResolvedValueOnce(buildAddress({ version: 2 }));
    await expect(
      stale.service.updateInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        UpdateRouterInterfaceIpv4AddressBodySchema.parse({ version: 1 }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
  });

  it('corrige la dirección conservando o liberando host con confirmación explícita', async () => {
    const sameHost = createHarness();
    const sameResult = await sameHost.service.correctInterfaceIpv4Address(
      routerId,
      interfaceId,
      addressId,
      CorrectRouterInterfaceIpv4AddressBodySchema.parse({
        newAddress: '192.0.2.10/25',
        version: 1,
        reason: 'ERROR_DE_REGISTRO',
      }),
      actorId,
    );
    expect(sameResult.releasedHost).toBeNull();
    expect(sameResult.address.prefixLength).toBe(25);

    const changedHost = createHarness();
    const changedResult = await changedHost.service.correctInterfaceIpv4Address(
      routerId,
      interfaceId,
      addressId,
      CorrectRouterInterfaceIpv4AddressBodySchema.parse({
        newAddress: '192.0.2.11/24',
        version: 1,
        reason: 'CAMBIO_DE_EQUIPO',
        confirmReleasedHost: true,
      }),
      actorId,
    );
    expect(changedResult.releasedHost).toBe('192.0.2.10');
    expect(changedHost.auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: { changedFields: ['address'] } }),
      expect.anything(),
    );
    expect(JSON.stringify(changedHost.auditService.logWithin.mock.calls[0]?.[0])).not.toContain(
      '192.0.2.10',
    );
  });

  it('rechaza corregir host sin confirmación, inválido, ocupado, gateway o protección activa', async () => {
    const confirmation = createHarness();
    await expect(
      confirmation.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.11/24',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'ADDRESS_RELEASE_CONFIRMATION_REQUIRED' } });

    const invalid = createHarness();
    invalid.manager.query.mockImplementation(async (sql: string) =>
      sql.includes('family($1::inet)')
        ? [{ host: '192.0.2.255', prefix_length: 24, family: 4, usable: false }]
        : [],
    );
    await expect(
      invalid.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.20/24',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
          confirmReleasedHost: true,
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'ADDRESS_NOT_USABLE' } });

    const gateway = createHarness();
    gateway.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT EXISTS') && sql.includes('ipv4_networks')) return [{ exists: true }];
      if (sql.includes('family($1::inet)'))
        return [{ host: '192.0.2.11', prefix_length: 24, family: 4, usable: true }];
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      if (sql.includes('SELECT id FROM ipv4_networks')) return [{ id: networkId }];
      return [];
    });
    await expect(
      gateway.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.11/24',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
          confirmReleasedHost: true,
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_ADDRESS_IS_GATEWAY' } });

    const pending = createHarness('PENDING');
    await expect(
      pending.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.10/24',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
          confirmReleasedHost: true,
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'IP_PROTECTION_PENDING' } });
  });

  it('rechaza corregir si ya existe asignación activa o la interfaz fue inactivada', async () => {
    const used = createHarness();
    used.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('family($1::inet)'))
        return [{ host: '192.0.2.11', prefix_length: 24, family: 4, usable: true }];
      if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
      if (sql.includes('SELECT id FROM ipv4_networks')) return [{ id: networkId }];
      return [];
    });
    await expect(
      used.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.11/24',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
          confirmReleasedHost: true,
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });

    const inactive = createHarness();
    inactive.manager.findOne
      .mockResolvedValueOnce(buildAddress())
      .mockResolvedValueOnce(buildRouter())
      .mockResolvedValueOnce(buildInterface({ status: 'INACTIVE' }));
    await expect(
      inactive.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.10/24',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_NOT_AVAILABLE' } });
  });

  it('traduce duplicado de host al corregir una dirección', async () => {
    const state = createHarness();
    state.manager.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'uq_network_interface_ipv4_address',
    });
    await expect(
      state.service.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        CorrectRouterInterfaceIpv4AddressBodySchema.parse({
          newAddress: '192.0.2.10/25',
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
          confirmReleasedHost: true,
        }),
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INTERFACE_ADDRESS_DUPLICATED' } });
  });
});
