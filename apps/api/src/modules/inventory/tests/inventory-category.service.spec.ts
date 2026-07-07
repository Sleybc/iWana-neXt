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
    leftJoin: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    groupBy: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getRawAndEntities: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter = { emit: jest.fn() };
    service = new InventoryCategoryService(
      {} as DataSource,
      eventEmitter as unknown as EventEmitter2,
    );

    queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: [
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
        ],
        raw: [{ productCount: '3' }],
      }),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((_entity, payload) => payload),
        count: jest.fn().mockResolvedValue(0),
      };

      return work({ manager } as never);
    });
  });

  it('lists categories with product counts and search order', async () => {
    const result = await service.list({ search: 'cpe', status: InventoryCategoryStatus.ACTIVE });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(category.code) LIKE :term OR LOWER(category.name) LIKE :term)',
      { term: '%cpe%' },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.productCount).toBe(3);
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
        findOne: jest.fn().mockResolvedValue(null),
        save,
        create: jest.fn((_entity, payload) => payload),
      };

      return work({ manager } as never);
    });

    const created = await service.create(
      {
        code: 'FIBER',
        codePrefix: 'FIB',
        name: 'Fibra',
        description: 'Accesorios de fibra',
      } as Parameters<InventoryCategoryService['create']>[0],
      actor,
    );

    expect(created.productCount).toBe(0);
    expect(save).toHaveBeenCalledWith(
      InventoryCategory,
      expect.objectContaining({ code: 'FIBER', codePrefix: 'FIB' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.CATEGORY_CREATED,
      expect.objectContaining({
        categoryId: 'cat-002',
        actorUserId: actor.sub,
      }),
    );
  });

  it('rejects duplicate category code on create', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({ id: 'existing' }),
      };

      return work({ manager } as never);
    });

    await expect(
      service.create(
        { code: 'CPE', codePrefix: 'CPE', name: 'CPE' } as Parameters<
          InventoryCategoryService['create']
        >[0],
        actor,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects duplicate category codePrefix on create', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'existing-prefix' }),
      };

      return work({ manager } as never);
    });

    await expect(
      service.create(
        { code: 'FIBER2', codePrefix: 'FIB', name: 'Fibra 2' } as Parameters<
          InventoryCategoryService['create']
        >[0],
        actor,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('throws when category is missing on getById', async () => {
    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      return work({ manager } as never);
    });

    await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('emits status changed event when category is inactivated', async () => {
    const existing = {
      id: 'cat-001',
      tenantId: 'tenant-001',
      code: 'CPE',
      codePrefix: 'CPE',
      name: 'CPE',
      description: null,
      status: InventoryCategoryStatus.ACTIVE,
      sortOrder: 0,
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockResolvedValue({
          ...existing,
          status: InventoryCategoryStatus.INACTIVE,
        }),
        count: jest.fn().mockResolvedValue(2),
      };

      return work({ manager } as never);
    });

    await service.update('cat-001', { status: InventoryCategoryStatus.INACTIVE }, actor);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.CATEGORY_STATUS_CHANGED,
      expect.objectContaining({
        categoryId: 'cat-001',
      }),
    );
  });

  describe('suggestPrefix', () => {
    it('suggests legible unique prefix and next sort order', async () => {
      runInTenantSchemaMock.mockImplementation(async (_dataSource, _schemaName, callback) =>
        callback({
          manager: {
            find: jest.fn().mockResolvedValue([
              {
                id: 'cat-fo',
                codePrefix: 'CFO',
                sortOrder: 0,
              },
            ]),
          },
        } as never),
      );

      const result = await service.suggestPrefix({ name: 'Consumibles RD' });

      expect(result).toEqual({
        code: 'CONSUMIBLESRD',
        codePrefix: 'CRD',
        sortOrder: 1,
      });
    });
  });
});
