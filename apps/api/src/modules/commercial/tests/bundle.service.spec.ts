import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BundleService } from '../services/bundle.service';
import { CustomerSegment, DiscountType } from '@iwana/shared';

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

describe('BundleService', () => {
  let service: BundleService;
  const mockEventEmitter = { emit: jest.fn() };
  const tenantCtx = { tenantId: 'ten-1', schemaName: 'tenant_test' };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BundleService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<BundleService>(BundleService);
  });

  describe('create', () => {
    it('lanza BadRequestException si menos de 2 ítems', async () => {
      const dto = {
        name: 'Bundle Inválido',
        itemIds: ['item-1'],
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10',
        validFrom: new Date().toISOString(),
      };

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si algun item no está activo', async () => {
      const dto = {
        name: 'Bundle Parcial',
        itemIds: ['item-1', 'item-2'],
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10',
        validFrom: new Date().toISOString(),
      };

      // Solo retorna un ítem activo (en vez de dos)
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            // bundle.service usa createQueryBuilder para verificar ítems activos
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              // Solo devuelve 1 de 2 ítems solicitados
              getMany: jest.fn().mockResolvedValue([{ id: 'item-1', isActive: true }]),
            }),
          },
        }),
      );

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea bundle exitosamente con 2 ítems activos', async () => {
      const dto = {
        name: 'Triple Play',
        itemIds: ['item-1', 'item-2'],
        discountType: DiscountType.PERCENTAGE,
        discountValue: '15',
        validFrom: new Date().toISOString(),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([
                { id: 'item-1', isActive: true },
                { id: 'item-2', isActive: true },
              ]),
            }),
            // create retorna el objeto con id pre-asignado (simula autoincrement de TypeORM)
            create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data, id: 'bun-1' }),
            save: jest.fn().mockResolvedValue({ id: 'bun-1', name: 'Triple Play', isActive: true }),
          },
        }),
      );

      const result = await service.create(dto as any);
      expect(result.id).toBe('bun-1');
    });
  });

  describe('findAll', () => {
    it('retorna lista de bundles activos con itemCount', async () => {
      const bundles = [{ id: 'bun-1', name: 'Bundle A', isActive: true }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              leftJoin: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getRawAndEntities: jest.fn().mockResolvedValue({
                entities: bundles,
                raw: [{ itemCount: '3' }],
              }),
            }),
          },
        }),
      );

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('bun-1');
      expect(result[0]?.itemCount).toBe(3);
    });
  });

  describe('findOne', () => {
    it('retorna bundle con sus ítems cuando existe', async () => {
      const bundle = { id: 'bun-1', name: 'Bundle A', tenantId: 'ten-1' };
      const bundleItems = [{ bundleId: 'bun-1', itemId: 'item-1', isRequired: true, sortOrder: 0 }];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => bundle,
            find: async () => bundleItems,
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([{ id: 'item-1', name: 'Plan 100MB' }]),
            }),
          },
        }),
      );

      const result = await service.findOne('bun-1');
      expect(result.id).toBe('bun-1');
      expect(result.items).toHaveLength(1);
    });

    it('lanza NotFoundException si bundle no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza nombre del bundle exitosamente', async () => {
      const bundle = { id: 'bun-1', name: 'Bundle viejo', isActive: true };
      const saveMock = jest.fn().mockResolvedValue({ ...bundle, name: 'Bundle nuevo' });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => bundle, save: saveMock } }),
      );

      const result = await service.update('bun-1', { name: 'Bundle nuevo' } as any);
      expect(saveMock).toHaveBeenCalled();
      expect(result.name).toBe('Bundle nuevo');
    });

    it('lanza NotFoundException si bundle no existe en update', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.update('non-existent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('desactiva bundle exitosamente', async () => {
      const bundle = { id: 'bun-1', isActive: true, validTo: null };
      const saveMock = jest.fn().mockResolvedValue({ ...bundle, isActive: false });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => bundle, save: saveMock } }),
      );

      await service.deactivate('bun-1');
      expect(saveMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false }),
      );
    });

    it('lanza NotFoundException si bundle no existe en deactivate', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.deactivate('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('calculatePrice', () => {
    it('aplica descuento por porcentaje correctamente', async () => {
      const bundle = {
        id: 'bun-1',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '20',
        tenantId: 'ten-1',
      };

      const bundleItemRows = [
        { itemId: 'item-1', isRequired: true },
        { itemId: 'item-2', isRequired: true },
      ];

      // Precios raw: 50000 + 10000 = 60000 - 20% = 48000
      const rawPrices = [
        { item_id: 'item-1', base_price: '50000.00', name: 'Plan A' },
        { item_id: 'item-2', base_price: '10000.00', name: 'Servicio B' },
      ];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          findOne: async () => bundle,
          find: async () => bundleItemRows,
          createQueryBuilder: () => ({
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(rawPrices),
          }),
        };
        return cb({ manager });
      });

      const result = await service.calculatePrice('bun-1', CustomerSegment.RESIDENTIAL, []);
      expect(parseFloat(result.total)).toBe(48000);
      expect(parseFloat(result.discount)).toBe(12000);
    });

    it('lanza NotFoundException si bundle no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(
        service.calculatePrice('non-existent', CustomerSegment.RESIDENTIAL, []),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
