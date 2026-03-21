import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Tenant } from '@iwana/db';
import { CompanyType, TenantStatus } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { TenantService } from './tenant.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

/**
 * Tests unitarios para TenantService.
 * Cubre CRUD completo, validacion de unicidad y derivacion de schema_name.
 *
 * testing-patterns skill — Jest unitario con mock de Repository<Tenant>.
 */

// Factory para crear un tenant de prueba sin PII real
function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  const base: Tenant = {
    id: 'tenant-uuid-001',
    name: 'ISP Test Colombia',
    slug: 'isp-test',
    schemaName: 'tenant_isp_test',
    status: TenantStatus.PROVISIONING,
    settings: { timezone: 'America/Bogota', currency: 'COP' },
    contactEmail: 'admin@isptest.co',
    maxSubscribers: 100,
    // Campos de datos de empresa (nullable)
    legalName: null,
    nit: null,
    nitDv: null,
    companyType: null,
    address: null,
    city: null,
    department: null,
    countryCode: 'CO',
    postalCode: null,
    coordinates: null,
    phone: null,
    website: null,
    economicSector: null,
    // Branding — null por defecto
    logoLightUrl: null,
    logoDarkUrl: null,
    sealLightUrl: null,
    sealDarkUrl: null,
    showTenantName: true,
    createdAt: new Date('2026-03-12T00:00:00Z'),
    updatedAt: new Date('2026-03-12T00:00:00Z'),
  };
  return { ...base, ...overrides };
}

