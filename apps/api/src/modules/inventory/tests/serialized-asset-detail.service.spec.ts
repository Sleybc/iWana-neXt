import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AssetLifecycleEventType,
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockLocationType,
  StockMovementOrigin,
} from '@iwana/shared';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';

jest.mock('@iwana/db', () => ({
  SerializedAsset: class SerializedAsset {},
  InventoryItem: class InventoryItem {},
  InventoryCategory: class InventoryCategory {},
  StockLocation: class StockLocation {},
  PurchaseOrder: class PurchaseOrder {},
  GoodsReceipt: class GoodsReceipt {},
  StockMovement: class StockMovement {},
  StockMovementLine: class StockMovementLine {},
  SupplierProfile: class SupplierProfile {},
  AssetLoanAssignment: class AssetLoanAssignment {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import { runInTenantSchema } from '@iwana/db';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const LOCATION_ID = '33333333-3333-4333-8333-333333333333';
const PO_ID = '44444444-4444-4444-8444-444444444444';
const GR_ID = '55555555-5555-4555-8555-555555555555';
const MOV_ID = '66666666-6666-4666-8666-666666666666';
const PARTY_REF_ID = '77777777-7777-4777-8777-777777777777';

function buildAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    tenantId: 'tenant-001',
    inventoryItemId: ITEM_ID,
    serialNumber: 'SN-001',
    macAddress: null,
    assetTag: 'TAG-001',
    currentStatus: SerializedAssetStatus.AVAILABLE,
    currentLocationId: LOCATION_ID,
    currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
    currentResponsibleRefId: null,
    subscriberRefId: null,
    contractRefId: null,
    purchaseOrderRef: 'OC-000001',
    purchaseDate: '2024-01-01',
    usefulLifeMonths: 36,
    warrantyUntil: '2027-01-01',
    createdAt: new Date('2024-01-02T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('SerializedAssetService.getById composition', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  let assetLifecycleService: jest.Mocked<Pick<AssetLifecycleService, 'listPaginatedForAsset'>>;
  let assetLoanService: jest.Mocked<Pick<AssetLoanService, 'listForAsset'>>;
  let stockMovementQueryService: jest.Mocked<Pick<StockMovementQueryService, 'list'>>;
  let supplierPartyPort: jest.Mocked<Pick<SupplierPartyPort, 'getSupplierSummary'>>;
  let service: SerializedAssetService;

  beforeEach(() => {
    jest.clearAllMocks();
    assetLifecycleService = {
      listPaginatedForAsset: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      }),
    };
    assetLoanService = {
      listForAsset: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    stockMovementQueryService = {
      list: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      }),
    };
    supplierPartyPort = {
      getSupplierSummary: jest.fn().mockResolvedValue({
        partyRefId: PARTY_REF_ID,
        displayName: 'Proveedor Andino',
        primaryContact: null,
        phone: null,
        email: null,
        city: null,
        status: 'ACTIVE',
      }),
    };
    service = new SerializedAssetService(
      {} as DataSource,
      assetLifecycleService as unknown as AssetLifecycleService,
      stockMovementQueryService as unknown as StockMovementQueryService,
      supplierPartyPort as unknown as SupplierPartyPort,
      assetLoanService as unknown as AssetLoanService,
    );
  });

  it('composes detail with purchase origin when receipt chain resolves', async () => {
    const asset = buildAsset();
    const receiptLineQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        movementId: MOV_ID,
        unitCost: '150.00',
      }),
    };
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({
          id: ITEM_ID,
          sku: 'ONU-01',
          name: 'ONU GPON',
          categoryId: 'cat-001',
          inventoryCategory: { name: 'Equipos' },
        })
        .mockResolvedValueOnce({
          id: LOCATION_ID,
          code: 'BC',
          name: 'Bodega central',
          type: StockLocationType.MAIN_WAREHOUSE,
        })
        .mockResolvedValueOnce({
          id: PO_ID,
          orderNumber: 'OC-000001',
          partyRefId: PARTY_REF_ID,
        })
        .mockResolvedValueOnce({
          id: MOV_ID,
          originRefId: GR_ID,
        })
        .mockResolvedValueOnce({
          id: GR_ID,
          purchaseOrderId: PO_ID,
          receivedAt: new Date('2024-01-02T10:00:00.000Z'),
        }),
      createQueryBuilder: jest.fn().mockReturnValue(receiptLineQb),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await service.getById(ASSET_ID);

    expect(result.serialNumber).toBe('SN-001');
    expect(result.item).toEqual({
      id: ITEM_ID,
      sku: 'ONU-01',
      name: 'ONU GPON',
      categoryName: 'Equipos',
    });
    expect(result.purchaseOrigin).toEqual({
      purchaseOrderId: PO_ID,
      purchaseOrderNumber: 'OC-000001',
      goodsReceiptId: GR_ID,
      receivedAt: new Date('2024-01-02T10:00:00.000Z'),
      supplierPartyRefId: PARTY_REF_ID,
      supplierDisplayName: 'Proveedor Andino',
      unitCost: '150.00',
    });
    expect(supplierPartyPort.getSupplierSummary).toHaveBeenCalledWith(PARTY_REF_ID);
    expect(result.loans).toEqual({ data: [], total: 0 });
  });

  it('returns purchase origin without supplier profile when OC chain resolves (A1)', async () => {
    const asset = buildAsset();
    const receiptLineQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        movementId: MOV_ID,
        unitCost: '99.50',
      }),
    };
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({
          id: ITEM_ID,
          sku: 'ONU-01',
          name: 'ONU GPON',
          categoryId: 'cat-001',
          inventoryCategory: { name: 'Equipos' },
        })
        .mockResolvedValueOnce({
          id: LOCATION_ID,
          code: 'BC',
          name: 'Bodega central',
          type: StockLocationType.MAIN_WAREHOUSE,
        })
        .mockResolvedValueOnce({
          id: PO_ID,
          orderNumber: 'OC-LEGACY-001',
          partyRefId: PARTY_REF_ID,
        })
        .mockResolvedValueOnce({
          id: MOV_ID,
          originRefId: GR_ID,
        })
        .mockResolvedValueOnce({
          id: GR_ID,
          purchaseOrderId: PO_ID,
          receivedAt: new Date('2023-06-15T08:00:00.000Z'),
        }),
      createQueryBuilder: jest.fn().mockReturnValue(receiptLineQb),
    };

    supplierPartyPort.getSupplierSummary.mockResolvedValue(null);

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await service.getById(ASSET_ID);

    expect(result.purchaseOrigin).toEqual({
      purchaseOrderId: PO_ID,
      purchaseOrderNumber: 'OC-LEGACY-001',
      goodsReceiptId: GR_ID,
      receivedAt: new Date('2023-06-15T08:00:00.000Z'),
      supplierPartyRefId: PARTY_REF_ID,
      supplierDisplayName: null,
      unitCost: '99.50',
    });
    expect(supplierPartyPort.getSupplierSummary).toHaveBeenCalledWith(PARTY_REF_ID);
  });

  it('returns null purchase origin when purchase order ref is missing', async () => {
    const asset = buildAsset({ purchaseOrderRef: null });
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({
          id: ITEM_ID,
          sku: 'ONU-01',
          name: 'ONU GPON',
          categoryId: 'cat-001',
          inventoryCategory: { name: 'Equipos' },
        })
        .mockResolvedValueOnce({
          id: LOCATION_ID,
          code: 'BC',
          name: 'Bodega central',
          type: StockLocationType.MAIN_WAREHOUSE,
        }),
      createQueryBuilder: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await service.getById(ASSET_ID);

    expect(result.purchaseOrigin).toBeNull();
  });

  it('composes useful life section from asset fields', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));

    const asset = buildAsset({ usefulLifeMonths: 36, purchaseDate: '2024-01-01' });
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({
          id: ITEM_ID,
          sku: 'ONU-01',
          name: 'ONU GPON',
          categoryId: 'cat-001',
          inventoryCategory: null,
        })
        .mockResolvedValueOnce({
          id: LOCATION_ID,
          code: 'BC',
          name: 'Bodega central',
          type: StockLocationType.MAIN_WAREHOUSE,
        }),
      createQueryBuilder: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await service.getById(ASSET_ID);

    expect(result.usefulLife.status).toBe('vigente');
    expect(result.usefulLife.monthsTotal).toBe(36);

    jest.useRealTimers();
  });

  it('returns empty sections for asset without history', async () => {
    const asset = buildAsset({
      purchaseOrderRef: null,
      usefulLifeMonths: null,
      purchaseDate: null,
      warrantyUntil: null,
      currentLocationId: null,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce({
        id: ITEM_ID,
        sku: 'ONU-01',
        name: 'ONU GPON',
        categoryId: 'cat-001',
        inventoryCategory: null,
      }),
      createQueryBuilder: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await service.getById(ASSET_ID);

    expect(result.purchaseOrigin).toBeNull();
    expect(result.currentLocation).toBeNull();
    expect(result.usefulLife.status).toBe('sin-dato');
    expect(result.lifecycle).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(result.movements).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(result.loans).toEqual({ data: [], total: 0 });
    expect(stockMovementQueryService.list).toHaveBeenCalledWith({
      serializedAssetId: ASSET_ID,
      page: 1,
      limit: 20,
    });
  });

  it('forwards pagination params to lifecycle and movements sections', async () => {
    const asset = buildAsset({ purchaseOrderRef: null });
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce({
        id: ITEM_ID,
        sku: 'ONU-01',
        name: 'ONU GPON',
        categoryId: 'cat-001',
        inventoryCategory: null,
      }),
      createQueryBuilder: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    await service.getById(ASSET_ID, {
      lifecyclePage: 2,
      lifecycleLimit: 10,
      movementsPage: 3,
      movementsLimit: 5,
    });

    expect(assetLifecycleService.listPaginatedForAsset).toHaveBeenCalledWith(ASSET_ID, 2, 10);
    expect(stockMovementQueryService.list).toHaveBeenCalledWith({
      serializedAssetId: ASSET_ID,
      page: 3,
      limit: 5,
    });
  });

  it('composes loans section from asset loan service', async () => {
    const asset = buildAsset();
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce({
        id: ITEM_ID,
        sku: 'ONU-01',
        name: 'ONU GPON',
        categoryId: 'cat-001',
        inventoryCategory: null,
      }),
      createQueryBuilder: jest.fn(),
    };
    const loanRecord = {
      id: 'loan-001',
      serializedAssetId: ASSET_ID,
      subscriberRefId: '11111111-1111-4111-8111-111111111111',
      contractRefId: null,
      installedAt: new Date('2026-07-21T10:00:00.000Z'),
      removedAt: null,
      executionOrderRefId: 'eo-001',
      stockMovementId: 'mov-001',
      status: 'abierto' as const,
    };

    assetLoanService.listForAsset.mockResolvedValue({ data: [loanRecord], total: 1 });

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const result = await service.getById(ASSET_ID);

    expect(assetLoanService.listForAsset).toHaveBeenCalledWith(manager, 'tenant-001', ASSET_ID);
    expect(result.loans).toEqual({ data: [loanRecord], total: 1 });
  });

  it('throws 404 when asset does not exist in tenant', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    await expect(service.getById(ASSET_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AssetLifecycleService.listPaginatedForAsset', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns events in descending order with location names', async () => {
    const event = {
      id: 'evt-001',
      tenantId: 'tenant-001',
      serializedAssetId: ASSET_ID,
      eventType: AssetLifecycleEventType.RECEIVED,
      fromStatus: SerializedAssetStatus.IN_RECEIVING,
      toStatus: SerializedAssetStatus.AVAILABLE,
      locationId: LOCATION_ID,
      responsibleRefId: null,
      actorUserId: 'user-001',
      notes: null,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    };
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue([event]),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn().mockResolvedValue([{ id: LOCATION_ID, name: 'Bodega central' }]),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const lifecycleService = new AssetLifecycleService({} as DataSource);
    const result = await lifecycleService.listPaginatedForAsset(ASSET_ID, 1, 20);

    expect(qb.orderBy).toHaveBeenCalledWith('event.created_at', 'DESC');
    expect(result.data[0]).toMatchObject({
      id: 'evt-001',
      locationName: 'Bodega central',
      occurredAt: event.createdAt,
    });
  });
});
