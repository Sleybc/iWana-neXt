import { ConflictException } from '@nestjs/common';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource, QueryFailedError } from 'typeorm';
import { StockLocationService } from '../services/stock-location.service';

jest.mock('@iwana/db', () => ({
  StockLocation: class StockLocation {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

describe('StockLocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('generates a location code when code is omitted', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'loc-generated',
        ...payload,
      })),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ code: 'MOV-002' }]),
      })),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLocationService({} as DataSource);

    const created = await service.create({
      name: 'Móvil zona norte',
      type: StockLocationType.MOBILE_TECHNICIAN,
      status: StockLocationStatus.ACTIVE,
      responsibleRefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      maxCapacity: 8,
    });

    expect(created.code).toBe('MOV-003');
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'MOV-003' }),
    );
  });

  it('keeps manual code creation when code is provided', async () => {
    const createQueryBuilder = jest.fn();
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'loc-manual',
        ...payload,
      })),
      createQueryBuilder,
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLocationService({} as DataSource);

    const created = await service.create({
      code: 'CUAR-99',
      name: 'Cuarentena manual',
      type: StockLocationType.QUARANTINE,
      status: StockLocationStatus.ACTIVE,
    });

    expect(created.code).toBe('CUAR-99');
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('translates duplicate active mobile responsible collisions into conflict errors on create', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockRejectedValue(
        new QueryFailedError('INSERT INTO stock_locations ...', [], {
          code: '23505',
        } as Error & { code: string }),
      ),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLocationService({} as DataSource);

    await expect(
      service.create({
        name: 'Móvil zona norte',
        type: StockLocationType.MOBILE_TECHNICIAN,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        maxCapacity: 8,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('translates duplicate active mobile responsible collisions into conflict errors on update', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'loc-001',
        tenantId: 'tenant-001',
        code: 'MOV-01',
        name: 'Móvil zona norte',
        type: StockLocationType.MOBILE_TECHNICIAN,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        maxCapacity: '8.00',
      }),
      save: jest.fn().mockRejectedValue(
        new QueryFailedError('UPDATE stock_locations ...', [], {
          code: '23505',
        } as Error & { code: string }),
      ),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(async (_dataSource, _schemaName, work) =>
      work({ manager }),
    );

    const service = new StockLocationService({} as DataSource);

    await expect(
      service.update('loc-001', {
        responsibleRefId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