describe('TenantService', () => {
  let service: TenantService;
  let repo: jest.Mocked<Repository<Tenant>>;
  let dataSource: {
    transaction: jest.Mock;
    createQueryRunner: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      find: jest.Mock;
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let auditServiceMock: {
    log: jest.Mock;
  };

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    };
    dataSource = {
      transaction: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    auditServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockRepo,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: REDIS_CLIENT,
          useValue: redis,
        },
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    repo = module.get(getRepositoryToken(Tenant));
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // buildSchemaName
  // ---------------------------------------------------------------------------
  describe('buildSchemaName', () => {
    it('convierte slug con guiones a schema con guiones_bajos y prefijo tenant_', () => {
      expect(service.buildSchemaName('mi-isp-colombia')).toBe('tenant_mi_isp_colombia');
    });

    it('deja guiones_bajos sin cambio', () => {
      expect(service.buildSchemaName('mi_isp')).toBe('tenant_mi_isp');
    });

    it('preserva minusculas y numeros', () => {
      expect(service.buildSchemaName('isp123')).toBe('tenant_isp123');
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    const dto: CreateTenantDto = {
      name: 'ISP Test Colombia',
      slug: 'isp-test',
      contactEmail: 'admin@isptest.co',
      maxSubscribers: 100,
    };

    it('crea un tenant y retorna el DTO de respuesta', async () => {
      const savedTenant = buildTenant();
      repo.findOne.mockResolvedValue(null); // no duplicado
      repo.create.mockReturnValue(savedTenant);
      repo.save.mockResolvedValue(savedTenant);

      const result = await service.create(dto);

      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'isp-test',
          schemaName: 'tenant_isp_test',
          status: TenantStatus.PROVISIONING,
        }),
      );
      expect(result.id).toBe('tenant-uuid-001');
      expect(result.schemaName).toBe('tenant_isp_test');
      expect(redis.set).toHaveBeenCalledTimes(2);
    });

    it('asigna settings por defecto si no se proporcionan', async () => {
      const savedTenant = buildTenant();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(savedTenant);
      repo.save.mockResolvedValue(savedTenant);

      // Sin el campo settings (optional) para verificar que el servicio pone el default
      const dtoSinSettings: CreateTenantDto = {
        name: 'ISP Test Colombia',
        slug: 'isp-test',
        contactEmail: 'admin@isptest.co',
      };
      await service.create(dtoSinSettings);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { timezone: 'America/Bogota', currency: 'COP' },
        }),
      );
    });

    it('lanza ConflictException si ya existe el slug', async () => {
      repo.findOne.mockResolvedValue(buildTenant()); // duplicado encontrado

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('persiste campos legales opcionales cuando se proporcionan', async () => {
      const savedTenant = buildTenant({
        legalName: 'ISP Test SAS',
        nit: '900123456',
        nitDv: '7',
        companyType: CompanyType.SAS,
      });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(savedTenant);
      repo.save.mockResolvedValue(savedTenant);

      const dtoConDatosLegales: CreateTenantDto = {
        ...dto,
        legalName: 'ISP Test SAS',
        nit: '900123456',
        nitDv: '7',
        companyType: CompanyType.SAS,
        city: 'Bogotá',
        department: 'Cundinamarca',
      };
      await service.create(dtoConDatosLegales);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          legalName: 'ISP Test SAS',
          nit: '900123456',
          companyType: CompanyType.SAS,
        }),
      );
    });

    it('toResponseDto retorna null para campos de empresa no asignados', async () => {
      const savedTenant = buildTenant(); // todos los campos de empresa son null
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(savedTenant);
      repo.save.mockResolvedValue(savedTenant);

      const result = await service.create(dto);

      expect(result.legalName).toBeNull();
      expect(result.nit).toBeNull();
      expect(result.companyType).toBeNull();
      expect(result.countryCode).toBe('CO'); // default
    });

    it('el tenant creado queda en estado PROVISIONING', async () => {
      const savedTenant = buildTenant({ status: TenantStatus.PROVISIONING });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(savedTenant);
      repo.save.mockResolvedValue(savedTenant);

      const result = await service.create(dto);

      expect(result.status).toBe(TenantStatus.PROVISIONING);
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------
  describe('findAll', () => {
    it('retorna lista de tenants y total', async () => {
      const tenants = [buildTenant(), buildTenant({ id: 'tenant-uuid-002', slug: 'isp-b' })];
      repo.findAndCount.mockResolvedValue([tenants, 2]);

      const result = await service.findAll();

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('respeta los parametros de paginacion', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(10, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('retorna el tenant por id', async () => {
      const tenant = buildTenant();
      repo.findOne.mockResolvedValue(tenant);

      const result = await service.findOne('tenant-uuid-001');

      expect(result.id).toBe('tenant-uuid-001');
      expect(redis.set).toHaveBeenCalledTimes(2);
    });

    it('lanza NotFoundException si no existe el tenant', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('usa el cache por id cuando el tenant ya fue resuelto previamente', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(buildTenant()));

      const result = await service.findOne('tenant-uuid-001');

      expect(result.id).toBe('tenant-uuid-001');
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // findBySlug
  // ---------------------------------------------------------------------------
  describe('findBySlug', () => {
    it('retorna el tenant por slug', async () => {
      const tenant = buildTenant();
      repo.findOne.mockResolvedValue(tenant);

      const result = await service.findBySlug('isp-test');

      expect(result?.slug).toBe('isp-test');
      expect(redis.set).toHaveBeenCalledTimes(2);
    });

    it('retorna null si no existe el slug', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findBySlug('no-existe');

      expect(result).toBeNull();
    });

    it('usa el cache por slug para resolver el tenant sin ir a la base', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(buildTenant()));

      const result = await service.findBySlug('isp-test');

      expect(result?.slug).toBe('isp-test');
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('actualiza solo los campos presentes en el DTO', async () => {
      const tenant = buildTenant();
      const updatedTenant = { ...tenant, name: 'ISP Actualizado', status: TenantStatus.ACTIVE };
      repo.findOne.mockResolvedValue({ ...tenant });
      repo.save.mockResolvedValue(updatedTenant);

      const dto: UpdateTenantDto = { name: 'ISP Actualizado', status: TenantStatus.ACTIVE };
      const result = await service.update('tenant-uuid-001', dto);

      expect(result.name).toBe('ISP Actualizado');
      expect(result.status).toBe(TenantStatus.ACTIVE);
      expect(redis.del).toHaveBeenCalledWith('tenant:id:tenant-uuid-001', 'tenant:slug:isp-test');
      expect(redis.set).toHaveBeenCalledTimes(2);
    });

    it('no modifica slug ni schemaName (inmutabilidad)', async () => {
      const tenant = buildTenant();
      repo.findOne.mockResolvedValue({ ...tenant });
      repo.save.mockResolvedValue(tenant);

      await service.update('tenant-uuid-001', { name: 'Otro Nombre' });

      // El objeto guardado debe preservar slug y schemaName originales
      const savedArg = repo.save.mock.calls[0]?.[0] as Tenant;
      expect(savedArg.slug).toBe('isp-test');
      expect(savedArg.schemaName).toBe('tenant_isp_test');
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('no-existe', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspend()', () => {
    it('marca el tenant como SUSPENDED e invalida el cache', async () => {
      const tenant = buildTenant({ status: TenantStatus.ACTIVE });
      repo.findOne.mockResolvedValue(tenant);
      repo.save.mockResolvedValue({ ...tenant, status: TenantStatus.SUSPENDED });

      const result = await service.suspend('tenant-uuid-001');

      expect(result.status).toBe(TenantStatus.SUSPENDED);
      expect(redis.del).toHaveBeenCalledWith('tenant:id:tenant-uuid-001', 'tenant:slug:isp-test');
    });
  });

  describe('activate()', () => {
    it('marca el tenant como ACTIVE e invalida el cache', async () => {
      const tenant = buildTenant({ status: TenantStatus.SUSPENDED });
      repo.findOne.mockResolvedValue(tenant);
      repo.save.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      const result = await service.activate('tenant-uuid-001');

      expect(result.status).toBe(TenantStatus.ACTIVE);
      expect(redis.del).toHaveBeenCalledWith('tenant:id:tenant-uuid-001', 'tenant:slug:isp-test');
    });
  });

  describe('delete()', () => {
    it('elimina el schema y el registro del tenant en una transaccion', async () => {
      const tenant = buildTenant({ status: TenantStatus.PROVISIONING_FAILED });
      const manager = {
        query: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      repo.findOne.mockResolvedValue(tenant);
      dataSource.transaction.mockImplementation(async (callback) => callback(manager));

      await service.delete(tenant.id);

      expect(manager.query).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS "tenant_isp_test" CASCADE');
      expect(manager.delete).toHaveBeenCalledWith(Tenant, { id: tenant.id });
      expect(redis.del).toHaveBeenCalledWith('tenant:id:tenant-uuid-001', 'tenant:slug:isp-test');
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('tenant-missing')).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('plan catalog', () => {
    const tenantId = 'tenant-uuid-001';
    const schemaName = 'tenant_isp_test';

    it('createPlanCatalogItem aplica regla NONE forzando installationFee=0 y mapea installationRule', async () => {
      const dto = {
        name: 'Plan 200',
        technology: 'GPON',
        downloadSpeedMbps: 200,
        uploadSpeedMbps: 100,
        basePrice: 89900,
        installationFee: 75000,
        installationRule: 'NONE',
      };

      queryRunner.manager.create.mockImplementation((_entity, payload) => payload);
      queryRunner.manager.save.mockResolvedValue({
        id: 'plan-1',
        ...dto,
        basePrice: '89900.00',
        installationFee: '0.00',
        validFrom: null,
        validTo: null,
        isActive: true,
        createdAt: new Date('2026-03-21T10:00:00Z'),
        updatedAt: new Date('2026-03-21T10:00:00Z'),
      });
      queryRunner.manager.find.mockResolvedValue([
        {
          id: 'plan-1',
          tenantId,
          name: 'Plan 200',
          technology: 'GPON',
          installationRule: 'NONE',
          downloadSpeedMbps: 200,
          uploadSpeedMbps: 100,
          basePrice: '89900.00',
          installationFee: '0.00',
          validFrom: null,
          validTo: null,
          isActive: true,
          createdAt: new Date('2026-03-21T10:00:00Z'),
          updatedAt: new Date('2026-03-21T10:00:00Z'),
        },
      ]);

      const result = await service.createPlanCatalogItem(tenantId, schemaName, dto);

      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          installationRule: 'NONE',
          installationFee: '0.00',
        }),
      );
      expect(result[0]?.installationRule).toBe('NONE');
      expect(result[0]?.installationFee).toBe(0);
    });

    it('createPlanCatalogItem usa ALWAYS por defecto cuando installationRule no viene', async () => {
      const dto = {
        name: 'Plan 100',
        technology: 'GPON',
        downloadSpeedMbps: 100,
        uploadSpeedMbps: 50,
        basePrice: 69900,
      };

      queryRunner.manager.create.mockImplementation((_entity, payload) => payload);
      queryRunner.manager.save.mockResolvedValue({
        id: 'plan-2',
        tenantId,
        ...dto,
        installationRule: 'ALWAYS',
        basePrice: '69900.00',
        installationFee: '0.00',
        validFrom: null,
        validTo: null,
        isActive: true,
        createdAt: new Date('2026-03-21T10:00:00Z'),
        updatedAt: new Date('2026-03-21T10:00:00Z'),
      });
      queryRunner.manager.find.mockResolvedValue([
        {
          id: 'plan-2',
          tenantId,
          ...dto,
          installationRule: 'ALWAYS',
          basePrice: '69900.00',
          installationFee: '0.00',
          validFrom: null,
          validTo: null,
          isActive: true,
          createdAt: new Date('2026-03-21T10:00:00Z'),
          updatedAt: new Date('2026-03-21T10:00:00Z'),
        },
      ]);

      await service.createPlanCatalogItem(tenantId, schemaName, dto as never);

      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ installationRule: 'ALWAYS' }),
      );
    });

    it('updatePlanCatalogItem fuerza installationFee a 0.00 cuando la regla efectiva es NONE', async () => {
      const currentEntity = {
        id: 'plan-1',
        tenantId,
        name: 'Plan 200',
        technology: 'GPON',
        installationRule: 'ALWAYS',
        downloadSpeedMbps: 200,
        uploadSpeedMbps: 100,
        basePrice: '89900.00',
        installationFee: '50000.00',
        validFrom: null,
        validTo: null,
        isActive: true,
        createdAt: new Date('2026-03-21T10:00:00Z'),
        updatedAt: new Date('2026-03-21T10:00:00Z'),
      };

      queryRunner.manager.findOne.mockResolvedValue(currentEntity);
      queryRunner.manager.save.mockImplementation(async (_entity, updated) => updated);
      queryRunner.manager.find.mockResolvedValue([
        { ...currentEntity, installationRule: 'NONE', installationFee: '0.00' },
      ]);

      await service.updatePlanCatalogItem(
        tenantId,
        schemaName,
        'plan-1',
        { installationRule: 'NONE', installationFee: 95000 },
        'actor-1',
      );

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          installationRule: 'NONE',
          installationFee: '0.00',
        }),
      );
    });

    it('updatePlanCatalogItem respeta installationFee enviado cuando la regla efectiva no es NONE', async () => {
      const currentEntity = {
        id: 'plan-3',
        tenantId,
        name: 'Plan 300',
        technology: 'GPON',
        installationRule: 'ALWAYS',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 150,
        basePrice: '109900.00',
        installationFee: '35000.00',
        validFrom: null,
        validTo: null,
        isActive: true,
        createdAt: new Date('2026-03-21T10:00:00Z'),
        updatedAt: new Date('2026-03-21T10:00:00Z'),
      };

      queryRunner.manager.findOne.mockResolvedValue(currentEntity);
      queryRunner.manager.save.mockImplementation(async (_entity, updated) => updated);
      queryRunner.manager.find.mockResolvedValue([
        { ...currentEntity, installationFee: '42000.00' },
      ]);

      await service.updatePlanCatalogItem(
        tenantId,
        schemaName,
        'plan-3',
        { installationFee: 42000 },
        'actor-1',
      );

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          installationRule: 'ALWAYS',
          installationFee: '42000.00',
        }),
      );
    });
  });
});
