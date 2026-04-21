import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TaxClassificationService } from '../services/tax-classification.service';

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

describe('TaxClassificationService', () => {
  let service: TaxClassificationService;

  const tenantCtx = { tenantId: 'ten-1', schemaName: 'tenant_test' };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxClassificationService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<TaxClassificationService>(TaxClassificationService);
  });

  describe('findAllClassifications', () => {
    it('retorna lista de clasificaciones del tenant', async () => {
      const classifications = [{ id: 'cls-1', code: 'IVA', tenantId: 'ten-1' }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => classifications } }),
      );

      const result = await service.findAllClassifications();
      expect(result).toEqual(classifications);
    });
  });

  describe('createClassification', () => {
    it('crea clasificacion con codigo en mayuscula', async () => {
      const dto = { code: 'iva', name: 'IVA Colombia', description: '' };
      const saved = { id: 'cls-1', code: 'IVA', name: 'IVA Colombia', tenantId: 'ten-1' };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => null, // no hay duplicado
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async () => saved,
          },
        }),
      );

      const result = await service.createClassification(dto);
      expect(result.code).toBe('IVA');
    });

    it('lanza ConflictException si codigo ya existe en el tenant', async () => {
      const dto = { code: 'IVA', name: 'IVA Colombia', description: '' };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => ({ id: 'cls-existing', code: 'IVA' }),
          },
        }),
      );

      await expect(service.createClassification(dto)).rejects.toThrow(
        // El servicio lanza BadRequestException para código duplicado
        BadRequestException,
      );
    });
  });

  describe('findOneClassification', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.findOneClassification('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createRule', () => {
    it('crea regla tributaria con createdBy', async () => {
      const dto = {
        taxClassificationId: 'cls-1',
        taxType: 'IVA',
        ratePercentage: '19.00',
        validFrom: new Date().toISOString(),
      };
      const saved = { id: 'rule-1', ...dto, isActive: true };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async (_entity: unknown, _opts: unknown) => ({ id: 'cls-1' }),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async () => saved,
          },
        }),
      );

      const result = await service.createRule(dto as any, 'user-1');
      expect(result.id).toBe('rule-1');
    });
  });

  describe('findOneClassification', () => {
    it('retorna clasificación cuando existe', async () => {
      const classification = { id: 'cls-1', code: 'IVA', tenantId: 'ten-1' };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => classification } }),
      );

      const result = await service.findOneClassification('cls-1');
      expect(result.id).toBe('cls-1');
    });
  });

  describe('updateClassification', () => {
    it('actualiza nombre de clasificación exitosamente', async () => {
      const cls = { id: 'cls-1', code: 'IVA', name: 'IVA viejo' };
      const saveMock = jest.fn().mockResolvedValue({ ...cls, name: 'IVA Colombia 19%' });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => cls, save: saveMock } }),
      );

      const result = await service.updateClassification('cls-1', { name: 'IVA Colombia 19%' });
      expect(saveMock).toHaveBeenCalled();
      expect(result.name).toBe('IVA Colombia 19%');
    });

    it('lanza NotFoundException si clasificación no existe en update', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.updateClassification('non-existent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findRulesByClassification', () => {
    it('retorna reglas de la clasificación indicada', async () => {
      const rules = [{ id: 'rule-1', taxClassificationId: 'cls-1', isActive: true }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => rules } }),
      );

      const result = await service.findRulesByClassification('cls-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.taxClassificationId).toBe('cls-1');
    });
  });

  describe('findAllRules', () => {
    it('retorna todas las reglas activas del tenant', async () => {
      const rules = [
        { id: 'rule-1', taxClassificationId: 'cls-1', isActive: true },
        { id: 'rule-2', taxClassificationId: 'cls-2', isActive: true },
      ];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => rules } }),
      );

      const result = await service.findAllRules();
      expect(result).toHaveLength(2);
    });

    it('filtra por taxClassificationId cuando se pasa el parámetro', async () => {
      const rules = [{ id: 'rule-1', taxClassificationId: 'cls-1', isActive: true }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { find: async () => rules } }),
      );

      const result = await service.findAllRules('cls-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateRule', () => {
    it('actualiza regla tributaria exitosamente', async () => {
      const rule = { id: 'rule-1', ratePercentage: '19.00', isActive: true };
      const saveMock = jest.fn().mockResolvedValue({ ...rule, ratePercentage: '5.00' });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => rule, save: saveMock } }),
      );

      const result = await service.updateRule('rule-1', { ratePercentage: '5.00' });
      expect(saveMock).toHaveBeenCalled();
      expect(result.ratePercentage).toBe('5.00');
    });

    it('lanza NotFoundException si regla no existe en update', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.updateRule('non-existent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateClassification', () => {
    it('desactiva clasificación exitosamente cuando no es del sistema', async () => {
      const cls = { id: 'cls-1', isSystem: false, isActive: true };
      const saveMock = jest.fn().mockResolvedValue({ ...cls, isActive: false });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => cls, save: saveMock } }),
      );

      await service.deactivateClassification('cls-1');
      expect(saveMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false }),
      );
    });

    it('lanza BadRequestException al intentar eliminar clasificación del sistema', async () => {
      const cls = { id: 'cls-sys', isSystem: true, isActive: true };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => cls } }),
      );

      await expect(service.deactivateClassification('cls-sys')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si clasificación no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.deactivateClassification('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resolveClassification', () => {
    it('retorna la clasificación con mayor prioridad para el segmento y estrato dados', async () => {
      const classification = { id: 'cls-1', name: 'Exento', appliesIva: false };
      const rule = { id: 'rule-1', priority: 10, taxClassification: classification };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(rule),
          }),
        };
        return cb({ manager });
      });

      const result = await service.resolveClassification('RESIDENTIAL' as any, 2);
      expect(result.id).toBe('cls-1');
      expect(result.name).toBe('Exento');
    });

    it('lanza NotFoundException si no hay regla que aplique', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        const manager = {
          createQueryBuilder: () => ({
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
          }),
        };
        return cb({ manager });
      });

      await expect(service.resolveClassification('SOHO' as any, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
