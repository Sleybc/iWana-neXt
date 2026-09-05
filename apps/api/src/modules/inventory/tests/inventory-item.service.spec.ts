import { NotFoundException } from '@nestjs/common';
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

describe('InventoryItemService', () => {
  let service: InventoryItemService;
  let eventEmitter: { emit: jest.Mock };
  let supplierPartyPort: { getSupplierSummary: jest.Mock };
  let inventoryCategoryService: {
    resolveCategoryForItem: jest.Mock;
  };
  let commercialProductReferencePort: {
    resolveProductReference: jest.Mock;
    getActiveProducts: jest.Mock;
  };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    skip: jest.Mock;
    clone: jest.Mock;
    getCount: jest.Mock;
    select: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    getMany: jest.Mock;
    setParameter: jest.Mock;
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
        codePrefix: 'MAT',
        name: 'Materiales',
        status: 'ACTIVE',
      }),
    };
    commercialProductReferencePort = {
      resolveProductReference: jest.fn().mockResolvedValue(null),
      getActiveProducts: jest.fn().mockResolvedValue([]),
    };
    service = new InventoryItemService(
      {} as DataSource,
      eventEmitter as unknown as EventEmitter2,
      supplierPartyPort as unknown as SupplierPartyPort,
      inventoryCategoryService as unknown as InventoryCategoryService,
      commercialProductReferencePort as unknown as CommercialProductReferencePort,
    );

    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      select: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      setParameter: jest.fn().mockReturnThis(),
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

  it('filters list by search and belowMinimum', async () => {
    const result = await service.list({ search: 'ont', belowMinimum: true });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(item.sku)'),
      expect.objectContaining({ term: '%ont%' }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('stock_balances'));
    expect(result).toMatchObject({
      data: [],
      meta: { nextCursor: null, total: 0, mode: 'cursor' },
    });
  });

  it('filters list by search and purchasable flag', async () => {
    const result = await service.list({ search: 'ont', purchasable: true });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(item.sku)'),
      expect.objectContaining({ term: '%ont%' }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('item.purchasable = :purchasable', {
      purchasable: true,
    });
    expect(queryBuilder.take).toHaveBeenCalledWith(21);
    expect(result).toMatchObject({
      data: [],
      meta: { nextCursor: null, total: 0, mode: 'cursor' },
    });
  });

  it('retorna items paginados con meta.nextCursor y total', async () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';
    queryBuilder.getCount.mockResolvedValue(1);
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'item-1',
        tenantId: 'tenant-001',
        categoryId,
        sku: 'SKU-1',
        name: 'ONT',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        description: null,
        brand: null,
        model: null,
        itemKind: InventoryItemKind.STOCK,
        category: InventoryItemCategory.CPE,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        unitOfMeasure: 'UNIT',
        baseCost: '0',
        minimumStock: '0',
        purchasable: true,
        inventoryControlled: true,
        assetControlled: true,
        preferredSupplierRefId: null,
        supplierSku: null,
        purchaseUnitOfMeasure: null,
        purchaseToBaseUomFactor: null,
        standardCost: '0',
        lastPurchaseCost: null,
        averageCost: '0',
        reorderPoint: '0',
        targetStock: '0',
        minimumOrderQty: null,
        orderMultiple: null,
        leadTimeDays: null,
        usefulLifeMonths: null,
        commercialReferenceId: null,
        status: InventoryItemStatus.ACTIVE,
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    const categoryQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: categoryId,
          tenantId: 'tenant-001',
          code: 'CPE',
          codePrefix: 'CPE',
          name: 'CPE',
          status: 'ACTIVE',
        },
      ]),
    };

    runInTenantSchemaMock
      .mockImplementationOnce(async (_ds, _schema, work) => {
        const manager = {
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        };
        return work({ manager } as never);
      })
      .mockImplementationOnce(async (_ds, _schema, work) => {
        const manager = {
          createQueryBuilder: jest.fn().mockReturnValue(categoryQb),
        };
        return work({ manager } as never);
      });

    const result = await service.list({ limit: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.meta.nextCursor).toBeNull();
    expect(result.meta.mode).toBe('cursor');
    expect(result.meta.capabilities.randomAccess).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.sku).toBe('SKU-1');
  });

  it('indica nextCursor cuando hay más ítems que el limit', async () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';
    const makeItem = (id: string, day: string) => ({
      id,
      tenantId: 'tenant-001',
      categoryId,
      sku: `SKU-${id}`,
      name: `Item ${id}`,
      createdAt: new Date(`${day}T00:00:00.000Z`),
      description: null,
      brand: null,
      model: null,
      itemKind: InventoryItemKind.STOCK,
      category: InventoryItemCategory.CPE,
      trackingMode: InventoryTrackingMode.SERIALIZED,
      unitOfMeasure: 'UNIT',
      baseCost: '0',
      minimumStock: '0',
      purchasable: true,
      inventoryControlled: true,
      assetControlled: true,
      preferredSupplierRefId: null,
      supplierSku: null,
      purchaseUnitOfMeasure: null,
      purchaseToBaseUomFactor: null,
      standardCost: '0',
      lastPurchaseCost: null,
      averageCost: '0',
      reorderPoint: '0',
      targetStock: '0',
      minimumOrderQty: null,
      orderMultiple: null,
      leadTimeDays: null,
      usefulLifeMonths: null,
      commercialReferenceId: null,
      status: InventoryItemStatus.ACTIVE,
      updatedAt: new Date(`${day}T00:00:00.000Z`),
    });

    queryBuilder.getCount.mockResolvedValue(3);
    queryBuilder.getMany.mockResolvedValue([
      makeItem('a', '2026-07-03'),
      makeItem('b', '2026-07-02'),
      makeItem('c', '2026-07-01'),
    ]);

    const categoryQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: categoryId,
          tenantId: 'tenant-001',
          code: 'CPE',
          codePrefix: 'CPE',
          name: 'CPE',
          status: 'ACTIVE',
        },
      ]),
    };

    runInTenantSchemaMock
      .mockImplementationOnce(async (_ds, _schema, work) => {
        const manager = {
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        };
        return work({ manager } as never);
      })
      .mockImplementationOnce(async (_ds, _schema, work) => {
        const manager = {
          createQueryBuilder: jest.fn().mockReturnValue(categoryQb),
        };
        return work({ manager } as never);
      });

    const result = await service.list({ limit: 2 });

    expect(result.meta.total).toBe(3);
    expect(result.meta.nextCursor).toBeTruthy();
    expect(result.data).toHaveLength(2);
    expect(queryBuilder.take).toHaveBeenCalledWith(3);
  });

  it('rejects create when unitOfMeasure is outside the canonical catalog (F5a)', async () => {
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
          unitOfMeasure: 'unidad',
        },
        actor,
      ),
    ).rejects.toThrow('La unidad de medida no pertenece al catálogo canónico.');
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
          unitOfMeasure: 'METER',
          purchaseUnitOfMeasure: 'ROLL',
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
        // F5b (ADR-085 D2): par dimensionalmente válido (empaque COUNT).
        unitOfMeasure: 'UNIT',
        purchasable: true,
        purchaseUnitOfMeasure: 'BOX',
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
        purchaseUnitOfMeasure: 'BOX',
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

  it('ignores sku on update (immutable) and updates other fields', async () => {
    const existing = {
      id: 'item-001',
      tenantId: 'tenant-001',
      sku: 'ONT-001',
      name: 'ONT',
      categoryId: '11111111-1111-4111-8111-111111111111',
      category: InventoryItemCategory.CPE,
      // S2: el merge de update revalida el cruce itemKind ↔ trackingMode contra
      // el esquema de creación, así que el fixture de ítem serializado lo declara.
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.SERIALIZED,
      unitOfMeasure: 'UNIT',
      assetControlled: true,
      purchaseUnitOfMeasure: null,
      purchaseToBaseUomFactor: null,
      reorderPoint: '0',
      status: InventoryItemStatus.ACTIVE,
      purchasable: true,
    };

    const savedItem = { ...existing, purchasable: false };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce({
          id: '11111111-1111-4111-8111-111111111111',
          tenantId: 'tenant-001',
          code: 'CPE',
          codePrefix: 'CPE',
          name: 'CPE',
          status: 'ACTIVE',
        }),
        save: jest.fn().mockResolvedValue(savedItem),
      };

      return work({ manager } as never);
    });

    const result = await service.update(
      'item-001',
      { sku: 'ONT-999', purchasable: false } as Parameters<InventoryItemService['update']>[1],
      actor,
    );

    expect(result.sku).toBe('ONT-001');
    expect(result.purchasable).toBe(false);
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
        unitOfMeasure: 'UNIT',
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

  it('deletes inventory item when it has no dependencies', async () => {
    const remove = jest.fn().mockResolvedValue({ affected: 1 });
    const findOne = jest.fn().mockResolvedValue({
      id: 'item-delete',
      tenantId: 'tenant-001',
      sku: 'NET-STK-RTR-TPL-AC50',
    });
    const query = jest.fn().mockResolvedValue([
      {
        has_balances: false,
        has_lots: false,
        has_assets: false,
        has_po_lines: false,
        has_movements: false,
        has_receipts: false,
        has_writeoffs: false,
      },
    ]);

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne,
        query,
        delete: remove,
      };
      return work({ manager } as never);
    });

    await expect(service.delete('item-delete', actor)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(InventoryItem, {
      id: 'item-delete',
      tenantId: 'tenant-001',
    });
  });

  it('rejects delete when inventory item has dependencies', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 'item-delete',
      tenantId: 'tenant-001',
      sku: 'NET-STK-RTR-TPL-AC50',
    });
    const query = jest.fn().mockResolvedValue([
      {
        has_balances: true,
        has_lots: false,
        has_assets: false,
        has_po_lines: false,
        has_movements: false,
        has_receipts: false,
        has_writeoffs: false,
      },
    ]);

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne,
        query,
        delete: jest.fn(),
      };
      return work({ manager } as never);
    });

    await expect(service.delete('item-delete', actor)).rejects.toThrow(
      'No se puede eliminar el producto porque tiene stock, activos o movimientos asociados.',
    );
  });

  describe('código de barras (MOD12 · F4)', () => {
    const baseInput = {
      sku: 'CABLE-01',
      name: 'Cable drop',
      categoryId: '11111111-1111-4111-8111-111111111111',
      trackingMode: InventoryTrackingMode.CONSUMABLE,
      unitOfMeasure: 'UNIT',
    };

    function barcodeManager() {
      const findOne = jest.fn().mockResolvedValue(null);
      const save = jest.fn().mockResolvedValue({ id: 'item-001', sku: 'CABLE-01' });
      const create = jest.fn((_entity: unknown, payload: unknown) => payload);
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
        const manager = { findOne, save, create };
        return work({ manager } as never);
      });
      return { findOne, save, create };
    }

    it('crea el artículo con barcode y barcodeType cuando el EAN-13 tiene dígito válido', async () => {
      const { save } = barcodeManager();

      await service.create(
        { ...baseInput, barcode: '8412345678905', barcodeType: 'EAN13' } as Parameters<
          InventoryItemService['create']
        >[0],
        actor,
      );

      expect(save).toHaveBeenCalledWith(
        InventoryItem,
        expect.objectContaining({ barcode: '8412345678905', barcodeType: 'EAN13' }),
      );
    });

    it('crea el artículo con UPCA válido y sin código (CA-F4-01)', async () => {
      const { save } = barcodeManager();

      await service.create(
        { ...baseInput, barcode: '036000291452', barcodeType: 'UPCA' } as Parameters<
          InventoryItemService['create']
        >[0],
        actor,
      );
      expect(save).toHaveBeenCalledWith(
        InventoryItem,
        expect.objectContaining({ barcode: '036000291452', barcodeType: 'UPCA' }),
      );

      await service.create({ ...baseInput }, actor);
      expect(save).toHaveBeenLastCalledWith(
        InventoryItem,
        expect.objectContaining({ barcode: null, barcodeType: null }),
      );
    });

    it('rechaza un EAN-13 con dígito de control inválido explicando el motivo (CA-F4-03)', async () => {
      barcodeManager();

      // Check real del payload 841234567890 es 5: 03 y 04 son inválidos.
      await expect(
        service.create(
          { ...baseInput, barcode: '8412345678904', barcodeType: 'EAN13' } as Parameters<
            InventoryItemService['create']
          >[0],
          actor,
        ),
      ).rejects.toThrow('dígito de control');

      await expect(
        service.create(
          { ...baseInput, barcode: '8412345678903', barcodeType: 'EAN13' } as Parameters<
            InventoryItemService['create']
          >[0],
          actor,
        ),
      ).rejects.toThrow('dígito de control');
    });

    it('rechaza un UPCA con dígito de control inválido (CA-F4-03)', async () => {
      barcodeManager();

      await expect(
        service.create(
          { ...baseInput, barcode: '036000291453', barcodeType: 'UPCA' } as Parameters<
            InventoryItemService['create']
          >[0],
          actor,
        ),
      ).rejects.toThrow('dígito de control');
    });

    it('rechaza barcode sin barcodeType y viceversa (CA-F4-08)', async () => {
      barcodeManager();

      await expect(
        service.create(
          { ...baseInput, barcode: 'ABC-123' } as Parameters<InventoryItemService['create']>[0],
          actor,
        ),
      ).rejects.toThrow('el formato va junto al código');

      await expect(
        service.create(
          { ...baseInput, barcodeType: 'CODE128' } as Parameters<InventoryItemService['create']>[0],
          actor,
        ),
      ).rejects.toThrow('va junto al código');
    });

    it('rechaza la pareja a medias en null (código sin formato o formato sin código)', async () => {
      barcodeManager();

      await expect(
        service.create(
          { ...baseInput, barcode: '8412345678905', barcodeType: null } as Parameters<
            InventoryItemService['create']
          >[0],
          actor,
        ),
      ).rejects.toThrow('el formato va junto al código');

      await expect(
        service.create(
          { ...baseInput, barcode: null, barcodeType: 'EAN13' } as Parameters<
            InventoryItemService['create']
          >[0],
          actor,
        ),
      ).rejects.toThrow('limpia ambos campos');
    });

    it('permite el mismo código en dos tenants distintos (CA-F4-09: unicidad por tenant)', async () => {
      const { findOne, save } = barcodeManager();
      (TenantContext.getOrThrow as unknown as jest.Mock).mockReturnValueOnce({
        tenantId: 'tenant-002',
        schemaName: 'tenant_002',
      });

      await service.create(
        { ...baseInput, barcode: '8412345678905', barcodeType: 'EAN13' } as Parameters<
          InventoryItemService['create']
        >[0],
        actor,
      );

      // El pre-check de colisión pregunta POR TENANT: el dueño de otro tenant
      // no bloquea y el alta procede.
      expect(findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { tenantId: 'tenant-002', barcode: '8412345678905' },
        }),
      );
      expect(save).toHaveBeenCalled();
    });

    it('rechaza la colisión identificando el artículo que ya usa el código (CA-F4-02)', async () => {
      const { findOne, save } = barcodeManager();
      findOne.mockResolvedValue({
        id: 'item-owner',
        tenantId: 'tenant-001',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        barcode: '8412345678905',
      });

      await expect(
        service.create(
          { ...baseInput, barcode: '8412345678905', barcodeType: 'EAN13' } as Parameters<
            InventoryItemService['create']
          >[0],
          actor,
        ),
      ).rejects.toThrow(
        'El código de barras 8412345678905 ya está asignado al artículo ONT-001 (ONT WiFi 6).',
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('rechaza en update fijar el código que ya usa otro artículo (CA-F4-02)', async () => {
      const existing = {
        id: 'item-001',
        tenantId: 'tenant-001',
        sku: 'CABLE-01',
        name: 'Cable drop',
        categoryId: '11111111-1111-4111-8111-111111111111',
        category: InventoryItemCategory.MATERIALS,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        unitOfMeasure: 'UNIT',
        assetControlled: false,
        purchaseUnitOfMeasure: null,
        purchaseToBaseUomFactor: null,
        reorderPoint: '0',
        status: InventoryItemStatus.ACTIVE,
        purchasable: true,
      };
      const owner = {
        id: 'item-otro',
        tenantId: 'tenant-001',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        barcode: '8412345678905',
      };
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(owner)
        .mockResolvedValue(null);
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
        const manager = {
          findOne,
          save: jest.fn().mockResolvedValue(existing),
          create: jest.fn((_entity: unknown, payload: unknown) => payload),
        };
        return work({ manager } as never);
      });

      await expect(
        service.update(
          'item-001',
          { barcode: '8412345678905', barcodeType: 'EAN13' } as Parameters<
            InventoryItemService['update']
          >[1],
          actor,
        ),
      ).rejects.toThrow('ya está asignado al artículo ONT-001');
    });

    it('limpia el par barcode/barcodeType cuando ambos llegan en null (regla 6: editable)', async () => {
      barcodeManager();
      const existing = {
        id: 'item-001',
        tenantId: 'tenant-001',
        sku: 'CABLE-01',
        name: 'Cable drop',
        categoryId: '11111111-1111-4111-8111-111111111111',
        category: InventoryItemCategory.MATERIALS,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        unitOfMeasure: 'UNIT',
        assetControlled: false,
        purchaseUnitOfMeasure: null,
        purchaseToBaseUomFactor: null,
        reorderPoint: '0',
        status: InventoryItemStatus.ACTIVE,
        purchasable: true,
        barcode: '8412345678905',
        barcodeType: 'EAN13',
      };
      const findOne = jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        tenantId: 'tenant-001',
        code: 'MATERIALS',
        codePrefix: 'MAT',
        name: 'Materiales',
        status: 'ACTIVE',
      });
      const updateSave = jest.fn().mockResolvedValue(existing);
      runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
        const manager = {
          findOne,
          save: updateSave,
          create: jest.fn((_entity: unknown, payload: unknown) => payload),
        };
        return work({ manager } as never);
      });

      await service.update(
        'item-001',
        { barcode: null, barcodeType: null } as unknown as Parameters<
          InventoryItemService['update']
        >[1],
        actor,
      );

      expect(updateSave).toHaveBeenCalledWith(
        InventoryItem,
        expect.objectContaining({ barcode: null, barcodeType: null }),
      );
    });

    it('la búsqueda del listado y del picker incluyen el código de barras (CA-F4-04)', async () => {
      await service.list({ search: '8412345678905' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('item.barcode'),
        expect.objectContaining({ term: '%8412345678905%' }),
      );

      await service.searchForPicker({ q: '8412345678905' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('item.barcode'),
        expect.objectContaining({ like: '%8412345678905%' }),
      );

      await service.listCatalogOptions({ search: '8412345678905' }, actor);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('item.barcode'),
        expect.objectContaining({ term: '%8412345678905%' }),
      );
    });
  });
});
