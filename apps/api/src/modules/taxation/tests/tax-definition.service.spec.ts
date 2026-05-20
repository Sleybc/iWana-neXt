import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { TaxOrigin, TaxCategory, JurisdictionLevel, TaxTreatment, TaxContext } from '@iwana/shared';
import { TaxDefinitionService } from '../services/tax-definition.service';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { CreateTaxDefinitionInput } from '../dto/create-tax-definition.dto';
import { UpdateTaxDefinitionInput } from '../dto/update-tax-definition.dto';
import { ListTaxDefinitionQueryDto } from '../dto/list-tax-definition-query.dto';

// Mock TenantContext y runInTenantSchema antes de importar el servicio
jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ schemaName: 'tenant_test', tenantId: 'tid-001' }),
  },
  runInTenantSchema: jest.fn(),
}));

import { TenantContext, runInTenantSchema } from '@iwana/db';

describe('TaxDefinitionService', () => {
  let service: TaxDefinitionService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQr: any;
  let mockQb: any;

  beforeEach(() => {
    // Mock del QueryRunner con manager completo
    mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockQr = {
      manager: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      },
    };

    // runInTenantSchema ejecuta el callback pasando mockQr
    (runInTenantSchema as jest.Mock).mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: typeof mockQr) => Promise<unknown>) => fn(mockQr),
    );

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQr),
    } as unknown as jest.Mocked<DataSource>;

    service = new TaxDefinitionService(mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Factory para generar instancias de TaxDefinition consistentes en tests.
   * baseRate es string | null según el entity.
   */
  function buildTaxDef(overrides: Partial<TaxDefinition> = {}): TaxDefinition {
    return Object.assign(new TaxDefinition(), {
      id: 'def-001',
      code: 'IVA_19',
      name: 'IVA 19%',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: '19.0000',
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
      origin: TaxOrigin.CUSTOM,
      isActive: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    });
  }

  describe('create', () => {
    it('should create tax definition with valid data and force origin=CUSTOM', async () => {
      const input: CreateTaxDefinitionInput = {
        code: 'IVA_19',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        baseRate: 19.0,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.BOTH,
        isActive: true,
      };

      const expectedEntity = buildTaxDef({
        code: 'IVA_19',
        name: 'IVA 19%',
        baseRate: '19',
        origin: TaxOrigin.CUSTOM,
      });

      mockQr.manager.findOne.mockResolvedValue(null); // No existe duplicado
      mockQr.manager.create.mockReturnValue(expectedEntity);
      mockQr.manager.save.mockResolvedValue(expectedEntity);

      const result = await service.create(input);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(TaxDefinition, {
        where: { code: 'IVA_19', deletedAt: IsNull() },
      });

      // Verificar que se creó con origin=CUSTOM forzado
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        TaxDefinition,
        expect.objectContaining({
          code: 'IVA_19',
          name: 'IVA 19%',
          origin: TaxOrigin.CUSTOM,
          baseRate: '19',
        }),
      );

      expect(mockQr.manager.save).toHaveBeenCalledWith(TaxDefinition, expectedEntity);
      expect(result).toEqual(expectedEntity);
      expect(result.origin).toBe(TaxOrigin.CUSTOM);
    });

    it('should throw BadRequestException if code already exists', async () => {
      const input: CreateTaxDefinitionInput = {
        code: 'IVA_19',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        baseRate: 19.0,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.BOTH,
        isActive: true,
      };

      const existing = buildTaxDef({ code: 'IVA_19' });
      mockQr.manager.findOne.mockResolvedValue(existing);

      await expect(service.create(input)).rejects.toThrow(BadRequestException);
      await expect(service.create(input)).rejects.toThrow(
        `Ya existe una definición con código 'IVA_19'`,
      );

      expect(mockQr.manager.create).not.toHaveBeenCalled();
      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });

    it('should normalize lowercase code to uppercase before validation and persistence', async () => {
      const input: CreateTaxDefinitionInput = {
        code: 'iva_19',
        name: '  IVA 19%  ',
        category: TaxCategory.VAT,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        baseRate: 19.0,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.BOTH,
        isActive: true,
      };

      const expectedEntity = buildTaxDef({
        code: 'IVA_19',
        name: 'IVA 19%',
        baseRate: '19',
        origin: TaxOrigin.CUSTOM,
      });

      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(expectedEntity);
      mockQr.manager.save.mockResolvedValue(expectedEntity);

      const result = await service.create(input);

      expect(mockQr.manager.findOne).toHaveBeenCalledWith(TaxDefinition, {
        where: { code: 'IVA_19', deletedAt: IsNull() },
      });
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        TaxDefinition,
        expect.objectContaining({
          code: 'IVA_19',
          name: 'IVA 19%',
        }),
      );
      expect(result.code).toBe('IVA_19');
      expect(result.name).toBe('IVA 19%');
    });

    it('should throw BadRequestException if code contains invalid characters', async () => {
      const input: CreateTaxDefinitionInput = {
        code: 'IVA-19%',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        baseRate: 19.0,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.BOTH,
        isActive: true,
      };

      await expect(service.create(input)).rejects.toThrow(BadRequestException);

      expect(mockQr.manager.findOne).not.toHaveBeenCalled();
      expect(mockQr.manager.create).not.toHaveBeenCalled();
    });

    it('should force origin=CUSTOM even if caller provides different value', async () => {
      // Aunque CreateTaxDefinitionSchema no incluye origin en el input,
      // verificamos que la lógica interna siempre fuerza CUSTOM
      const input: CreateTaxDefinitionInput = {
        code: 'RETEFTE_10',
        name: 'Retención en la fuente 10%',
        category: TaxCategory.WITHHOLDING,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        baseRate: 10.0,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.BOTH,
        isActive: true,
      };

      const createdEntity = buildTaxDef({
        code: 'RETEFTE_10',
        origin: TaxOrigin.CUSTOM,
      });

      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(createdEntity);
      mockQr.manager.save.mockResolvedValue(createdEntity);

      const result = await service.create(input);

      // Verificar que el parámetro pasado a create incluye origin=CUSTOM explícitamente
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        TaxDefinition,
        expect.objectContaining({
          origin: TaxOrigin.CUSTOM,
        }),
      );

      expect(result.origin).toBe(TaxOrigin.CUSTOM);
    });
  });

  describe('update', () => {
    it('should update SYSTEM preset successfully', async () => {
      const systemEntity = buildTaxDef({
        id: 'def-system',
        origin: TaxOrigin.SYSTEM,
      });

      const updatedEntity = { ...systemEntity, name: 'Nuevo nombre' };

      mockQr.manager.findOne.mockResolvedValue(systemEntity);
      mockQr.manager.save.mockResolvedValue(updatedEntity);

      const input: UpdateTaxDefinitionInput = { name: 'Nuevo nombre' };

      const result = await service.update('def-system', input);

      expect(mockQr.manager.findOne).toHaveBeenCalledWith(TaxDefinition, {
        where: { id: 'def-system', deletedAt: IsNull() },
      });
      expect(mockQr.manager.save).toHaveBeenCalledWith(TaxDefinition, systemEntity);
      expect(result.name).toBe('Nuevo nombre');
    });

    it('should update CUSTOM entity successfully', async () => {
      const customEntity = buildTaxDef({
        id: 'def-custom',
        name: 'IVA 19%',
        origin: TaxOrigin.CUSTOM,
      });

      const updatedEntity = { ...customEntity, name: 'IVA tarifa general 19%' };

      mockQr.manager.findOne.mockResolvedValue(customEntity);
      mockQr.manager.save.mockResolvedValue(updatedEntity);

      const input: UpdateTaxDefinitionInput = { name: 'IVA tarifa general 19%' };

      const result = await service.update('def-custom', input);

      expect(mockQr.manager.findOne).toHaveBeenCalledWith(TaxDefinition, {
        where: { id: 'def-custom', deletedAt: IsNull() },
      });

      expect(customEntity.name).toBe('IVA tarifa general 19%');
      expect(mockQr.manager.save).toHaveBeenCalledWith(TaxDefinition, customEntity);
      expect(result.name).toBe('IVA tarifa general 19%');
    });

    it('should throw NotFoundException if entity does not exist', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      const input: UpdateTaxDefinitionInput = { name: 'Test' };

      await expect(service.update('def-nonexistent', input)).rejects.toThrow(NotFoundException);
      await expect(service.update('def-nonexistent', input)).rejects.toThrow(
        'TaxDefinition def-nonexistent no encontrada',
      );

      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should soft delete SYSTEM preset', async () => {
      const systemEntity = buildTaxDef({
        id: 'def-system',
        origin: TaxOrigin.SYSTEM,
        isActive: true,
        deletedAt: null,
      });

      mockQr.manager.findOne.mockResolvedValue(systemEntity);
      mockQr.manager.save.mockResolvedValue(systemEntity);

      await service.softDelete('def-system');

      expect(systemEntity.deletedAt).toBeInstanceOf(Date);
      expect(systemEntity.isActive).toBe(false);
      expect(mockQr.manager.save).toHaveBeenCalledWith(TaxDefinition, systemEntity);
    });

    it('should soft delete CUSTOM entity and set isActive=false', async () => {
      const customEntity = buildTaxDef({
        id: 'def-custom',
        origin: TaxOrigin.CUSTOM,
        isActive: true,
        deletedAt: null,
      });

      mockQr.manager.findOne.mockResolvedValue(customEntity);
      mockQr.manager.save.mockResolvedValue(customEntity);

      await service.softDelete('def-custom');

      expect(mockQr.manager.findOne).toHaveBeenCalledWith(TaxDefinition, {
        where: { id: 'def-custom', deletedAt: IsNull() },
      });

      expect(customEntity.deletedAt).toBeInstanceOf(Date);
      expect(customEntity.isActive).toBe(false);
      expect(mockQr.manager.save).toHaveBeenCalledWith(TaxDefinition, customEntity);
    });

    it('should throw NotFoundException if entity does not exist', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.softDelete('def-nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.softDelete('def-nonexistent')).rejects.toThrow(
        'TaxDefinition def-nonexistent no encontrada',
      );

      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return entity when found', async () => {
      const entity = buildTaxDef({ id: 'def-001' });

      mockQr.manager.findOne.mockResolvedValue(entity);

      const result = await service.findOne('def-001');

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(TaxDefinition, {
        where: { id: 'def-001', deletedAt: IsNull() },
      });
      expect(result).toEqual(entity);
    });

    it('should throw NotFoundException when not found', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.findOne('def-nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('def-nonexistent')).rejects.toThrow(
        'TaxDefinition def-nonexistent no encontrada',
      );
    });
  });

  describe('findAll', () => {
    it('should return empty list when no definitions found', async () => {
      mockQb.getMany.mockResolvedValue([]);

      const query: ListTaxDefinitionQueryDto = {};
      const result = await service.findAll(query);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.createQueryBuilder).toHaveBeenCalledWith(TaxDefinition, 'td');
      expect(mockQb.where).toHaveBeenCalledWith('td.deleted_at IS NULL');
      expect(mockQb.andWhere).toHaveBeenCalledWith('td.is_active = :isActive', {
        isActive: true,
      });
      expect(mockQb.orderBy).toHaveBeenCalledWith('td.code', 'ASC');
      expect(result).toEqual([]);
    });

    it('should apply filters when provided', async () => {
      const entities = [buildTaxDef(), buildTaxDef({ id: 'def-002', code: 'ICA_10' })];
      mockQb.getMany.mockResolvedValue(entities);

      const query: ListTaxDefinitionQueryDto = {
        category: TaxCategory.VAT,
        context: TaxContext.BOTH,
        origin: TaxOrigin.CUSTOM,
        isActive: true,
      };

      const result = await service.findAll(query);

      expect(mockQb.andWhere).toHaveBeenCalledWith('(td.context = :ctx OR td.context = :both)', {
        ctx: TaxContext.BOTH,
        both: 'BOTH',
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith('td.category = :cat', {
        cat: TaxCategory.VAT,
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith('td.origin = :origin', {
        origin: TaxOrigin.CUSTOM,
      });
      expect(result).toEqual(entities);
    });

    it('should include inactive when isActive=false', async () => {
      const entities = [
        buildTaxDef({ isActive: true }),
        buildTaxDef({ id: 'def-002', isActive: false }),
      ];
      mockQb.getMany.mockResolvedValue(entities);

      const query: ListTaxDefinitionQueryDto = { isActive: false };
      await service.findAll(query);

      // Cuando isActive=false, no se debe filtrar por isActive
      expect(mockQb.andWhere).not.toHaveBeenCalledWith('td.is_active = :isActive', {
        isActive: true,
      });
    });
  });
});
