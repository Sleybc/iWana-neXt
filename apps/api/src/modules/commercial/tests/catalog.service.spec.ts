import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, SelectQueryBuilder } from 'typeorm';
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

/** Mock de QueryBuilder para findAll */
const buildQueryBuilderMock = (items: unknown[], total: number) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([items, total]),
});

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
    it('retorna items paginados', async () => {
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

      const result = await service.findAll({ page: 1, limit: 10 } as any);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
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
});
