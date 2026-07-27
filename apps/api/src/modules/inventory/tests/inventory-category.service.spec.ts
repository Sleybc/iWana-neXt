import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { InventoryCategoryStatus, UserRole } from '@iwana/shared';
import { InventoryCategory, runInTenantSchema, TenantContext } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { INVENTORY_EVENTS } from '../events/inventory.events';
import { InventoryCategoryService } from '../services/inventory-category.service';

jest.mock('@iwana/db', () => ({
  InventoryCategory: class InventoryCategory {},
  InventoryItem: class InventoryItem {},
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
  sub: 'admin-001',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-admin',
  type: 'tenant',
};

describe('InventoryCategoryService', () => {
  let service: InventoryCategoryService;
  let eventEmitter: { emit: jest.Mock };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    clone: jest.Mock;
    getCount: jest.Mock;
    getMany: jest.Mock;
  };
  let countQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    groupBy: jest.Mock;
    getRawMany: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter = { emit: jest.fn() };
    service = new InventoryCategoryService(
      {} as DataSource,
      eventEmitter as unknown as EventEmitter2,
    );

    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'cat-001',
          tenantId: 'tenant-001',
          code: 'CPE',
          codePrefix: 'CPE',
          name: 'CPE',
          description: null,
          status: InventoryCategoryStatus.ACTIVE,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    };
    queryBuilder.clone.mockReturnValue(queryBuilder);

    countQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ categoryId: 'cat-001', productCount: '3' }]),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(queryBuilder)
          .mockReturnValueOnce(countQueryBuilder),
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((_entity, payload) => payload),
        count: jest.fn().mockResolvedValue(0),
      };

      return work({ manager } as never);
    });
  });

  it('lists categories with product counts, total and cursor meta', async () => {
    const result = await service.list({ search: 'cpe', status: InventoryCategoryStatus.ACTIVE });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(category.code) LIKE :term OR LOWER(category.name) LIKE :term)',
      { term: '%cpe%' },
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(21);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.productCount).toBe(3);
    expect(result.meta.total).toBe(1);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('creates category with codePrefix and emits domain event', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'cat-002',
      tenantId: 'tenant-001',
      code: 'FIBER',
      codePrefix: 'FIB',
      name: 'Fibra',
      status: InventoryCategoryStatus.ACTIVE,
    });

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        findOne: jest.fn().mockResolvedValue(null),
        save,
        create: jest.fn((_entity, payload) => payload),
        count: jest.fn().mockResolvedValue(0),
      };

      return work({ manager } as never);
    });

    const result = await service.create(
      {
        code: 'FIBER',
        codePrefix: 'FIB',
        name: 'Fibra',
        status: InventoryCategoryStatus.ACTIVE,
        sortOrder: 1,
      },
      actor,
    );

    expect(result.productCount).toBe(0);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.CATEGORY_CREATED,
      expect.objectContaining({ categoryId: 'cat-002' }),
    );
  });

  it('rejects duplicate code on create', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({ id: 'existing' }),
        save: jest.fn(),
        create: jest.fn(),
      };
      return work({ manager } as never);
    });

    await expect(
      service.create(
        {
          code: 'CPE',
          codePrefix: 'CPE',
          name: 'CPE',
          status: InventoryCategoryStatus.ACTIVE,
          sortOrder: 0,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws when category does not exist on getById', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      return work({ manager } as never);
    });

    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('suggests unique prefix and next sort order', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        find: jest.fn().mockResolvedValue([
          { id: 'cat-001', codePrefix: 'CPE', sortOrder: 0 },
          { id: 'cat-002', codePrefix: 'FIB', sortOrder: 1 },
        ]),
      };
      return work({ manager } as never);
    });

    const result = await service.suggestPrefix({ name: 'Consumibles RD' });
    expect(result.codePrefix).toHaveLength(3);
    expect(result.sortOrder).toBe(2);
  });

  it('updates category and emits status change when status flips', async () => {
    const existing = Object.assign(new InventoryCategory(), {
      id: 'cat-001',
      tenantId: 'tenant-001',
      code: 'CPE',
      codePrefix: 'CPE',
      name: 'CPE',
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 0,
    });

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (_entity, payload) => payload),
        count: jest.fn().mockResolvedValue(2),
      };
      return work({ manager } as never);
    });

    const result = await service.update(
      'cat-001',
      { status: InventoryCategoryStatus.INACTIVE },
      actor,
    );

    expect(result.status).toBe(InventoryCategoryStatus.INACTIVE);
    expect(result.productCount).toBe(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.CATEGORY_STATUS_CHANGED,
      expect.objectContaining({ categoryId: 'cat-001' }),
    );
  });
});
