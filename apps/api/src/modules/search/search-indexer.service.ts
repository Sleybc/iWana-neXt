import { Injectable } from '@nestjs/common';
import { TenantResponseDto } from '../tenant/dto/tenant.dto';
import { TenantService } from '../tenant/tenant.service';
import { SearchIndexUserRecord, UsersService } from '../users/users.service';
import { SearchNavigationCatalogService } from './search-navigation-catalog.service';
import { SearchTypesenseClient } from './typesense/typesense.client';
import {
  SEARCH_COLLECTION_SCHEMAS,
  SEARCH_COLLECTIONS,
  SearchNavigationDocument,
  SearchTenantDocument,
  SearchUserDocument,
} from './typesense/typesense.schemas';

export interface SearchRebuildSummary {
  collections: string[];
  counts: Record<string, number>;
}

@Injectable()
export class SearchIndexerService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly usersService: UsersService,
    private readonly navigationCatalogService: SearchNavigationCatalogService,
    private readonly typesenseClient: SearchTypesenseClient,
  ) {}

  async rebuildAll(force = true): Promise<SearchRebuildSummary> {
    if (force) {
      for (const schema of SEARCH_COLLECTION_SCHEMAS) {
        await this.typesenseClient.deleteCollectionIfExists(schema.name);
      }
    }

    for (const schema of SEARCH_COLLECTION_SCHEMAS) {
      await this.typesenseClient.ensureCollection(schema);
    }

    const tenants = await this.fetchAllTenants();
    const tenantDocuments = this.buildTenantDocuments(tenants);
    const userDocuments = await this.buildUserDocuments(tenants);
    const navigationDocuments = this.buildNavigationDocuments();

    await this.typesenseClient.importDocuments(SEARCH_COLLECTIONS.tenants, tenantDocuments);
    await this.typesenseClient.importDocuments(SEARCH_COLLECTIONS.users, userDocuments);
    await this.typesenseClient.importDocuments(
      SEARCH_COLLECTIONS.navigationModules,
      navigationDocuments,
    );

    return {
      collections: [
        SEARCH_COLLECTIONS.tenants,
        SEARCH_COLLECTIONS.users,
        SEARCH_COLLECTIONS.navigationModules,
      ],
      counts: {
        [SEARCH_COLLECTIONS.tenants]: tenantDocuments.length,
        [SEARCH_COLLECTIONS.users]: userDocuments.length,
        [SEARCH_COLLECTIONS.navigationModules]: navigationDocuments.length,
      },
    };
  }

  private async fetchAllTenants(): Promise<TenantResponseDto[]> {
    const tenants: TenantResponseDto[] = [];
    const limit = 200;
    let offset = 0;

    while (true) {
      const response = await this.tenantService.findAll(limit, offset, {});
      tenants.push(...response.data);

      if (tenants.length >= response.total || response.data.length === 0) {
        break;
      }

      offset += response.data.length;
    }

    return tenants;
  }

  private buildTenantDocuments(tenants: TenantResponseDto[]): SearchTenantDocument[] {
    return tenants.map((tenant) => ({
      id: tenant.id,
      type: 'tenant',
      name: tenant.name,
      slug: tenant.slug,
      ...(tenant.legalName ? { legalName: tenant.legalName } : {}),
      status: tenant.status,
      route: `/tenants/${tenant.id}/settings`,
      updatedAt: tenant.updatedAt.getTime(),
    }));
  }

  private async buildUserDocuments(tenants: TenantResponseDto[]): Promise<SearchUserDocument[]> {
    const usersByTenant = await Promise.all(
      tenants.map((tenant) =>
        this.usersService.listForSearchIndex({
          schemaName: tenant.schemaName,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
        }),
      ),
    );

    return usersByTenant.flat().map((user) => this.toUserDocument(user));
  }

  private toUserDocument(user: SearchIndexUserRecord): SearchUserDocument {
    return {
      id: user.id,
      type: 'user',
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      tenantName: user.tenantName,
      email: user.email,
      ...(user.firstName ? { firstName: user.firstName } : {}),
      ...(user.lastName ? { lastName: user.lastName } : {}),
      ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
      role: user.role,
      status: user.status,
      route: user.route,
      updatedAt: user.updatedAt,
    };
  }

  private buildNavigationDocuments(): SearchNavigationDocument[] {
    return this.navigationCatalogService.list().map((item) => ({
      id: item.id,
      type: 'module',
      title: item.title,
      keywords: item.keywords,
      description: item.description,
      route: item.route,
      order: item.order,
    }));
  }
}
