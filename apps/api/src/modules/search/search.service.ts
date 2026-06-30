import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  GlobalSearchGroupDto,
  GlobalSearchItemDto,
  GlobalSearchResponseDto,
  GlobalSearchRebuildResponseDto,
} from './dto/global-search-response.dto';
import { SearchIndexerService } from './search-indexer.service';
import {
  SearchTypesenseClient,
  TypesenseHttpError,
  TypesenseSearchHit,
} from './typesense/typesense.client';
import {
  SEARCH_COLLECTIONS,
  SearchNavigationDocument,
  SearchTenantDocument,
  SearchUserDocument,
} from './typesense/typesense.schemas';

@Injectable()
export class SearchService {
  private bootstrapPromise: Promise<void> | null = null;

  constructor(
    private readonly typesenseClient: SearchTypesenseClient,
    private readonly searchIndexerService: SearchIndexerService,
  ) {}

  async searchGlobal(query: string, limit = 5): Promise<GlobalSearchResponseDto> {
    const normalizedQuery = query.trim();

    try {
      return await this.executeSearch(normalizedQuery, limit);
    } catch (error) {
      if (this.shouldBootstrapCollections(error)) {
        await this.bootstrapCollections();
        return this.executeSearch(normalizedQuery, limit);
      }

      throw new ServiceUnavailableException(
        'La búsqueda global no está disponible en este momento.',
      );
    }
  }

  async rebuildGlobalIndex(): Promise<GlobalSearchRebuildResponseDto> {
    const isHealthy = await this.typesenseClient.healthCheck();

    if (!isHealthy) {
      throw new ServiceUnavailableException(
        'Typesense no está disponible para reconstruir el índice.',
      );
    }

    return this.searchIndexerService.rebuildAll(true);
  }

  private async executeSearch(
    normalizedQuery: string,
    limit: number,
  ): Promise<GlobalSearchResponseDto> {
    const [tenantsResult, usersResult, modulesResult] = await Promise.all([
      this.typesenseClient.searchDocuments<SearchTenantDocument>(SEARCH_COLLECTIONS.tenants, {
        q: normalizedQuery,
        query_by: ['name', 'slug', 'legalName'],
        per_page: limit,
        sort_by: '_text_match:desc,updatedAt:desc',
      }),
      this.typesenseClient.searchDocuments<SearchUserDocument>(SEARCH_COLLECTIONS.users, {
        q: normalizedQuery,
        query_by: ['email', 'firstName', 'lastName', 'jobTitle', 'tenantName', 'tenantSlug'],
        per_page: limit,
        sort_by: '_text_match:desc,updatedAt:desc',
      }),
      this.typesenseClient.searchDocuments<SearchNavigationDocument>(
        SEARCH_COLLECTIONS.navigationModules,
        {
          q: normalizedQuery,
          query_by: ['title', 'keywords', 'description'],
          per_page: limit,
          sort_by: '_text_match:desc,order:asc',
        },
      ),
    ]);

    const groups = [
      this.mapTenantGroup(tenantsResult.found ?? 0, tenantsResult.hits ?? []),
      this.mapUserGroup(usersResult.found ?? 0, usersResult.hits ?? []),
      this.mapModuleGroup(modulesResult.found ?? 0, modulesResult.hits ?? []),
    ].filter((group) => group.total > 0);

    return {
      query: normalizedQuery,
      groups,
      tookMs:
        (tenantsResult.search_time_ms ?? 0) +
        (usersResult.search_time_ms ?? 0) +
        (modulesResult.search_time_ms ?? 0),
    };
  }

  private shouldBootstrapCollections(error: unknown): boolean {
    return error instanceof TypesenseHttpError && error.status === 404;
  }

  private async bootstrapCollections(): Promise<void> {
    this.bootstrapPromise ??= this.searchIndexerService
      .rebuildAll(false)
      .then(() => undefined)
      .finally(() => {
        this.bootstrapPromise = null;
      });

    await this.bootstrapPromise;
  }

  private mapTenantGroup(
    total: number,
    hits: Array<TypesenseSearchHit<SearchTenantDocument>>,
  ): GlobalSearchGroupDto {
    return {
      type: 'tenants',
      label: 'Empresas',
      total,
      items: hits.map((hit) => ({
        id: hit.document.id,
        type: 'tenant',
        title: hit.document.name,
        subtitle:
          hit.document.legalName && hit.document.legalName !== hit.document.name
            ? hit.document.legalName
            : `Estado ${this.humanizeStatus(hit.document.status).toLowerCase()}`,
        meta: this.humanizeStatus(hit.document.status),
        route: hit.document.route,
        highlights: this.extractHighlights(hit),
      })),
    };
  }

  private mapUserGroup(
    total: number,
    hits: Array<TypesenseSearchHit<SearchUserDocument>>,
  ): GlobalSearchGroupDto {
    return {
      type: 'users',
      label: 'Usuarios internos',
      total,
      items: hits.map((hit) => {
        const fullName = [hit.document.firstName, hit.document.lastName].filter(Boolean).join(' ');

        return {
          id: hit.document.id,
          type: 'user',
          title: fullName || hit.document.email,
          subtitle: `${hit.document.tenantName} · ${hit.document.email}`,
          meta: `${this.humanizeRole(hit.document.role)} · ${this.humanizeStatus(hit.document.status)}`,
          route: hit.document.route,
          highlights: this.extractHighlights(hit),
        };
      }),
    };
  }

  private mapModuleGroup(
    total: number,
    hits: Array<TypesenseSearchHit<SearchNavigationDocument>>,
  ): GlobalSearchGroupDto {
    return {
      type: 'modules',
      label: 'Secciones',
      total,
      items: hits.map((hit) => ({
        id: hit.document.id,
        type: 'module',
        title: hit.document.title,
        subtitle: hit.document.description,
        meta: 'Ruta rápida',
        route: hit.document.route,
        highlights: this.extractHighlights(hit),
      })),
    };
  }

  private extractHighlights<TDocument>(hit: TypesenseSearchHit<TDocument>): string[] {
    const snippets: string[] = [];

    if (Array.isArray(hit.highlights)) {
      for (const highlight of hit.highlights) {
        if (highlight.snippet) {
          snippets.push(highlight.snippet);
        }

        if (Array.isArray(highlight.snippets)) {
          snippets.push(...highlight.snippets.filter((value): value is string => Boolean(value)));
        }
      }
    }

    if (typeof hit.highlight === 'string') {
      snippets.push(hit.highlight);
    }

    if (hit.highlight && typeof hit.highlight === 'object' && !Array.isArray(hit.highlight)) {
      for (const value of Object.values(hit.highlight)) {
        if (typeof value === 'string') {
          snippets.push(value);
          continue;
        }

        if (value?.snippet) {
          snippets.push(value.snippet);
        }

        if (Array.isArray(value?.snippets)) {
          snippets.push(...value.snippets.filter((item): item is string => Boolean(item)));
        }
      }
    }

    return snippets.filter(Boolean).slice(0, 3);
  }

  private humanizeStatus(status: string): string {
    const normalized = status.replace(/_/g, ' ').toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private humanizeRole(role: string): string {
    const labels: Record<string, string> = {
      ADMIN: 'Administrador',
      SYSTEM_ADMIN: 'Administrador de sistema',
      NOC: 'Monitoreo operativo',
      SALES: 'Ventas',
      SUPPORT: 'Soporte inicial',
      TECHNICIAN: 'Técnico',
      HR: 'Talento humano',
      ALLY: 'Aliado',
    };

    return labels[role] ?? role.replace(/_/g, ' ');
  }
}
