import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, QueryFailedError } from 'typeorm';
import { InventoryItemKind, InventoryTrackingMode, UserRole } from '@iwana/shared';
import { InventoryItem, runInTenantSchema, TenantContext } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { INVENTORY_EVENTS } from '../events/inventory.events';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { CommercialProductReferencePort } from '../ports/commercial-product-reference.port';
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

const CATEGORY_ID = '11111111-2222-4222-8222-222222222222';

const category = {
  id: CATEGORY_ID,
  tenantId: 'tenant-001',
  code: 'NETWORKING',
  codePrefix: 'NET',
  name: 'Networking',
  status: 'ACTIVE',
};

function makeUniqueViolation(): QueryFailedError {
  const driverError = Object.assign(new Error('unique violation'), {
    code: '23505',
    constraint: 'uq_inventory_items_tenant_sku',
  });
  return new QueryFailedError('INSERT INTO inventory_items ...', [], driverError);
}

describe('InventoryItemService — generacion automatica de SKU', () => {
  let service: InventoryItemService;
  let eventEmitter: { emit: jest.Mock };
  let supplierPartyPort: { getSupplierSummary: jest.Mock };
  let inventoryCategoryService: { resolveCategoryForItem: jest.Mock };
  let skuQueryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    getRawOne: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter = { emit: jest.fn() };
    supplierPartyPort = { getSupplierSummary: jest.fn().mockResolvedValue(null) };
    inventoryCategoryService = {
      resolveCategoryForItem: jest.fn().mockResolvedValue(category),
    };
    service = new InventoryItemService(
      {} as DataSource,
      eventEmitter as unknown as EventEmitter2,
      supplierPartyPort as unknown as SupplierPartyPort,
      inventoryCategoryService as unknown as InventoryCategoryService,
      {
        resolveProductReference: jest.fn(),
        getActiveProducts: jest.fn(),
      } as unknown as CommercialProductReferencePort,
    );

    skuQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(null),
    };
  });

  it('genera SKU compuesto con categoria, tipo, nombre, marca y modelo', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'item-1',
      tenantId: 'tenant-001',
      sku: 'NET-SER-RW6-TPL-AX10',
      categoryId: category.id,
    });
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(skuQueryBuilder),
        findOne: jest.fn(),
        save,
        create: jest.fn((_entity, payload) => payload),
      };
      return work({ manager } as never);
    });

    const result = await service.create(
      {
        name: 'Router WiFi 6',
        brand: 'TP-Link',
        model: 'AX10',
        itemKind: InventoryItemKind.SERIALIZED,
        categoryId: CATEGORY_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'UNIT',
      },
      actor,
    );

    expect(result.sku).toBe('NET-SER-RW6-TPL-AX10');
    expect(save).toHaveBeenCalledWith(
      InventoryItem,
      expect.objectContaining({ sku: 'NET-SER-RW6-TPL-AX10' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.ITEM_CREATED,
      expect.objectContaining({ sku: 'NET-SER-RW6-TPL-AX10' }),
    );
  });

  it('omite marca y modelo cuando no estan disponibles', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'item-2',
      tenantId: 'tenant-001',
      sku: 'NET-STK-SWT24',
      categoryId: category.id,
    });
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(skuQueryBuilder),
        findOne: jest.fn(),
        save,
        create: jest.fn((_entity, payload) => payload),
      };
      return work({ manager } as never);
    });

    const result = await service.create(
      {
        name: 'Switch 24p',
        categoryId: CATEGORY_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'UNIT',
      },
      actor,
    );

    expect(result.sku).toBe('NET-STK-SWT24');
  });

  it('reintenta ante colision de unicidad (23505) y agrega sufijo en el segundo intento', async () => {
    const save = jest.fn().mockRejectedValueOnce(makeUniqueViolation()).mockResolvedValueOnce({
      id: 'item-3',
      tenantId: 'tenant-001',
      sku: 'NET-STK-ONTGP-001',
      categoryId: category.id,
    });

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(skuQueryBuilder),
        findOne: jest.fn(),
        save,
        create: jest.fn((_entity, payload) => payload),
      };
      return work({ manager } as never);
    });

    const result = await service.create(
      {
        name: 'ONT GPON',
        categoryId: CATEGORY_ID,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'UNIT',
      },
      actor,
    );

    expect(result.sku).toBe('NET-STK-ONTGP-001');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('falla tras agotar los reintentos de colision de unicidad', async () => {
    const save = jest.fn().mockRejectedValue(makeUniqueViolation());

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(skuQueryBuilder),
        findOne: jest.fn(),
        save,
        create: jest.fn((_entity, payload) => payload),
      };
      return work({ manager } as never);
    });

    await expect(
      service.create(
        {
          name: 'ONT GPON',
          categoryId: CATEGORY_ID,
          trackingMode: InventoryTrackingMode.SERIALIZED,
          unitOfMeasure: 'UNIT',
        },
        actor,
      ),
    ).rejects.toThrow(ConflictException);

    expect(save).toHaveBeenCalledTimes(3);
  });

  it('respeta el SKU custom del tenant cuando se envia explicitamente', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'item-4',
      tenantId: 'tenant-001',
      sku: 'CUSTOM-99',
      categoryId: category.id,
    });
    const findOne = jest.fn().mockResolvedValue(null);
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(skuQueryBuilder),
        findOne,
        save,
        create: jest.fn((_entity, payload) => payload),
      };
      return work({ manager } as never);
    });

    const result = await service.create(
      {
        sku: 'CUSTOM-99',
        name: 'Producto custom',
        categoryId: CATEGORY_ID,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        unitOfMeasure: 'METER',
      },
      actor,
    );

    expect(result.sku).toBe('CUSTOM-99');
    expect(findOne).toHaveBeenCalledWith(InventoryItem, {
      where: { tenantId: 'tenant-001', sku: 'CUSTOM-99' },
    });
  });
});
