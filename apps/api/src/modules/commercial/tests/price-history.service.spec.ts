import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PriceHistoryService } from '../services/price-history.service';
import { CustomerSegment } from '@iwana/shared';

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

describe('PriceHistoryService', () => {
  let service: PriceHistoryService;
  const mockEventEmitter = { emit: jest.fn() };
  const tenantCtx = { tenantId: 'ten-1', schemaName: 'tenant_test' };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceHistoryService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PriceHistoryService>(PriceHistoryService);
  });

  describe('getCurrentPrice', () => {
    it('retorna precio vigente para el segmento', async () => {
      const price = { id: 'pr-1', basePrice: '49900.00', isCurrent: true };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => price } }),
      );

      const result = await service.getCurrentPrice('item-1', CustomerSegment.RESIDENTIAL);
      expect(result.basePrice).toBe('49900.00');
    });

    it('lanza NotFoundException si no hay precio vigente', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.getCurrentPrice('item-1', CustomerSegment.RESIDENTIAL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('retorna precios distintos para RESIDENTIAL y SOHO del mismo ítem', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (
              _entity: unknown,
              options?: { where?: { customerSegment?: CustomerSegment } },
            ) => {
              const segment = options?.where?.customerSegment;
              if (segment === CustomerSegment.RESIDENTIAL) {
                return {
                  id: 'pr-res',
                  basePrice: '89900.00',
                  isCurrent: true,
                  customerSegment: segment,
                };
              }
              if (segment === CustomerSegment.SOHO) {
                return {
                  id: 'pr-soho',
                  basePrice: '129900.00',
                  isCurrent: true,
                  customerSegment: segment,
                };
              }
              return null;
            },
          },
        }),
      );

      const residential = await service.getCurrentPrice('item-1', CustomerSegment.RESIDENTIAL);
      const soho = await service.getCurrentPrice('item-1', CustomerSegment.SOHO);
      expect(residential.basePrice).toBe('89900.00');
      expect(soho.basePrice).toBe('129900.00');
      expect(residential.basePrice).not.toBe(soho.basePrice);
    });
  });

  describe('createPrice — SCD Tipo 2', () => {
    it('cierra precio anterior y crea uno nuevo de forma atómica', async () => {
      const existing = { id: 'pr-old', basePrice: '40000.00', isCurrent: true, validTo: null };
      const newPrice = { id: 'pr-new', basePrice: '49900.00', isCurrent: true };
      const saveMock = jest
        .fn()
        .mockResolvedValueOnce({ ...existing, isCurrent: false }) // cierre del anterior
        .mockResolvedValueOnce(newPrice); // nuevo precio

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(existing),
            }),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: saveMock,
          },
        }),
      );

      const dto = {
        customerSegment: CustomerSegment.RESIDENTIAL,
        basePrice: '49900.00',
        installationFee: '0',
      };
      const result = await service.createPrice('item-1', dto as any, 'user-1');

      expect(saveMock).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter.emit).toHaveBeenCalled();
      expect(result.basePrice).toBe('49900.00');
    });

    it('lanza ConflictException si el precio es identico al vigente', async () => {
      const existing = {
        id: 'pr-old',
        basePrice: '49900.00',
        installationFee: '0', // mismo valor que dto para que la comparación sea estricta
        isCurrent: true,
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(existing),
            }),
          },
        }),
      );

      const dto = {
        customerSegment: CustomerSegment.RESIDENTIAL,
        basePrice: '49900.00',
        installationFee: '0',
      };

      await expect(service.createPrice('item-1', dto as any, 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('trata 49900.00 y 49900.0 como el mismo precio vigente', async () => {
      const existing = {
        id: 'pr-old',
        basePrice: '49900.00',
        installationFee: '0.00',
        isCurrent: true,
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(existing),
            }),
          },
        }),
      );

      await expect(
        service.createPrice(
          'item-1',
          {
            customerSegment: CustomerSegment.RESIDENTIAL,
            basePrice: '49900.0',
            installationFee: '0',
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('crea primer precio sin necesidad de cerrar anterior', async () => {
      const newPrice = { id: 'pr-new', basePrice: '49900.00', isCurrent: true };
      const saveMock = jest.fn().mockResolvedValue(newPrice);

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            }),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: saveMock,
          },
        }),
      );

      const dto = {
        customerSegment: CustomerSegment.RESIDENTIAL,
        basePrice: '49900.00',
        installationFee: '0',
      };
      const result = await service.createPrice('item-1', dto as any, 'user-1');

      // Solo 1 save (el nuevo precio, sin cerrar anterior)
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalled();
      expect(result.basePrice).toBe('49900.00');
    });
  });

  describe('getPriceHistory', () => {
    it('retorna historial de precios ordenado para un ítem', async () => {
      const prices = [
        { id: 'pr-1', basePrice: '39900.00', isCurrent: false, validTo: new Date('2024-01-01') },
        { id: 'pr-2', basePrice: '49900.00', isCurrent: true, validTo: null },
      ];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => prices } }),
      );

      const result = await service.getPriceHistory('item-1');
      expect(result).toHaveLength(2);
      expect(result[1]?.isCurrent).toBe(true);
    });
  });
});
