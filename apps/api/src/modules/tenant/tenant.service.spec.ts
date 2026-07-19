import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Tenant } from '@iwana/db';
import { CompanyType, TenantStatus } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { SearchQueueService } from '../search/search-queue.service';
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
    adminEmail: null,
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
    faviconLightUrl: null,
    faviconDarkUrl: null,
    loginBackgroundLightUrl: null,
    loginBackgroundDarkUrl: null,
    logoLightAssetId: null,
    logoDarkAssetId: null,
    sealLightAssetId: null,
    sealDarkAssetId: null,
    faviconLightAssetId: null,
    faviconDarkAssetId: null,
    loginBackgroundLightAssetId: null,
    loginBackgroundDarkAssetId: null,
    showTenantName: true,
    brandingProductName: null,
    brandingSurfaceName: null,
    brandingMetadataTitle: null,
    brandingMetadataDescription: null,
    createdAt: new Date('2026-03-12T00:00:00Z'),
    updatedAt: new Date('2026-03-12T00:00:00Z'),
    deletedAt: null,
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
  let mediaServiceMock: {
    findOne: jest.Mock;
    softDelete: jest.Mock;
    upload: jest.Mock;
  };
  let searchQueueServiceMock: {
    enqueueTenantUpsert: jest.Mock;
    enqueueNavigationRebuild: jest.Mock;
  };
  let queryBuilder: {
    orderBy: jest.Mock;
    take: jest.Mock;
    skip: jest.Mock;
    andWhere: jest.Mock;
    getManyAndCount: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    const mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
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
    mediaServiceMock = {
      findOne: jest.fn(),
      softDelete: jest.fn(),
      upload: jest.fn(),
    };
    searchQueueServiceMock = {
      enqueueTenantUpsert: jest.fn(),
      enqueueNavigationRebuild: jest.fn(),
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
        {
          provide: MediaService,
          useValue: mediaServiceMock,
        },
        {
          provide: SearchQueueService,
          useValue: searchQueueServiceMock,
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
      adminEmail: 'admin@isptest.co',
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
        adminEmail: 'admin@isptest.co',
      };
      await service.create(dtoSinSettings);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          maxSubscribers: null,
          settings: {
            timezone: 'America/Bogota',
            currency: 'COP',
            language: 'es-CO',
            country: 'CO',
            features: { billing: false, mfa_required_all: false },
          },
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

    it('aplica filtros operativos de status y busqueda cuando se proporcionan', async () => {
      const tenant = buildTenant({ status: TenantStatus.ACTIVE });
      queryBuilder.getManyAndCount.mockResolvedValue([[tenant], 1]);

      const result = await service.findAll(25, 0, {
        status: TenantStatus.ACTIVE,
        search: 'isp-test',
      });

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('tenant');
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('tenant.status = :status', {
        status: TenantStatus.ACTIVE,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(tenant.name ILIKE :search OR tenant.slug ILIKE :search OR tenant.contactEmail ILIKE :search)',
        { search: '%isp-test%' },
      );
      expect(result.total).toBe(1);
      expect(result.data[0]?.status).toBe(TenantStatus.ACTIVE);
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
      redis.get.mockResolvedValueOnce(JSON.stringify(buildTenant({ status: TenantStatus.ACTIVE })));

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

  describe('branding', () => {
    it('getTenantPublicBranding retorna branding público para un tenant activo', async () => {
      redis.get.mockResolvedValueOnce(null);
      repo.findOne.mockResolvedValue(
        buildTenant({
          status: TenantStatus.ACTIVE,
          logoLightUrl: 'https://cdn.demo.co/logo-light.svg',
          sealLightUrl: 'https://cdn.demo.co/seal-light.svg',
          faviconLightUrl: 'https://cdn.demo.co/favicon-light.svg',
        }),
      );

      const result = await service.getTenantPublicBranding('isp-test');

      expect(result).toEqual(
        expect.objectContaining({
          displayName: 'ISP Test Colombia',
          productName: 'ISP Test Colombia',
          surfaceName: 'Portal empresarial',
          metadataTitle: 'ISP Test Colombia — Portal empresarial',
          metadataDescription:
            'Portal empresarial para la operación de ISP Test Colombia en iWana neXt.',
          logoLightUrl: 'https://cdn.demo.co/logo-light.svg',
          sealLightUrl: 'https://cdn.demo.co/seal-light.svg',
          faviconLightUrl: 'https://cdn.demo.co/favicon-light.svg',
        }),
      );
    });

    it('getTenantPublicBranding lanza NotFoundException si el tenant no existe o no está activo', async () => {
      redis.get.mockResolvedValueOnce(null);
      repo.findOne.mockResolvedValue(buildTenant({ status: TenantStatus.SUSPENDED }));

      await expect(service.getTenantPublicBranding('isp-test')).rejects.toThrow(NotFoundException);
    });

    it('updateTenantSelfBranding y updateTenantBranding reutilizan el estado híbrido y mapean el DTO correcto', async () => {
      repo.findOne.mockImplementation(async () =>
        buildTenant({
          status: TenantStatus.ACTIVE,
          logoLightUrl: 'https://cdn.demo.co/logo-light.svg',
        }),
      );
      repo.save.mockImplementation(async (value) => value as Tenant);

      const brandingUpdate = {
        logoLightUrl: 'https://cdn.demo.co/logo-light-actualizado.svg',
        showTenantName: false,
        brandingProductName: 'ISP Test Pro',
        brandingSurfaceName: 'Portal empresarial',
        brandingMetadataTitle: 'ISP Test Pro — Portal empresarial',
        brandingMetadataDescription:
          'Portal empresarial para la operación de ISP Test Pro en iWana neXt.',
      };

      const selfResult = await service.updateTenantSelfBranding(
        'tenant-uuid-001',
        brandingUpdate,
        'actor-1',
      );
      const platformResult = await service.updateTenantBranding(
        'tenant-uuid-001',
        brandingUpdate,
        'actor-1',
      );

      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          logoLightUrl: 'https://cdn.demo.co/logo-light-actualizado.svg',
          showTenantName: false,
          brandingProductName: 'ISP Test Pro',
          brandingSurfaceName: 'Portal empresarial',
          brandingMetadataTitle: 'ISP Test Pro — Portal empresarial',
          brandingMetadataDescription:
            'Portal empresarial para la operación de ISP Test Pro en iWana neXt.',
        }),
      );
      expect(repo.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          logoLightUrl: 'https://cdn.demo.co/logo-light-actualizado.svg',
          showTenantName: false,
          brandingProductName: 'ISP Test Pro',
          brandingSurfaceName: 'Portal empresarial',
          brandingMetadataTitle: 'ISP Test Pro — Portal empresarial',
          brandingMetadataDescription:
            'Portal empresarial para la operación de ISP Test Pro en iWana neXt.',
        }),
      );
      expect(auditServiceMock.log).toHaveBeenCalledTimes(2);
      expect(selfResult).toEqual(
        expect.objectContaining({
          slug: 'isp-test',
          logoLightUrl: 'https://cdn.demo.co/logo-light-actualizado.svg',
          showTenantName: false,
          brandingProductName: 'ISP Test Pro',
          brandingSurfaceName: 'Portal empresarial',
          brandingMetadataTitle: 'ISP Test Pro — Portal empresarial',
          brandingMetadataDescription:
            'Portal empresarial para la operación de ISP Test Pro en iWana neXt.',
        }),
      );
      expect(platformResult).toEqual(
        expect.objectContaining({
          schemaName: 'tenant_isp_test',
          logoLightUrl: 'https://cdn.demo.co/logo-light-actualizado.svg',
          showTenantName: false,
          brandingProductName: 'ISP Test Pro',
          brandingSurfaceName: 'Portal empresarial',
          brandingMetadataTitle: 'ISP Test Pro — Portal empresarial',
          brandingMetadataDescription:
            'Portal empresarial para la operación de ISP Test Pro en iWana neXt.',
        }),
      );
    });

    it('updateTenantSelfBranding conserva una URL externa cuando llega con assetId null', async () => {
      repo.findOne.mockResolvedValue(
        buildTenant({
          status: TenantStatus.ACTIVE,
          loginBackgroundLightUrl: 'https://cdn.demo.co/login-bg-uploaded.png',
          loginBackgroundLightAssetId: '55555555-5555-4555-8555-555555555555',
        }),
      );
      repo.save.mockImplementation(async (value) => value as Tenant);

      const result = await service.updateTenantSelfBranding(
        'tenant-uuid-001',
        {
          loginBackgroundLightUrl: 'https://cdn.demo.co/login-bg-external.png',
          loginBackgroundLightAssetId: null,
        },
        'actor-1',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          loginBackgroundLightUrl: 'https://cdn.demo.co/login-bg-external.png',
          loginBackgroundLightAssetId: null,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          loginBackgroundLightUrl: 'https://cdn.demo.co/login-bg-external.png',
          loginBackgroundLightAssetId: null,
        }),
      );
    });

    it('getTenantPublicBranding resuelve metadata efectiva cuando los campos branding* están vacíos', async () => {
      redis.get.mockResolvedValueOnce(null);
      repo.findOne.mockResolvedValue(
        buildTenant({
          status: TenantStatus.ACTIVE,
          legalName: 'Empresa Demo SAS',
          brandingProductName: null,
          brandingSurfaceName: null,
          brandingMetadataTitle: null,
          brandingMetadataDescription: null,
        }),
      );

      const result = await service.getTenantPublicBranding('isp-test');

      expect(result).toEqual(
        expect.objectContaining({
          displayName: 'Empresa Demo SAS',
          productName: 'Empresa Demo SAS',
          surfaceName: 'Portal empresarial',
          metadataTitle: 'Empresa Demo SAS — Portal empresarial',
          metadataDescription:
            'Portal empresarial para la operación de Empresa Demo SAS en iWana neXt.',
        }),
      );
    });

    it('uploadTenantBrandingAsset sube, asigna el slot y audita el cambio', async () => {
      const tenant = buildTenant({ status: TenantStatus.ACTIVE });
      const asset = {
        id: 'asset-1',
        usage: 'seal',
        themeVariant: 'light',
        mimeType: 'image/svg+xml',
        sizeBytes: 24831,
        publicUrl: 'https://cdn.demo.co/branding/seal-light.svg',
        createdAt: new Date('2026-04-30T12:00:00Z'),
      };

      repo.findOne.mockResolvedValue(tenant);
      repo.save.mockImplementation(async (value) => value as Tenant);
      mediaServiceMock.upload.mockResolvedValue(asset);

      const result = await service.uploadTenantBrandingAsset(
        tenant.id,
        { usage: 'seal' as never, themeVariant: 'light' },
        {
          fieldname: 'file',
          originalname: 'seal-light.svg',
          encoding: '7bit',
          mimetype: 'image/svg+xml',
          size: 24831,
          buffer: Buffer.from('<svg></svg>'),
          stream: undefined as never,
          destination: '',
          filename: '',
          path: '',
        },
        'actor-1',
      );

      expect(mediaServiceMock.upload).toHaveBeenCalledWith(
        tenant.schemaName,
        { usage: 'seal', themeVariant: 'light' },
        expect.objectContaining({ originalname: 'seal-light.svg' }),
        'actor-1',
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
          sealLightAssetId: 'asset-1',
        }),
      );
      expect(mediaServiceMock.softDelete).not.toHaveBeenCalled();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'TenantBranding', entityId: tenant.id }),
      );
      expect(result).toBe(asset);
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
      const tenant = buildTenant({
        status: TenantStatus.MARKED_FOR_DELETION,
        deletedAt: new Date(),
      });
      repo.findOne.mockResolvedValue(tenant);
      repo.save.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE, deletedAt: null });

      const result = await service.activate('tenant-uuid-001');

      expect(result.status).toBe(TenantStatus.ACTIVE);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TenantStatus.ACTIVE, deletedAt: null }),
      );
      expect(redis.del).toHaveBeenCalledWith('tenant:id:tenant-uuid-001', 'tenant:slug:isp-test');
    });
  });

  describe('delete()', () => {
    it('marca el tenant como MARKED_FOR_DELETION con deletedAt e invalida cache', async () => {
      const tenant = buildTenant({ status: TenantStatus.PROVISIONING_FAILED });
      repo.findOne.mockResolvedValue({ ...tenant });
      repo.save.mockImplementation(async (updated) => updated as Tenant);

      await service.delete(tenant.id);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TenantStatus.MARKED_FOR_DELETION,
          deletedAt: expect.any(Date),
        }),
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('tenant:id:tenant-uuid-001', 'tenant:slug:isp-test');
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityType: 'Tenant' }),
      );
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('tenant-missing')).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('commercial config compatibility fallback', () => {
    const tenantId = 'tenant-uuid-001';
    const schemaName = 'tenant_isp_test';

    it('getCoverageAdmin retorna configuracion vacia si el schema aun no tiene tablas comerciales', async () => {
      queryRunner.manager.find.mockRejectedValueOnce({
        driverError: { code: '42P01' },
      });

      const result = await service.getCoverageAdmin(tenantId, schemaName);

      expect(result).toEqual({ nodes: [], zones: [] });
    });

    it('getPlanCatalog retorna lista vacia si el error viene anidado en cause.driverError', async () => {
      queryRunner.manager.find.mockRejectedValueOnce({
        cause: {
          driverError: { code: '42P01' },
        },
      });

      const result = await service.getPlanCatalog(tenantId, schemaName);

      expect(result).toEqual([]);
    });
  });

  describe('coverage soft-delete', () => {
    const tenantId = 'tenant-uuid-001';
    const schemaName = 'tenant_isp_test';

    it('removeCoverageNode marca deletedAt, desactiva el nodo y retorna cobertura actualizada', async () => {
      const nodeEntity = {
        id: 'node-1',
        tenantId,
        name: 'Nodo Centro',
        latitude: 4.60971,
        longitude: -74.08175,
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-03-20T10:00:00Z'),
        updatedAt: new Date('2026-03-20T10:00:00Z'),
      };

      queryRunner.manager.findOne.mockResolvedValue(nodeEntity);
      queryRunner.manager.save.mockImplementation(async (_entity, updated) => updated);
      queryRunner.manager.find
        .mockResolvedValueOnce([]) // nodes
        .mockResolvedValueOnce([]); // zones

      const result = await service.removeCoverageNode(tenantId, schemaName, 'node-1', 'actor-1');

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
      );
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityType: 'CommercialNode' }),
      );
      expect(result).toEqual({ nodes: [], zones: [] });
    });

    it('removeCoverageNode no falla si el nodo ya estaba eliminado (idempotente)', async () => {
      queryRunner.manager.findOne.mockResolvedValue({
        id: 'node-1',
        tenantId,
        name: 'Nodo Centro',
        latitude: 4.60971,
        longitude: -74.08175,
        isActive: false,
        deletedAt: new Date('2026-03-22T10:00:00Z'),
        createdAt: new Date('2026-03-20T10:00:00Z'),
        updatedAt: new Date('2026-03-22T10:00:00Z'),
      });
      queryRunner.manager.find
        .mockResolvedValueOnce([]) // nodes
        .mockResolvedValueOnce([]); // zones

      const result = await service.removeCoverageNode(tenantId, schemaName, 'node-1', 'actor-1');

      expect(queryRunner.manager.save).not.toHaveBeenCalled();
      expect(result).toEqual({ nodes: [], zones: [] });
    });

    it('removeCoverageNode lanza NotFound si no existe para el tenant (aislamiento)', async () => {
      queryRunner.manager.findOne.mockResolvedValue(null);

      await expect(
        service.removeCoverageNode(tenantId, schemaName, 'node-x', 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('removeCoverageZone marca deletedAt, desactiva la zona y retorna cobertura actualizada', async () => {
      const zoneEntity = {
        id: 'zone-1',
        tenantId,
        name: 'Zona Norte',
        centerLatitude: 4.710989,
        centerLongitude: -74.07209,
        radiusKm: '12.00',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-03-20T10:00:00Z'),
        updatedAt: new Date('2026-03-20T10:00:00Z'),
      };

      queryRunner.manager.findOne.mockResolvedValue(zoneEntity);
      queryRunner.manager.save.mockImplementation(async (_entity, updated) => updated);
      queryRunner.manager.find
        .mockResolvedValueOnce([]) // nodes
        .mockResolvedValueOnce([]); // zones

      const result = await service.removeCoverageZone(tenantId, schemaName, 'zone-1', 'actor-1');

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
      );
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityType: 'CoverageZone' }),
      );
      expect(result).toEqual({ nodes: [], zones: [] });
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
