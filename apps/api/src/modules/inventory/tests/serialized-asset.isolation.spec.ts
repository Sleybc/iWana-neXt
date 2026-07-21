import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';
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
  TenantContext: {
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as {
  TenantContext: { getOrThrow: jest.Mock };
  runInTenantSchema: jest.Mock;
};

const ASSET_IN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSET_IN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('SerializedAsset aislamiento cross-tenant', () => {
  let currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
  const assetsBySchema = new Map<string, Map<string, Record<string, unknown>>>();

  function seedAsset(schemaName: string, asset: Record<string, unknown>): void {
    if (!assetsBySchema.has(schemaName)) {
      assetsBySchema.set(schemaName, new Map());
    }
    assetsBySchema.get(schemaName)!.set(asset.id as string, asset);
  }

  function managerFor(schemaName: string) {
    const assets = assetsBySchema.get(schemaName) ?? new Map();
    return {
      findOne: jest.fn(
        async (entity: { name: string }, criteria: { where: Record<string, unknown> }) => {
          if (entity.name !== 'SerializedAsset') {
            return null;
          }
          const { id, tenantId } = criteria.where;
          const asset = assets.get(id as string);
          if (!asset || asset.tenantId !== tenantId) {
            return null;
          }
          return asset;
        },
      ),
      createQueryBuilder: jest.fn(),
    };
  }

  let service: SerializedAssetService;

  beforeAll(() => {
    iwanaDb.TenantContext.getOrThrow.mockImplementation(() => currentTenant);
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) =>
        cb({ manager: managerFor(schemaName) }),
    );

    const assetLifecycleService = {
      listPaginatedForAsset: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    };
    const stockMovementQueryService = {
      list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    };

    const supplierPartyPort = {
      getSupplierSummary: jest.fn(),
    };

    const assetLoanService = {
      listForAsset: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };

    service = new SerializedAssetService(
      {} as DataSource,
      assetLifecycleService as unknown as AssetLifecycleService,
      stockMovementQueryService as unknown as StockMovementQueryService,
      supplierPartyPort as unknown as SupplierPartyPort,
      assetLoanService as unknown as AssetLoanService,
    );

    seedAsset('tenant_a', {
      id: ASSET_IN_A,
      tenantId: 'tenant-a',
      inventoryItemId: 'item-a',
      serialNumber: 'SN-A',
      macAddress: null,
      assetTag: null,
      currentStatus: 'AVAILABLE',
      currentLocationId: null,
      currentResponsibleType: 'WAREHOUSE',
      currentResponsibleRefId: null,
      subscriberRefId: null,
      contractRefId: null,
      purchaseOrderRef: null,
      purchaseDate: null,
      usefulLifeMonths: null,
      warrantyUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    seedAsset('tenant_b', {
      id: ASSET_IN_B,
      tenantId: 'tenant-b',
      inventoryItemId: 'item-b',
      serialNumber: 'SN-B',
      macAddress: null,
      assetTag: null,
      currentStatus: 'AVAILABLE',
      currentLocationId: null,
      currentResponsibleType: 'WAREHOUSE',
      currentResponsibleRefId: null,
      subscriberRefId: null,
      contractRefId: null,
      purchaseOrderRef: null,
      purchaseDate: null,
      usefulLifeMonths: null,
      warrantyUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('un tenant no puede leer activos de otro (404 cruzado)', async () => {
    currentTenant = { tenantId: 'tenant-b', schemaName: 'tenant_b' };
    await expect(service.getById(ASSET_IN_A)).rejects.toBeInstanceOf(NotFoundException);
  });
});
