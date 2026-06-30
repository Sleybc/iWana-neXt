import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  UserRole,
} from '@iwana/shared';
import { InventoryItem, runInTenantSchema, TenantContext } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { INVENTORY_EVENTS } from '../events/inventory.events';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { InventoryItemService } from '../services/inventory-item.service';
import { InventoryCategoryService } from '../services/inventory-category.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  InventoryCategory: class InventoryCategory {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

describe('InventoryItemService', () => {
  let service: InventoryItemService;
  let eventEmitter: { emit: jest.Mock };
  let supplierPartyPort: { getSupplierSummary: jest.Mock };
  let inventoryCategoryService: {
    resolveCategoryForItem: jest.Mock;
  };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    select: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter = { emit: jest.fn() };
    supplierPartyPort = { getSupplierSummary: jest.fn().mockResolvedValue(null) };
    inventoryCategoryService = {
      resolveCategoryForItem: jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        tenantId: 'tenant-001',
        code: 'MATERIALS',
        name: 'Materiales',
        status: 'ACTIVE',
      }),
    };
    service = new InventoryItemService(
      {} as DataSource,
      eventEmitter as unknown as EventEmitter2,
      supplierPartyPort as unknown as SupplierPartyPort,
      inventoryCategoryService as unknown as InventoryCategoryService,
    );

    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((_entity, payload) => payload),
      };

      return work({ manager } as never);
    });
  });

  it('filters list by search and purchasable flag', async () => {
    await service.list({ search: 'ont', purchasable: true });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(item.sku)'),
      expect.objectContaining({ term: '%ont%' }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('item.purchasable = :purchasable', {
      purchasable: true,
    });
  });

  it('rejects create when purchase unit lacks conversion factor', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
        create: jest.fn((_entity, payload) => payload),
      };

      return work({ manager } as never);
    });

    await expect(
      service.create(
        {
          sku: 'CABLE-01',
          name: 'Cable drop',
          category: InventoryItemCategory.MATERIALS,
          trackingMode: InventoryTrackingMode.CONSUMABLE,
          unitOfMeasure: 'metro',
          purchaseUnitOfMeasure: 'rollo',
          purchaseToBaseUomFactor: 0,
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  it('creates item with purchase fields and emits domain event', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'item-001',
      tenantId: 'tenant-001',
      sku: 'CABLE-01',
    });

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        save,
        create: jest.fn((_entity, payload) => payload),
      };

      return work({ manager } as never);
    });

    await service.create(
      {
        sku: 'CABLE-01',
        name: 'Cable drop',
        categoryId: '11111111-1111-4111-8111-111111111111',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        unitOfMeasure: 'metro',
        purchasable: true,
        purchaseUnitOfMeasure: 'rollo',
        purchaseToBaseUomFactor: 100,
        standardCost: 1500,
      },
      actor,
    );

    expect(save).toHaveBeenCalledWith(
      InventoryItem,
      expect.objectContaining({
        sku: 'CABLE-01',
        categoryId: '11111111-1111-4111-8111-111111111111',
        purchasable: true,
        purchaseUnitOfMeasure: 'rollo',
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.ITEM_CREATED,
      expect.objectContaining({
        inventoryItemId: 'item-001',
        actorUserId: actor.sub,
      }),
    );
  });

  it('throws when item is missing on getById', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      return work({ manager } as never);
    });

    await expect(service.getById('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('updates item flags and rejects sku conflicts', async () => {
    const existing = {
      id: 'item-001',
      tenantId: 'tenant-001',
      sku: 'ONT-001',
      name: 'ONT',
      categoryId: '11111111-1111-4111-8111-111111111111',
      category: InventoryItemCategory.CPE,
      trackingMode: InventoryTrackingMode.SERIALIZED,
      unitOfMeasure: 'unidad',
      assetControlled: true,
      purchaseUnitOfMeasure: null,
      purchaseToBaseUomFactor: null,
      reorderPoint: '0',
      status: InventoryItemStatus.ACTIVE,
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ id: 'item-002', sku: 'ONT-002' }),
        save: jest.fn(),
      };

      return work({ manager } as never);
    });

    await expect(
      service.update('item-001', { sku: 'ONT-002', purchasable: false }, actor),
    ).rejects.toThrow(ConflictException);
  });

  it('lists only active purchasable catalog options with supplier names', async () => {
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'item-001',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        categoryId: '11111111-1111-4111-8111-111111111111',
        category: InventoryItemCategory.CPE,
        itemKind: InventoryItemKind.SERIALIZED,
        unitOfMeasure: 'unidad',
        purchaseUnitOfMeasure: null,
        standardCost: '120000.00',
        preferredSupplierRefId: 'supplier-1',
        supplierSku: null,
        inventoryCategory: {
          id: 'cat-cpe',
          name: 'CPE',
          code: 'CPE',
        },
      },
    ]);
    supplierPartyPort.getSupplierSummary.mockResolvedValue({
      partyRefId: 'supplier-1',
      displayName: 'Proveedor Alfa',
      primaryContact: null,
      phone: null,
      email: null,
      city: null,
      status: 'ACTIVE',
    });

    const options = await service.listCatalogOptions({ search: 'ont' }, actor);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('item.status = :status', {
      status: InventoryItemStatus.ACTIVE,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('item.purchasable = TRUE');
    expect(options).toHaveLength(1);
    expect(options[0]?.preferredSupplierName).toBe('Proveedor Alfa');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.CATALOG_OPTION_REQUESTED,
      expect.objectContaining({
        actorUserId: actor.sub,
        resultCount: 1,
      }),
    );
  });
});
