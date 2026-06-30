import { Test, TestingModule } from '@nestjs/testing';
import { SearchIndexerService } from './search-indexer.service';
import { SearchService } from './search.service';
import { SearchTypesenseClient, TypesenseHttpError } from './typesense/typesense.client';

describe('SearchService', () => {
  let service: SearchService;

  const typesenseClient = {
    searchDocuments: jest.fn(),
    healthCheck: jest.fn(),
  };

  const searchIndexerService = {
    rebuildAll: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: SearchTypesenseClient, useValue: typesenseClient },
        { provide: SearchIndexerService, useValue: searchIndexerService },
      ],
    }).compile();

    service = moduleRef.get(SearchService);
    jest.clearAllMocks();
  });

  it('should agrupar resultados de empresas, usuarios y módulos', async () => {
    typesenseClient.searchDocuments
      .mockResolvedValueOnce({
        found: 1,
        search_time_ms: 4,
        hits: [
          {
            document: {
              id: 'tenant-1',
              type: 'tenant',
              name: 'Empresa Demo',
              slug: 'empresa-demo',
              status: 'ACTIVE',
              route: '/tenants/tenant-1/settings',
              updatedAt: Date.now(),
            },
            highlights: [{ field: 'name', snippet: 'Empresa <mark>Demo</mark>' }],
          },
        ],
      })
      .mockResolvedValueOnce({
        found: 1,
        search_time_ms: 5,
        hits: [
          {
            document: {
              id: 'user-1',
              type: 'user',
              tenantId: 'tenant-1',
              tenantSlug: 'empresa-demo',
              tenantName: 'Empresa Demo',
              email: 'lili@empresa.com',
              firstName: 'Liliana',
              lastName: 'Ruiz',
              jobTitle: 'NOC',
              role: 'ADMIN',
              status: 'ACTIVE',
              route: '/users?tenant=empresa-demo&search=lili%40empresa.com&openUser=user-1',
              updatedAt: Date.now(),
            },
            highlight: { email: { snippet: '<mark>lili</mark>@empresa.com' } },
          },
        ],
      })
      .mockResolvedValueOnce({
        found: 1,
        search_time_ms: 2,
        hits: [
          {
            document: {
              id: 'users',
              type: 'module',
              title: 'Usuarios',
              keywords: ['usuarios'],
              description: 'Gestión interna de usuarios por empresa',
              route: '/users',
              order: 3,
            },
          },
        ],
      });

    const result = await service.searchGlobal('lili', 5);

    expect(result.query).toBe('lili');
    expect(result.groups).toHaveLength(3);
    expect(result.groups[0]?.label).toBe('Empresas');
    expect(result.groups[1]?.items[0]?.title).toBe('Liliana Ruiz');
    expect(result.groups[1]?.items[0]?.route).toContain('openUser=user-1');
    expect(result.groups[2]?.items[0]?.title).toBe('Usuarios');
    expect(result.tookMs).toBe(11);
  });

  it('should reconstruir índices cuando Typesense está saludable', async () => {
    typesenseClient.healthCheck.mockResolvedValue(true);
    searchIndexerService.rebuildAll.mockResolvedValue({
      collections: ['search_tenants', 'search_users', 'search_navigation_modules'],
      counts: {
        search_tenants: 2,
        search_users: 4,
        search_navigation_modules: 5,
      },
    });

    const result = await service.rebuildGlobalIndex();

    expect(typesenseClient.healthCheck).toHaveBeenCalled();
    expect(searchIndexerService.rebuildAll).toHaveBeenCalledWith(true);
    expect(result.counts.search_users).toBe(4);
  });

  it('should auto inicializar colecciones cuando Typesense responde 404', async () => {
    typesenseClient.searchDocuments
      .mockRejectedValueOnce(new TypesenseHttpError(404, 'Collection not found'))
      .mockResolvedValueOnce({ found: 0, search_time_ms: 0, hits: [] })
      .mockResolvedValueOnce({ found: 0, search_time_ms: 0, hits: [] })
      .mockResolvedValueOnce({
        found: 1,
        search_time_ms: 3,
        hits: [
          {
            document: {
              id: 'tenant-1',
              type: 'tenant',
              name: 'Empresa Demo',
              slug: 'empresa-demo',
              status: 'ACTIVE',
              route: '/tenants/tenant-1/settings',
              updatedAt: Date.now(),
            },
          },
        ],
      })
      .mockResolvedValueOnce({ found: 0, search_time_ms: 1, hits: [] })
      .mockResolvedValueOnce({ found: 0, search_time_ms: 1, hits: [] });
    searchIndexerService.rebuildAll.mockResolvedValue({
      collections: ['search_tenants', 'search_users', 'search_navigation_modules'],
      counts: {
        search_tenants: 1,
        search_users: 0,
        search_navigation_modules: 0,
      },
    });

    const result = await service.searchGlobal('lili', 5);

    expect(searchIndexerService.rebuildAll).toHaveBeenCalledWith(false);
    expect(typesenseClient.searchDocuments).toHaveBeenCalledTimes(6);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.label).toBe('Empresas');
  });
});
