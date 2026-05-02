import { Test, TestingModule } from '@nestjs/testing';
import { SearchIndexerService } from './search-indexer.service';
import { SearchNavigationCatalogService } from './search-navigation-catalog.service';
import { SearchTypesenseClient } from './typesense/typesense.client';
import { TenantService } from '../tenant/tenant.service';
import { UsersService } from '../users/users.service';

describe('SearchIndexerService', () => {
  let service: SearchIndexerService;

  const tenantService = {
    findAll: jest.fn(),
  };

  const usersService = {
    listForSearchIndex: jest.fn(),
  };

  const navigationCatalogService = {
    list: jest.fn(),
  };

  const typesenseClient = {
    deleteCollectionIfExists: jest.fn(),
    ensureCollection: jest.fn(),
    importDocuments: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexerService,
        { provide: TenantService, useValue: tenantService },
        { provide: UsersService, useValue: usersService },
        { provide: SearchNavigationCatalogService, useValue: navigationCatalogService },
        { provide: SearchTypesenseClient, useValue: typesenseClient },
      ],
    }).compile();

    service = moduleRef.get(SearchIndexerService);
    jest.clearAllMocks();
  });

  it('should construir documentos sin campos sensibles prohibidos', async () => {
    tenantService.findAll.mockResolvedValue({
      total: 1,
      data: [
        {
          id: 'tenant-1',
          name: 'Empresa Demo',
          slug: 'empresa-demo',
          schemaName: 'tenant_empresa_demo',
          status: 'ACTIVE',
          contactEmail: 'contacto@empresa.com',
          maxSubscribers: null,
          settings: {},
          legalName: 'Empresa Demo SAS',
          nit: null,
          nitDv: null,
          companyType: null,
          address: null,
          city: null,
          department: null,
          countryCode: null,
          postalCode: null,
          coordinates: null,
          phone: null,
          website: null,
          economicSector: null,
          logoLightUrl: null,
          logoLightAssetId: null,
          logoDarkUrl: null,
          logoDarkAssetId: null,
          sealLightUrl: null,
          sealLightAssetId: null,
          sealDarkUrl: null,
          sealDarkAssetId: null,
          faviconLightUrl: null,
          faviconLightAssetId: null,
          faviconDarkUrl: null,
          faviconDarkAssetId: null,
          loginBackgroundLightUrl: null,
          loginBackgroundLightAssetId: null,
          loginBackgroundDarkUrl: null,
          loginBackgroundDarkAssetId: null,
          showTenantName: true,
          brandingProductName: null,
          brandingSurfaceName: null,
          brandingMetadataTitle: null,
          brandingMetadataDescription: null,
          createdAt: new Date('2026-05-02T10:00:00.000Z'),
          updatedAt: new Date('2026-05-02T10:00:00.000Z'),
        },
      ],
    });
    usersService.listForSearchIndex.mockResolvedValue([
      {
        id: 'user-1',
        email: 'lili@empresa.com',
        firstName: 'Liliana',
        lastName: 'Ruiz',
        jobTitle: 'NOC',
        role: 'ADMIN',
        status: 'ACTIVE',
        tenantId: 'tenant-1',
        tenantSlug: 'empresa-demo',
        tenantName: 'Empresa Demo',
        route: '/users?tenant=empresa-demo&search=lili%40empresa.com&openUser=user-1',
        updatedAt: Date.now(),
      },
    ]);
    navigationCatalogService.list.mockReturnValue([
      {
        id: 'users',
        title: 'Usuarios',
        description: 'Gestión interna de usuarios por empresa',
        keywords: ['usuarios', 'credenciales'],
        route: '/users',
        order: 3,
      },
    ]);

    await service.rebuildAll(true);

    const userImportCall = typesenseClient.importDocuments.mock.calls.find(
      ([collection]: [string]) => collection === 'search_users',
    );

    expect(userImportCall).toBeDefined();
    expect(userImportCall?.[1][0]).toEqual(
      expect.objectContaining({
        email: 'lili@empresa.com',
        tenantName: 'Empresa Demo',
      }),
    );
    expect(userImportCall?.[1][0]).not.toHaveProperty('phone');
    expect(userImportCall?.[1][0]).not.toHaveProperty('documentNumber');
    expect(userImportCall?.[1][0]).not.toHaveProperty('passwordHash');
  });
});
