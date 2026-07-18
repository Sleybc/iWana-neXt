import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StockAdjustmentReason, StockMovementOrigin } from '@iwana/shared';
import { StockMovementQueryService } from '../services/stock-movement-query.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  StockLocation: class StockLocation {},
  StockLot: class StockLot {},
  StockMovement: class StockMovement {},
  StockMovementLine: class StockMovementLine {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import { runInTenantSchema } from '@iwana/db';

describe('StockMovementQueryService', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists movements with filters, pagination and enrichment', async () => {
    const movement = {
      id: 'mov-001',
      movementNumber: 'MOV-000001',
      origin: StockMovementOrigin.ADJUSTMENT,
      originContext: 'inventory.adjustment',
      originRefId: StockAdjustmentReason.DAMAGE,
      notes: 'Daño',
      actorUserId: 'user-001',
      isReversal: false,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    };
    const line = {
      id: 'line-001',
      movementId: 'mov-001',
      itemId: 'item-001',
      locationId: 'loc-001',
      lotId: 'lot-001',
      serializedAssetId: null,
      quantity: '-2.00',
      unitCost: null,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    };

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue([movement]),
    };

    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest
        .fn()
        .mockResolvedValueOnce([line])
        .mockResolvedValueOnce([{ id: 'item-001', name: 'Cable UTP', sku: 'CAB-UTP' }])
        .mockResolvedValueOnce([{ id: 'loc-001', name: 'Bodega central', code: 'BC' }])
        .mockResolvedValueOnce([{ id: 'lot-001', lotNumber: 'L-01' }]),
      findOne: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = new StockMovementQueryService({} as DataSource);
    const result = await service.list({
      itemId: '11111111-1111-4111-8111-111111111111',
      origin: StockMovementOrigin.ADJUSTMENT,
      search: 'MOV',
      page: 1,
      limit: 20,
    });

    expect(qb.andWhere).toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(1);
    const first = result.data[0]!;
    expect(first.adjustmentReason).toBe(StockAdjustmentReason.DAMAGE);
    expect(first.lines[0]).toMatchObject({
      itemName: 'Cable UTP',
      itemSku: 'CAB-UTP',
      locationName: 'Bodega central',
      lotNumber: 'L-01',
      quantity: '-2.00',
    });
  });

  it('returns 404 when movement does not exist', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = new StockMovementQueryService({} as DataSource);

    await expect(service.getById('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gets movement detail with enriched lines', async () => {
    const movement = {
      id: 'mov-002',
      movementNumber: 'MOV-000002',
      origin: StockMovementOrigin.PURCHASE_RECEIPT,
      originContext: 'inventory.goods-receipt',
      originRefId: 'gr-001',
      notes: null,
      actorUserId: 'user-001',
      isReversal: false,
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
    };
    const line = {
      id: 'line-002',
      movementId: 'mov-002',
      itemId: 'item-002',
      locationId: 'loc-002',
      lotId: null,
      serializedAssetId: null,
      quantity: '5.00',
      unitCost: '10.00',
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
    };

    const manager = {
      findOne: jest.fn().mockResolvedValue(movement),
      find: jest
        .fn()
        .mockResolvedValueOnce([line])
        .mockResolvedValueOnce([{ id: 'item-002', name: 'ONU', sku: 'ONU-01' }])
        .mockResolvedValueOnce([{ id: 'loc-002', name: 'Nodo 1', code: 'N1' }])
        .mockResolvedValueOnce([]),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    const service = new StockMovementQueryService({} as DataSource);
    const result = await service.getById('mov-002');

    expect(result.adjustmentReason).toBeNull();
    const firstLine = result.lines[0]!;
    expect(firstLine.itemSku).toBe('ONU-01');
    expect(firstLine.unitCost).toBe('10.00');
  });
});
