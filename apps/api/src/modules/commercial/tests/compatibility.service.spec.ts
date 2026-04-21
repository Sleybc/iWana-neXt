import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CompatibilityService } from '../services/compatibility.service';
import { CompatibilityRuleType } from '@iwana/shared';

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

describe('CompatibilityService', () => {
  let service: CompatibilityService;
  const tenantCtx = { tenantId: 'ten-1', schemaName: 'tenant_test' };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompatibilityService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<CompatibilityService>(CompatibilityService);
  });

  describe('create', () => {
    it('lanza BadRequestException si source igual a target', async () => {
      const dto = {
        ruleType: CompatibilityRuleType.EXCLUDES,
        sourceItemId: 'same-id',
        targetItemId: 'same-id',
      };

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea regla válida', async () => {
      const dto = {
        ruleType: CompatibilityRuleType.EXCLUDES,
        sourceItemId: 'item-a',
        targetItemId: 'item-b',
      };
      const saved = { id: 'rule-1', ...dto, isActive: true };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async () => saved,
          },
        }),
      );

      const result = await service.create(dto as any);
      expect(result.id).toBe('rule-1');
    });
  });

  describe('validateCombination', () => {
    it('REQUIRES: retorna error si target requerido está ausente', async () => {
      const rules = [
        {
          id: 'rule-1',
          ruleType: CompatibilityRuleType.REQUIRES,
          sourceItemId: 'item-a',
          targetItemId: 'item-b', // item-b NO está en la combinación
          isActive: true,
        },
      ];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue(rules),
          }),
        };
        return cb({ manager });
      });

      const result = await service.validateCombination(['item-a']); // item-b ausente
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('EXCLUDES: retorna error si ambos items están presentes', async () => {
      const rules = [
        {
          id: 'rule-2',
          ruleType: CompatibilityRuleType.EXCLUDES,
          sourceItemId: 'item-a',
          targetItemId: 'item-b',
          isActive: true,
        },
      ];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue(rules),
          }),
        };
        return cb({ manager });
      });

      const result = await service.validateCombination(['item-a', 'item-b']);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('REPLACES: retorna warning si ambos items están presentes', async () => {
      const rules = [
        {
          id: 'rule-3',
          ruleType: CompatibilityRuleType.REPLACES,
          sourceItemId: 'item-a',
          targetItemId: 'item-b',
          isActive: true,
        },
      ];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue(rules),
          }),
        };
        return cb({ manager });
      });

      const result = await service.validateCombination(['item-a', 'item-b']);
      expect(result.valid).toBe(true); // warnings no bloquean
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('retorna valid=true si no hay conflictos', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
          }),
        };
        return cb({ manager });
      });

      const result = await service.validateCombination(['item-a', 'item-b']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('findAll', () => {
    it('retorna lista de reglas activas del tenant', async () => {
      const rules = [{ id: 'rule-1', ruleType: CompatibilityRuleType.EXCLUDES, isActive: true }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => rules } }),
      );

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('rule-1');
    });
  });

  describe('deactivate', () => {
    it('desactiva regla exitosamente', async () => {
      const rule = { id: 'rule-1', isActive: true };
      const saveMock = jest.fn().mockResolvedValue({ ...rule, isActive: false });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => rule, save: saveMock } }),
      );

      await service.deactivate('rule-1');
      expect(saveMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false }),
      );
    });

    it('lanza NotFoundException si regla no existe en deactivate', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.deactivate('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza nota y efectividad de regla existente', async () => {
      const rule = { id: 'rule-1', isActive: true, note: null, effectiveFrom: null };
      const saveMock = jest.fn().mockResolvedValue({ ...rule, note: 'Actualizado' });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => rule, save: saveMock } }),
      );

      const result = await service.update('rule-1', { note: 'Actualizado' });
      expect(saveMock).toHaveBeenCalled();
      expect(result.note).toBe('Actualizado');
    });

    it('lanza NotFoundException si regla no existe en update', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.update('non-existent', { note: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getReplacementFor', () => {
    it('retorna null cuando no hay regla REPLACES activa para el ítem', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
          }),
        };
        return cb({ manager });
      });

      const result = await service.getReplacementFor('item-old');
      expect(result).toBeNull();
    });

    it('retorna datos del sucesor cuando existe regla REPLACES activa', async () => {
      const rule = {
        id: 'rule-1',
        targetItemId: 'item-new',
        targetItem: { name: 'Plan Nuevo 100Mb' },
        effectiveFrom: new Date('2025-01-01'),
        note: 'Velocidad actualizada',
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(rule),
          }),
        };
        return cb({ manager });
      });

      const result = await service.getReplacementFor('item-old');
      expect(result).not.toBeNull();
      expect(result?.targetItemId).toBe('item-new');
      expect(result?.targetItemName).toBe('Plan Nuevo 100Mb');
      expect(result?.note).toBe('Velocidad actualizada');
    });
  });
});
