import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ExecutionOrderTemplate,
  ExecutionOrderTemplateVersion,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import { WfmWorkType } from '@iwana/shared';
import { ExecutionOrderTemplatesService } from '../services/execution-order-templates.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrderTemplate: class ExecutionOrderTemplate {},
  ExecutionOrderTemplateVersion: class ExecutionOrderTemplateVersion {},
  ExecutionOrderTemplateRequirement: class ExecutionOrderTemplateRequirement {},
}));

// ── Helpers ───────────────────────────────────────────────────────────

const makeTemplate = (overrides: any = {}) =>
  ({
    id: 'tpl-001',
    tenantId: 'tenant-001',
    key: 'instalacion-fibra-estandar',
    label: 'Instalación fibra estándar',
    workType: WfmWorkType.INSTALLATION,
    status: 'DRAFT',
    ...overrides,
  }) as ExecutionOrderTemplate;

const makeVersion = (overrides: any = {}) =>
  ({
    id: 'ver-001',
    tenantId: 'tenant-001',
    templateId: 'tpl-001',
    templateKey: 'instalacion-fibra-estandar',
    version: 1,
    label: 'Instalación fibra — v1',
    status: 'DRAFT',
    effectiveFrom: null,
    reasonCatalogs: null,
    publishedAt: null,
    retiredAt: null,
    requirements: [],
    ...overrides,
  }) as ExecutionOrderTemplateVersion;

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExecutionOrderTemplatesService', () => {
  let service: ExecutionOrderTemplatesService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new ExecutionOrderTemplatesService({} as DataSource);
    jest.clearAllMocks();
  });

  const setupManager = (overrides: any = {}) => ({
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((_entity, data) => data),
    createQueryBuilder: jest.fn(),
    ...overrides,
  });

  // ═══════════════════════════════════════════════════════════════════
  // listTemplates
  // ═══════════════════════════════════════════════════════════════════
  describe('listTemplates', () => {
    it('debe listar templates con filtros opcionales', async () => {
      const templates = [makeTemplate(), makeTemplate({ id: 'tpl-002', key: 'mantenimiento' })];
      const getMany = jest.fn().mockResolvedValue(templates);
      // El QB debe soportar encadenamiento: .where().orderBy().andWhere().getMany()
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany,
      };
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.listTemplates({
        workType: WfmWorkType.INSTALLATION,
        status: 'DRAFT',
      });

      expect(result).toEqual(templates);
      expect(createQueryBuilder).toHaveBeenCalledWith(ExecutionOrderTemplate, 'template');
      expect(qb.where).toHaveBeenCalledWith('template.tenantId = :tenantId', {
        tenantId: 'tenant-001',
      });
    });

    it('debe listar todos los templates sin filtros', async () => {
      const getMany = jest.fn().mockResolvedValue([]);
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany,
      };
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.listTemplates({});

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getTemplateById
  // ═══════════════════════════════════════════════════════════════════
  describe('getTemplateById', () => {
    it('debe retornar template por id', async () => {
      const template = makeTemplate();
      const findOne = jest.fn().mockResolvedValue(template);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      const result = await service.getTemplateById('tpl-001');

      expect(result).toEqual(template);
      expect(findOne).toHaveBeenCalledWith(ExecutionOrderTemplate, {
        where: { id: 'tpl-001', tenantId: 'tenant-001' },
      });
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      const findOne = jest.fn().mockResolvedValue(null);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      await expect(service.getTemplateById('tpl-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // createTemplate
  // ═══════════════════════════════════════════════════════════════════
  describe('createTemplate', () => {
    it('debe crear un template en estado DRAFT', async () => {
      const saved = makeTemplate();
      const save = jest.fn().mockResolvedValue(saved);
      const create = jest.fn().mockReturnValue(saved);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { create, save } }),
      );

      const result = await service.createTemplate({
        key: 'instalacion-fibra-estandar',
        label: 'Instalación fibra estándar',
        workType: WfmWorkType.INSTALLATION,
        requirements: [],
      });

      expect(result.status).toBe('DRAFT');
      expect(create).toHaveBeenCalledWith(
        ExecutionOrderTemplate,
        expect.objectContaining({
          key: 'instalacion-fibra-estandar',
          status: 'DRAFT',
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // listVersions / getVersionById
  // ═══════════════════════════════════════════════════════════════════
  describe('listVersions', () => {
    it('debe listar versiones de un template', async () => {
      const versions = [makeVersion(), makeVersion({ id: 'ver-002', version: 2 })];
      const getMany = jest.fn().mockResolvedValue(versions);
      const addOrderBy = jest.fn().mockReturnValue({ getMany });
      const orderBy = jest.fn().mockReturnValue({ addOrderBy });
      const andWhere = jest.fn().mockReturnValue({ orderBy });
      const where = jest.fn().mockReturnValue({ andWhere });
      const leftJoinAndSelect = jest.fn().mockReturnValue({ where });
      const createQueryBuilder = jest.fn().mockReturnValue({ leftJoinAndSelect });
      const findOne = jest.fn().mockResolvedValue(makeTemplate());

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne, createQueryBuilder } }),
      );

      const result = await service.listVersions('tpl-001');

      expect(result).toEqual(versions);
      expect(findOne).toHaveBeenCalledWith(ExecutionOrderTemplate, {
        where: { id: 'tpl-001', tenantId: 'tenant-001' },
      });
    });

    it('debe lanzar NotFoundException si el template no existe', async () => {
      const findOne = jest.fn().mockResolvedValue(null);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      await expect(service.listVersions('tpl-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVersionById', () => {
    it('debe retornar una versión por id con sus requirements', async () => {
      const version = makeVersion();
      const findOne = jest.fn().mockResolvedValue(version);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      const result = await service.getVersionById('ver-001');

      expect(result).toEqual(version);
      expect(findOne).toHaveBeenCalledWith(ExecutionOrderTemplateVersion, {
        where: { id: 'ver-001', tenantId: 'tenant-001' },
        relations: ['requirements'],
      });
    });

    it('debe lanzar NotFoundException si la versión no existe', async () => {
      const findOne = jest.fn().mockResolvedValue(null);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      await expect(service.getVersionById('ver-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // createVersion
  // ═══════════════════════════════════════════════════════════════════
  describe('createVersion', () => {
    it('debe crear una versión con número monótono', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(makeTemplate()) // template lookup (locked)
        .mockResolvedValueOnce(makeVersion({ id: 'ver-002', version: 2 })); // final lookup with relations

      const getRawOne = jest.fn().mockResolvedValue({ maxVersion: '1' });
      const andWhere = jest.fn().mockReturnValue({ getRawOne });
      const where = jest.fn().mockReturnValue({ andWhere });
      const select = jest.fn().mockReturnValue({ where });
      const createQueryBuilder = jest.fn().mockReturnValue({ select });

      const save = jest
        .fn()
        .mockResolvedValueOnce({ id: 'ver-002', version: 2, templateId: 'tpl-001' }) // version save
        .mockResolvedValueOnce([]); // requirements save

      const create = jest.fn().mockImplementation((_entity, data) => data);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne, createQueryBuilder, save, create } }),
      );

      const result = await service.createVersion('tpl-001', {
        label: 'Instalación fibra — v2',
        requirements: [],
        effectiveFrom: '2026-08-01',
      });

      expect(result.id).toBe('ver-002');
      expect(result.version).toBe(2);
      expect(findOne).toHaveBeenCalledWith(
        ExecutionOrderTemplate,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('debe crear requirements para la versión', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(makeTemplate())
        .mockResolvedValueOnce(makeVersion({ id: 'ver-003', version: 3 }));

      const getRawOne = jest.fn().mockResolvedValue({ maxVersion: '2' });
      const andWhere = jest.fn().mockReturnValue({ getRawOne });
      const where = jest.fn().mockReturnValue({ andWhere });
      const select = jest.fn().mockReturnValue({ where });
      const createQueryBuilder = jest.fn().mockReturnValue({ select });

      const save = jest
        .fn()
        .mockResolvedValueOnce({ id: 'ver-003', version: 3, templateId: 'tpl-001' })
        .mockResolvedValueOnce([]);

      const create = jest.fn().mockImplementation((_entity, data) => data);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne, createQueryBuilder, save, create } }),
      );

      const result = await service.createVersion('tpl-001', {
        label: 'Instalación fibra — v3',
        requirements: [
          {
            key: 'foto-cpe',
            label: 'Foto del CPE',
            required: true,
            kind: 'EVIDENCE',
            evidenceType: 'PHOTO',
          },
        ],
      });

      expect(result.id).toBe('ver-003');
      // Requirements should have been created
      expect(save).toHaveBeenCalledTimes(2); // once for version, once for requirements
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // publishVersion
  // ═══════════════════════════════════════════════════════════════════
  describe('publishVersion', () => {
    it('debe publicar una versión DRAFT y actualizar el template', async () => {
      const version = makeVersion({ status: 'DRAFT' });
      const template = makeTemplate({ status: 'DRAFT' });

      const findOne = jest
        .fn()
        .mockResolvedValueOnce(version) // initial version lookup
        .mockResolvedValueOnce(template) // template lookup
        .mockResolvedValueOnce({ ...version, status: 'PUBLISHED', publishedAt: new Date() }); // final lookup

      const save = jest.fn().mockImplementation(async (_entity, data) => data);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne, save } }),
      );

      const result = await service.publishVersion('ver-001');

      expect(result.status).toBe('PUBLISHED');
    });

    it('debe ser idempotente en versión ya publicada', async () => {
      const version = makeVersion({ status: 'PUBLISHED', publishedAt: new Date() });
      const findOne = jest.fn().mockResolvedValue(version);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      const result = await service.publishVersion('ver-001');

      expect(result.status).toBe('PUBLISHED');
    });

    it('debe rechazar publicación de versión RETIRED', async () => {
      const version = makeVersion({ status: 'RETIRED', retiredAt: new Date() });
      const findOne = jest.fn().mockResolvedValue(version);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      await expect(service.publishVersion('ver-001')).rejects.toThrow(ConflictException);
    });

    it('debe lanzar NotFoundException si la versión no existe', async () => {
      const findOne = jest.fn().mockResolvedValue(null);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      await expect(service.publishVersion('ver-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // retireVersion
  // ═══════════════════════════════════════════════════════════════════
  describe('retireVersion', () => {
    it('debe retirar una versión publicada', async () => {
      const version = makeVersion({ status: 'PUBLISHED' });

      const findOne = jest
        .fn()
        .mockResolvedValueOnce(version)
        .mockResolvedValueOnce({ ...version, status: 'RETIRED', retiredAt: new Date() });

      const save = jest.fn().mockImplementation(async (_entity, data) => data);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne, save } }),
      );

      const result = await service.retireVersion('ver-001');

      expect(result.status).toBe('RETIRED');
    });

    it('debe ser idempotente en versión ya retirada', async () => {
      const version = makeVersion({ status: 'RETIRED', retiredAt: new Date() });
      const findOne = jest.fn().mockResolvedValue(version);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      const result = await service.retireVersion('ver-001');

      expect(result.status).toBe('RETIRED');
    });

    it('debe lanzar NotFoundException si la versión no existe', async () => {
      const findOne = jest.fn().mockResolvedValue(null);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      await expect(service.retireVersion('ver-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getActiveVersionForWorkType
  // ═══════════════════════════════════════════════════════════════════
  describe('getActiveVersionForWorkType', () => {
    it('debe retornar la versión publicada más reciente para un workType', async () => {
      const version = makeVersion({ id: 'ver-003', version: 3, status: 'PUBLISHED' });

      const findOne = jest
        .fn()
        .mockResolvedValueOnce(makeTemplate({ status: 'PUBLISHED' })) // template
        .mockResolvedValueOnce(version); // version

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      const result = await service.getActiveVersionForWorkType(WfmWorkType.INSTALLATION);

      expect(result).toEqual(version);
    });

    it('debe retornar null si no hay template publicado', async () => {
      const findOne = jest.fn().mockResolvedValue(null);

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { findOne } }),
      );

      const result = await service.getActiveVersionForWorkType(WfmWorkType.MAINTENANCE);

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // countOrdersReferencingVersion
  // ═══════════════════════════════════════════════════════════════════
  describe('countOrdersReferencingVersion', () => {
    it('debe contar OTs que referencian una versión', async () => {
      const getRawOne = jest.fn().mockResolvedValue({ cnt: '5' });
      const andWhere = jest.fn().mockReturnValue({ getRawOne });
      const where = jest.fn().mockReturnValue({ andWhere });
      const select = jest.fn().mockReturnValue({ where });
      const createQueryBuilder = jest.fn().mockReturnValue({ select });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.countOrdersReferencingVersion('ver-001');

      expect(result).toBe(5);
    });

    it('debe retornar 0 si no hay OTs', async () => {
      const getRawOne = jest.fn().mockResolvedValue({ cnt: '0' });
      const andWhere = jest.fn().mockReturnValue({ getRawOne });
      const where = jest.fn().mockReturnValue({ andWhere });
      const select = jest.fn().mockReturnValue({ where });
      const createQueryBuilder = jest.fn().mockReturnValue({ select });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.countOrdersReferencingVersion('ver-002');

      expect(result).toBe(0);
    });

    it('debe manejar resultado null', async () => {
      const getRawOne = jest.fn().mockResolvedValue(null);
      const andWhere = jest.fn().mockReturnValue({ getRawOne });
      const where = jest.fn().mockReturnValue({ andWhere });
      const select = jest.fn().mockReturnValue({ where });
      const createQueryBuilder = jest.fn().mockReturnValue({ select });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.countOrdersReferencingVersion('ver-003');

      expect(result).toBe(0);
    });
  });
});
