import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PromotionService } from '../services/promotion.service';

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

describe('PromotionService', () => {
  let service: PromotionService;
  const mockEventEmitter = { emit: jest.fn() };
  const tenantCtx = { tenantId: 'ten-1', schemaName: 'tenant_test' };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PromotionService>(PromotionService);
  });

  describe('create', () => {
    it('lanza ConflictException si código ya existe en el tenant', async () => {
      const dto = {
        code: 'PROMO10',
        discountType: 'PERCENTAGE',
        discountValue: '10',
        appliesTo: 'ALL',
        validFrom: new Date().toISOString(),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => ({ id: 'promo-existing', code: 'PROMO10' }) } }),
      );

      await expect(service.create(dto as any, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('crea promoción y emite evento PROMOTION_STARTED', async () => {
      const dto = {
        code: 'SUMMER20',
        discountType: 'PERCENTAGE',
        discountValue: '20',
        appliesTo: 'ALL',
        validFrom: new Date().toISOString(),
      };
      const saved = { id: 'promo-1', ...dto, isActive: true, currentUses: 0 };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => null, // sin duplicado
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async () => saved,
          },
        }),
      );

      const result = await service.create(dto as any, 'user-1');
      expect(result.id).toBe('promo-1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ promotionId: 'promo-1' }),
      );
    });
  });

  describe('incrementUse', () => {
    it('desactiva la promoción cuando alcanza maxUses y emite PROMOTION_EXPIRED', async () => {
      const promo = {
        id: 'promo-1',
        code: 'LIMITADA',
        isActive: true,
        currentUses: 4,
        maxUses: 5,
        validFrom: new Date(Date.now() - 3600_000).toISOString(),
        validTo: new Date(Date.now() + 3600_000).toISOString(),
      };
      const saveMock = jest.fn().mockResolvedValue({ ...promo, currentUses: 5, isActive: false });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => promo,
            save: saveMock,
          },
        }),
      );

      await service.incrementUse('promo-1');
      expect(saveMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ currentUses: 5, isActive: false }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining('expired'),
        expect.any(Object),
      );
    });

    it('lanza BadRequestException si promoción ya caducó', async () => {
      const promo = {
        id: 'promo-1',
        isActive: true,
        currentUses: 0,
        maxUses: null,
        validFrom: new Date(Date.now() - 7200_000), // Date, no string
        validTo: new Date(Date.now() - 3600_000), // ya caducó — Date para comparación correcta
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => promo } }),
      );

      await expect(service.incrementUse('promo-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('retorna lista de promociones activas del tenant', async () => {
      const promos = [{ id: 'promo-1', code: 'BIENVENIDA', isActive: true }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => promos } }),
      );

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('BIENVENIDA');
    });
  });

  describe('findOne', () => {
    it('retorna promoción cuando existe', async () => {
      const promo = { id: 'promo-1', code: 'BIENVENIDA', isActive: true };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => promo } }),
      );

      const result = await service.findOne('promo-1');
      expect(result.id).toBe('promo-1');
    });

    it('lanza NotFoundException si promoción no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza campos de la promoción exitosamente', async () => {
      const promo = { id: 'promo-1', name: 'Promo antigua', isActive: true };
      const saveMock = jest.fn().mockResolvedValue({ ...promo, name: 'Promo actualizada' });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => promo, save: saveMock } }),
      );

      const result = await service.update('promo-1', { name: 'Promo actualizada' } as any);
      expect(saveMock).toHaveBeenCalled();
      expect(result.name).toBe('Promo actualizada');
    });

    it('lanza NotFoundException si promoción no existe en update', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.update('non-existent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('desactiva promoción exitosamente', async () => {
      const promo = { id: 'promo-1', isActive: true, validTo: null };
      const saveMock = jest.fn().mockResolvedValue({ ...promo, isActive: false });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => promo, save: saveMock } }),
      );

      await service.deactivate('promo-1');
      expect(saveMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false }),
      );
    });

    it('lanza NotFoundException si promoción no existe en deactivate', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.deactivate('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
