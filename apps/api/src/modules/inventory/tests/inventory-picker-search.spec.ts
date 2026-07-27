import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryItemService } from '../services/inventory-item.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { CommercialProductReferencePort } from '../ports/commercial-product-reference.port';
import { SupplierPartyPort } from '../ports/supplier-party.port';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

describe('InventoryItemService.searchForPicker', () => {
  let service: InventoryItemService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });
    mockRunInTenantSchema.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: InventoryCategoryService, useValue: {} },
        { provide: CommercialProductReferencePort, useValue: {} },
        { provide: SupplierPartyPort, useValue: {} },
      ],
    }).compile();

    service = module.get(InventoryItemService);
  });

  it('retorna vacío si q está en blanco', async () => {
    await expect(service.searchForPicker({ q: ' ' })).resolves.toEqual({ data: [], total: 0 });
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('mapea nombre + SKU y reporta total', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn().mockResolvedValue(2),
      getMany: jest
        .fn()
        .mockResolvedValue([{ id: 'item-1', name: 'Router Wi-Fi 6', sku: 'RTR-001' }]),
    };
    qb.clone.mockReturnValue(qb);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({ manager: { createQueryBuilder: () => qb } }),
    );

    const result = await service.searchForPicker({ q: 'router', limit: 20 });
    expect(result).toEqual({
      data: [{ id: 'item-1', label: 'Router Wi-Fi 6', sublabel: 'SKU RTR-001' }],
      total: 2,
    });
  });
});
