import { BadRequestException } from '@nestjs/common';
import {
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockLocationStatus,
  StockLocationType,
} from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource } from 'typeorm';
import { ExecutorCustodyService } from '../services/executor-custody.service';

jest.mock('@iwana/db', () => ({
  StockLocation: class StockLocation {},
  SerializedAsset: class SerializedAsset {},
  StockBalance: class StockBalance {},
  TenantContext: {
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const RESPONSIBLE_ID = '44444444-4444-4444-8444-000000000001';
const LOCATION_ID = '33333333-3333-4333-8333-000000000001';

function buildMobileLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: LOCATION_ID,
    tenantId: 'tenant-001',
    name: 'Móvil técnico zona norte',
    type: StockLocationType.MOBILE_TECHNICIAN,
    status: StockLocationStatus.ACTIVE,
    responsibleRefId: RESPONSIBLE_ID,
    ...overrides,
  };
}

function buildAssetRow(overrides: Record<string, unknown> = {}) {
  const fixedDate = new Date('2026-08-31T11:00:00.000Z');
  return {
    id: '11111111-1111-4111-8111-000000000001',
    tenantId: 'tenant-001',
    inventoryItemId: '22222222-2222-4222-8222-000000000001',
    serialNumber: 'SN-001',
    normalizedSerialNumber: 'sn-001',
    macAddress: null,
    normalizedMacAddress: null,
    assetTag: null,
    currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    currentLocationId: LOCATION_ID,
    currentResponsibleType: InventoryResponsibleType.TECHNICIAN,
    currentResponsibleRefId: RESPONSIBLE_ID,
    subscriberRefId: null,
    contractRefId: null,
    purchaseOrderRef: null,
    purchaseDate: null,
    usefulLifeMonths: null,
    warrantyUntil: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

function buildBalanceRow(overrides: Record<string, unknown> = {}) {
  const fixedDate = new Date('2026-08-31T11:00:00.000Z');
  return {
    id: '55555555-5555-4555-8555-000000000001',
    tenantId: 'tenant-001',
    itemId: '22222222-2222-4222-8222-000000000002',
    locationId: LOCATION_ID,
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '4.00',
    quantityReserved: '1.00',
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

function buildManager() {
  const balancesQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    clone: jest.fn(),
    getCount: jest.fn().mockResolvedValue(1),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([buildBalanceRow()]),
  };
  balancesQb.clone.mockReturnValue(balancesQb);

  return {
    balancesQb,
    manager: {
      findOne: jest.fn().mockResolvedValue(buildMobileLocation()),
      find: jest.fn().mockResolvedValue([buildAssetRow()]),
      count: jest.fn().mockResolvedValue(1),
      createQueryBuilder: jest.fn().mockReturnValue(balancesQb),
    },
  };
}

function mockTenantContext(
  manager: ReturnType<typeof buildManager>['manager'],
  tenantId: string,
  schemaName: string,
) {
  (TenantContext.getOrThrow as jest.Mock).mockReturnValue({ tenantId, schemaName });
  (runInTenantSchema as jest.Mock).mockImplementation(
    async (_dataSource: unknown, _schema: string, work: (qr: unknown) => Promise<unknown>) =>
      work({ manager }),
  );
}

describe('ExecutorCustodyService', () => {
  let service: ExecutorCustodyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExecutorCustodyService({} as DataSource);
  });

  it('resuelve la custodia activa del responsable y agrega equipos y balances', async () => {
    const { manager, balancesQb } = buildManager();
    mockTenantContext(manager, 'tenant-001', 'tenant_001');

    const response = await service.getCustody({ responsibleRefId: RESPONSIBLE_ID });

    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-001',
          responsibleRefId: RESPONSIBLE_ID,
          status: StockLocationStatus.ACTIVE,
        }),
      }),
    );
    expect(manager.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: { tenantId: 'tenant-001', currentLocationId: LOCATION_ID },
      }),
    );
    expect(balancesQb.where).toHaveBeenCalledWith('balance.tenant_id = :tenantId', {
      tenantId: 'tenant-001',
    });
    expect(balancesQb.andWhere).toHaveBeenCalledWith('balance.location_id = :locationId', {
      locationId: LOCATION_ID,
    });
    expect(balancesQb.andWhere).toHaveBeenCalledWith(
      'balance.quantity_on_hand::numeric - balance.quantity_reserved::numeric > 0',
    );

    expect(response.location).toEqual({
      id: LOCATION_ID,
      name: 'Móvil técnico zona norte',
      type: 'MOBILE_TECHNICIAN',
      responsibleType: 'TECHNICIAN',
      responsibleRefId: RESPONSIBLE_ID,
    });
    expect(response.assets.items).toHaveLength(1);
    // Las fechas se serializan a ISO 8601 según el contrato v1.
    expect(response.assets.items[0]?.createdAt).toBe('2026-08-31T11:00:00.000Z');
    expect(response.balances.items[0]?.quantityOnHand).toBe('4.00');
    expect(response.assets.meta.total).toBe(1);
    expect(response.balances.meta.total).toBe(1);
  });

  it('mapea MOBILE_CREW a responsibleType CREW', async () => {
    const { manager } = buildManager();
    manager.findOne.mockResolvedValue(
      buildMobileLocation({ type: StockLocationType.MOBILE_CREW, name: 'Cuadrilla centro' }),
    );
    mockTenantContext(manager, 'tenant-001', 'tenant_001');

    const response = await service.getCustody({ responsibleRefId: RESPONSIBLE_ID });

    expect(response.location?.type).toBe('MOBILE_CREW');
    expect(response.location?.responsibleType).toBe('CREW');
  });

  it('sin custodia activa devuelve 200 con location null y colecciones vacías', async () => {
    const { manager } = buildManager();
    manager.findOne.mockResolvedValue(null);
    mockTenantContext(manager, 'tenant-001', 'tenant_001');

    const response = await service.getCustody({ responsibleRefId: RESPONSIBLE_ID });

    expect(response.location).toBeNull();
    expect(response.assets.items).toHaveLength(0);
    expect(response.balances.items).toHaveLength(0);
    expect(response.assets.meta).toEqual(
      expect.objectContaining({ total: 0, page: 1, limit: 25, hasMore: false, mode: 'page' }),
    );
    expect(response.balances.meta.total).toBe(0);
    // Sin custodia no hay consultas de colecciones.
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.count).not.toHaveBeenCalled();
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('consulta dentro del schema del tenant autenticado y no ve otros tenants', async () => {
    const { manager } = buildManager();
    manager.findOne.mockResolvedValue(null);
    mockTenantContext(manager, 'tenant-002', 'tenant_002');

    await service.getCustody({ responsibleRefId: RESPONSIBLE_ID });

    expect(runInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_002',
      expect.any(Function),
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-002' }),
      }),
    );
  });

  it('aplica paginación compartida (page, limit) a ambas colecciones', async () => {
    const { manager, balancesQb } = buildManager();
    mockTenantContext(manager, 'tenant-001', 'tenant_001');

    const response = await service.getCustody({
      responsibleRefId: RESPONSIBLE_ID,
      page: 2,
      limit: 10,
    });

    expect(manager.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(balancesQb.skip).toHaveBeenCalledWith(10);
    expect(balancesQb.take).toHaveBeenCalledWith(10);
    expect(response.assets.meta).toEqual(
      expect.objectContaining({ page: 2, limit: 10, hasMore: false }),
    );
    expect(response.balances.meta).toEqual(
      expect.objectContaining({ page: 2, limit: 10, hasMore: false }),
    );
  });

  it('rechaza páginas que exceden el offset máximo permitido (DEF-2)', async () => {
    const { manager } = buildManager();
    mockTenantContext(manager, 'tenant-001', 'tenant_001');

    await expect(
      service.getCustody({ responsibleRefId: RESPONSIBLE_ID, page: 5000, limit: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('descarta ubicaciones móviles sin responsable (responsibleRefId null)', async () => {
    const { manager } = buildManager();
    manager.findOne.mockResolvedValue(buildMobileLocation({ responsibleRefId: null }));
    mockTenantContext(manager, 'tenant-001', 'tenant_001');

    const response = await service.getCustody({ responsibleRefId: RESPONSIBLE_ID });

    expect(response.location).toBeNull();
    expect(manager.find).not.toHaveBeenCalled();
  });
});
