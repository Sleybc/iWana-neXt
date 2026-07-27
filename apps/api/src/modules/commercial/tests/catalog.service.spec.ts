import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CatalogService } from '../services/catalog.service';
import { CatalogItemType } from '@iwana/shared';

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

/** Mock de QueryBuilder para findAll cursor/page */
const buildQueryBuilderMock = (items: unknown[], total: number) => {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    clone: jest.fn(),
    getCount: jest.fn().mockResolvedValue(total),
    getMany: jest.fn().mockResolvedValue(items),
  };
  qb.clone.mockReturnValue(qb);
  return qb;
};

describe('CatalogService', () => {
  let service: CatalogService;
  const mockEventEmitter = { emit: jest.fn() };
  const tenantCtx = { tenantId: 'ten-1', schemaName: 'tenant_test' };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('findAll', () => {
    it('retorna items paginados con meta.nextCursor y total', async () => {
      const items = [{ id: 'item-1', name: 'Plan Básico', type: CatalogItemType.PLAN }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => buildQueryBuilderMock(items, 1),
            findOne: async (entity: { name?: string }) => {
              if (entity?.name === 'PlanDetail') {
                return {
                  itemId: 'item-1',
                  downloadSpeedMbps: 100,
                  uploadSpeedMbps: 100,
                  technology: 'FTTH',
                  installationRule: 'ALWAYS',
                };
              }

              return {
                itemId: 'item-1',
                basePrice: '89900.00',
                installationFee: '0.00',
              };
            },
          },
        }),
      );

      const result = await service.findAll({ limit: 10 } as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.mode).toBe('cursor');
      expect(result.meta.capabilities.randomAccess).toBe(true);
    });

    it('modo page emite ListMeta offset', async () => {
      const items = [{ id: 'item-1', name: 'Plan Básico', type: CatalogItemType.PLAN }];
      const qb = buildQueryBuilderMock(items, 42);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => ({
              downloadSpeedMbps: 100,
              uploadSpeedMbps: 100,
              technology: 'FTTH',
              installationRule: 'ALWAYS',
              basePrice: '1000.00',
              installationFee: '0.00',
            }),
          },
        }),
      );

      const result = await service.findAll({ page: 2, limit: 10 } as any);
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.meta).toMatchObject({
        mode: 'page',
        page: 2,
        limit: 10,
        total: 42,
        totalPages: 5,
        hasMore: true,
      });
    });

    it('rechaza page+cursor juntos', async () => {
      await expect(service.findAll({ page: 1, cursor: 'abc', limit: 10 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('indica nextCursor cuando hay más ítems que el limit', async () => {
      const items = [
        { id: 'item-1', name: 'Plan A', type: CatalogItemType.PLAN },
        { id: 'item-2', name: 'Plan B', type: CatalogItemType.PLAN },
        { id: 'item-3', name: 'Plan C', type: CatalogItemType.PLAN },
      ];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => buildQueryBuilderMock(items, 3),
            findOne: async () => ({
              downloadSpeedMbps: 100,
              uploadSpeedMbps: 100,
              technology: 'FTTH',
              installationRule: 'ALWAYS',
              basePrice: '1000.00',
              installationFee: '0.00',
            }),
          },
        }),
      );

      const result = await service.findAll({ limit: 2 } as any);
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(3);
      expect(result.meta.nextCursor).toBeTruthy();
    });

    it('aplica default limit 20 cuando se omite', async () => {
      const qb = buildQueryBuilderMock([], 0);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({} as any);
      expect(qb.take).toHaveBeenCalledWith(21); // limit+1
    });

    it('aplica missingPrice con NOT EXISTS de precio vigente RESIDENTIAL', async () => {
      const qb = buildQueryBuilderMock([], 0);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({ missingPrice: true } as any);
      expect(qb.andWhere).toHaveBeenCalledWith('ci.is_active = true');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('NOT EXISTS'),
        expect.objectContaining({ missingPriceSegment: 'RESIDENTIAL' }),
      );
    });

    it('aplica category y model con join a product_details', async () => {
      const qb = buildQueryBuilderMock([], 0);
      (qb as any).innerJoin = jest.fn().mockReturnThis();
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({
        category: 'NETWORKING',
        model: 'LOAN',
      } as any);

      expect((qb as any).innerJoin).toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledWith('pd.category = :productCategory', {
        productCategory: 'NETWORKING',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('pd.is_loan = true');
    });

    it('aplica charge con join a service_details', async () => {
      const qb = buildQueryBuilderMock([], 0);
      (qb as any).innerJoin = jest.fn().mockReturnValue(qb);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({ charge: 'RECURRING' } as any);
      expect((qb as any).innerJoin).toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledWith('sd.charge_type = :chargeType', {
        chargeType: 'RECURRING',
      });
    });

    it('sort ACTIVE_NAME ordena is_active DESC + name ASC', async () => {
      const qb = buildQueryBuilderMock([], 0);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({ sort: 'ACTIVE_NAME' } as any);
      expect(qb.orderBy).toHaveBeenCalledWith('ci.is_active', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('ci.name', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('ci.id', 'ASC');
    });

    it('sort RECENTLY_UPDATED ordena updated_at DESC', async () => {
      const qb = buildQueryBuilderMock([], 0);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({ sort: 'RECENTLY_UPDATED' } as any);
      expect(qb.orderBy).toHaveBeenCalledWith('ci.updated_at', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('ci.id', 'DESC');
    });

    it('sort CATEGORY_NAME hace leftJoin product_details y ordena por rank', async () => {
      const qb = buildQueryBuilderMock([], 0);
      (qb as any).leftJoin = jest.fn().mockReturnThis();
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            findOne: async () => null,
          },
        }),
      );

      await service.findAll({ sort: 'CATEGORY_NAME' } as any);
      expect((qb as any).leftJoin).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith(expect.stringContaining('CASE'), 'ASC');
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si ítem no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea un plan con detalle de velocidades', async () => {
      const dto = {
        type: CatalogItemType.PLAN,
        name: 'Plan Fibra 100MB',
        downloadSpeedMbps: 100,
        uploadSpeedMbps: 20,
        technology: 'FIBER',
        installationRule: 'FIRST_MONTH_FREE',
      };
      const savedDetail = { id: 'det-1', itemId: 'item-1', downloadSpeedMbps: 100 };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            // create devuelve el objeto con id simulado
            create: (_entity: unknown, data: Record<string, unknown>) => ({
              ...data,
              id: 'item-1',
            }),
            save: jest.fn().mockResolvedValueOnce(savedDetail),
            findOne: async (entity: { name?: string }) => {
              if (entity?.name === 'PlanDetail') {
                return savedDetail;
              }

              return {
                itemId: 'item-1',
                basePrice: '0.00',
                installationFee: '0.00',
              };
            },
          },
        }),
      );

      const result = await service.create(dto as any);
      expect(result.id).toBe('item-1');
    });

    it('lanza BadRequestException si tipo PLAN no incluye velocidades', async () => {
      const dto = {
        type: CatalogItemType.PLAN,
        name: 'Plan incompleto',
        // sin downloadSpeedMbps
      };

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea un producto con categoria y flags correctos', async () => {
      const dto = {
        type: CatalogItemType.PRODUCT,
        name: 'Router WiFi 6',
        category: 'NETWORKING',
        isLoan: true,
        requiresInventory: true,
      };
      const savedItem = { id: 'item-2', type: CatalogItemType.PRODUCT, name: dto.name };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_entity: unknown, data: Record<string, unknown>) => ({
              ...data,
              id: 'item-2',
            }),
            save: jest.fn().mockResolvedValue(savedItem),
            findOne: async () => null,
          },
        }),
      );

      const result = await service.create(dto as any);
      expect(result.id).toBe('item-2');
    });

    it('lanza BadRequestException si tipo PRODUCT no incluye category', async () => {
      const dto = { type: CatalogItemType.PRODUCT, name: 'Producto sin categoría' };
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea un servicio adicional con chargeType', async () => {
      const dto = {
        type: CatalogItemType.SERVICE,
        name: 'IP Pública',
        chargeType: 'RECURRING',
      };
      const savedItem = { id: 'item-3', type: CatalogItemType.SERVICE, name: dto.name };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_entity: unknown, data: Record<string, unknown>) => ({
              ...data,
              id: 'item-3',
            }),
            save: jest.fn().mockResolvedValue(savedItem),
            findOne: async () => null,
          },
        }),
      );

      const result = await service.create(dto as any);
      expect(result.id).toBe('item-3');
    });

    it('lanza BadRequestException si tipo SERVICE no incluye chargeType', async () => {
      const dto = { type: CatalogItemType.SERVICE, name: 'Servicio sin tipo' };
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('retorna ítem hidratado con detalle de plan cuando existe', async () => {
      const item = {
        id: 'item-1',
        type: CatalogItemType.PLAN,
        name: 'Plan 100MB',
        tenantId: 'ten-1',
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (entity: { name?: string }, _opts: unknown) => {
              if ((entity as { name?: string })?.name === 'PlanDetail') {
                return {
                  itemId: 'item-1',
                  downloadSpeedMbps: 100,
                  uploadSpeedMbps: 20,
                  technology: 'FTTH',
                  installationRule: 'ALWAYS',
                };
              }
              if ((entity as { name?: string })?.name === 'CatalogPriceHistory') {
                return { basePrice: '89900.00', installationFee: '0.00' };
              }
              return item;
            },
          },
        }),
      );

      const result = await service.findOne('item-1');
      expect(result.id).toBe('item-1');
    });

    it('retorna ítem SERVICE hidratado con precio vigente cuando existe', async () => {
      const item = {
        id: 'item-service-1',
        type: CatalogItemType.SERVICE,
        name: 'IP Pública fija',
        tenantId: 'ten-1',
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (entity: { name?: string }, _opts: unknown) => {
              if ((entity as { name?: string })?.name === 'ServiceDetail') {
                return { itemId: 'item-service-1', chargeType: 'RECURRING' };
              }
              if ((entity as { name?: string })?.name === 'CatalogPriceHistory') {
                return { basePrice: '25000.00', installationFee: '5000.00' };
              }
              return item;
            },
          },
        }),
      );

      const result = await service.findOne('item-service-1');
      expect(result.id).toBe('item-service-1');
      expect(result.chargeType).toBe('RECURRING');
      expect(result.currentPrice).toBe('25000.00');
      expect(result.installationFee).toBe('5000.00');
    });
  });

  describe('update', () => {
    it('actualiza un plan y retorna ítem hidratado', async () => {
      const item = {
        id: 'item-1',
        type: CatalogItemType.PLAN,
        name: 'Plan viejo',
        isActive: true,
        tenantId: 'ten-1',
      };
      const updateMock = jest.fn().mockResolvedValue({ affected: 1 });
      const saveMock = jest.fn().mockResolvedValue(item);

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (entity: { name?: string }, _opts: unknown) => {
              if ((entity as { name?: string })?.name === 'PlanDetail') {
                return {
                  itemId: 'item-1',
                  downloadSpeedMbps: 100,
                  technology: 'FTTH',
                  installationRule: 'ALWAYS',
                };
              }
              if ((entity as { name?: string })?.name === 'CatalogPriceHistory') {
                return { basePrice: '89900.00', installationFee: '0.00' };
              }
              return item;
            },
            save: saveMock,
            update: updateMock,
          },
        }),
      );

      const result = await service.update('item-1', {
        name: 'Plan nuevo',
        downloadSpeedMbps: 200,
      } as any);
      expect(saveMock).toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('actualiza un producto y llama update en ProductDetail', async () => {
      const item = {
        id: 'item-2',
        type: CatalogItemType.PRODUCT,
        name: 'Router',
        isActive: true,
        tenantId: 'ten-1',
      };
      const updateMock = jest.fn().mockResolvedValue({ affected: 1 });
      const saveMock = jest.fn().mockResolvedValue(item);

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (entity: { name?: string }, _opts: unknown) => {
              if ((entity as { name?: string })?.name === 'ProductDetail') {
                return { itemId: 'item-2', isLoan: false, category: 'NETWORKING' };
              }
              if ((entity as { name?: string })?.name === 'CatalogPriceHistory') {
                return null;
              }
              return item;
            },
            save: saveMock,
            update: updateMock,
          },
        }),
      );

      await service.update('item-2', { isLoan: true, category: 'CPE' } as any);
      expect(updateMock).toHaveBeenCalled();
    });

    it('actualiza un servicio y llama update en ServiceDetail', async () => {
      const item = {
        id: 'item-3',
        type: CatalogItemType.SERVICE,
        name: 'IP Pública',
        isActive: true,
        tenantId: 'ten-1',
      };
      const updateMock = jest.fn().mockResolvedValue({ affected: 1 });
      const saveMock = jest.fn().mockResolvedValue(item);

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (entity: { name?: string }, _opts: unknown) => {
              if ((entity as { name?: string })?.name === 'ServiceDetail') {
                return { itemId: 'item-3', chargeType: 'RECURRING' };
              }
              if ((entity as { name?: string })?.name === 'CatalogPriceHistory') {
                return null;
              }
              return item;
            },
            save: saveMock,
            update: updateMock,
          },
        }),
      );

      await service.update('item-3', { chargeType: 'ON_DEMAND' } as any);
      expect(updateMock).toHaveBeenCalled();
    });

    it('emite evento ITEM_DEACTIVATED cuando isActive cambia de true a false', async () => {
      const item = {
        id: 'item-1',
        type: CatalogItemType.PLAN,
        name: 'Plan A',
        isActive: true,
        tenantId: 'ten-1',
      };
      const saveMock = jest.fn().mockResolvedValue({ ...item, isActive: false });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (entity: { name?: string }, _opts: unknown) => {
              if ((entity as { name?: string })?.name === 'PlanDetail') {
                return {
                  itemId: 'item-1',
                  downloadSpeedMbps: 100,
                  technology: 'FTTH',
                  installationRule: 'ALWAYS',
                };
              }
              if ((entity as { name?: string })?.name === 'CatalogPriceHistory') {
                return null;
              }
              return item;
            },
            save: saveMock,
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        }),
      );

      await service.update('item-1', { isActive: false } as any);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining('deactivated'),
        expect.objectContaining({ itemId: 'item-1' }),
      );
    });

    it('lanza NotFoundException si ítem no existe en update', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.update('non-existent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-delete: setea deletedAt e isActive=false', async () => {
      const item = { id: 'item-1', isActive: true, deletedAt: null };
      const saveMock = jest
        .fn()
        .mockResolvedValue({ ...item, isActive: false, deletedAt: expect.any(Date) });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => item,
            save: saveMock,
          },
        }),
      );

      await service.remove('item-1');
      // TypeORM QueryRunner: save se llama con (EntityClass, data)
      expect(saveMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false }),
      );
    });

    it('lanza NotFoundException si ítem no existe en remove', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchForPicker', () => {
    it('retorna vacío si q está en blanco', async () => {
      mockRunInTenantSchema.mockClear();
      const result = await service.searchForPicker({
        type: CatalogItemType.PLAN,
        q: '',
      });
      expect(result).toEqual({ data: [], total: 0 });
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('busca planes activos y mapea label/sublabel', async () => {
      const items = [
        {
          id: 'plan-1',
          name: 'Plan fibra 200',
          isActive: true,
          type: CatalogItemType.PLAN,
        },
      ];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => buildQueryBuilderMock(items, 3),
          },
        }),
      );

      const result = await service.searchForPicker({
        type: CatalogItemType.PLAN,
        q: 'fibra',
        limit: 20,
      });

      expect(result.total).toBe(3);
      expect(result.data).toEqual([{ id: 'plan-1', label: 'Plan fibra 200', sublabel: 'Activo' }]);
    });
  });
});
