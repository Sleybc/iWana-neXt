import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Tenant, User, runInTenantSchema } from '@iwana/db';
import { SearchNavigationCatalogService } from './search-navigation-catalog.service';
import {
  SEARCH_COLLECTION_SCHEMAS,
  SEARCH_COLLECTIONS,
  SearchTypesenseClient,
} from './search-typesense.client';

@Injectable()
export class SearchIndexWorkerService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly typesenseClient: SearchTypesenseClient,
    private readonly navigationCatalogService: SearchNavigationCatalogService,
  ) {}

  async rebuildAll(force = true): Promise<void> {
    if (force) {
      for (const schema of SEARCH_COLLECTION_SCHEMAS) {
        await this.typesenseClient.deleteCollectionIfExists(schema.name);
      }
    }

    for (const schema of SEARCH_COLLECTION_SCHEMAS) {
      await this.typesenseClient.ensureCollection(schema);
    }

    const tenants = await this.dataSource
      .getRepository(Tenant)
      .find({ order: { updatedAt: 'DESC' } });

    await this.typesenseClient.importDocuments(
      SEARCH_COLLECTIONS.tenants,
      tenants.map((tenant) => ({
        id: tenant.id,
        type: 'tenant',
        name: tenant.name,
        slug: tenant.slug,
        ...(tenant.legalName ? { legalName: tenant.legalName } : {}),
        status: tenant.status,
        route: `/tenants/${tenant.id}/settings`,
        updatedAt: tenant.updatedAt.getTime(),
      })),
    );

    const usersByTenant = await Promise.all(
      tenants.map((tenant) => this.readUsersForTenant(tenant.id)),
    );
    await this.typesenseClient.importDocuments(SEARCH_COLLECTIONS.users, usersByTenant.flat());

    await this.rebuildNavigation();
  }

  async upsertTenant(tenantId: string): Promise<void> {
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
    if (!tenant) {
      return;
    }

    await this.typesenseClient.ensureCollection(SEARCH_COLLECTION_SCHEMAS[0]!);
    await this.typesenseClient.importDocuments(SEARCH_COLLECTIONS.tenants, [
      {
        id: tenant.id,
        type: 'tenant',
        name: tenant.name,
        slug: tenant.slug,
        ...(tenant.legalName ? { legalName: tenant.legalName } : {}),
        status: tenant.status,
        route: `/tenants/${tenant.id}/settings`,
        updatedAt: tenant.updatedAt.getTime(),
      },
    ]);
  }

  async upsertUser(tenantId: string, userId: string): Promise<void> {
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
    if (!tenant) {
      return;
    }

    const users = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      return qr.manager.find(User, { where: { id: userId, tenantId } });
    });

    if (users.length === 0) {
      return;
    }

    const user = users[0]!;
    await this.typesenseClient.ensureCollection(SEARCH_COLLECTION_SCHEMAS[1]!);
    await this.typesenseClient.importDocuments(SEARCH_COLLECTIONS.users, [
      {
        id: user.id,
        type: 'user',
        tenantId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        email: user.email,
        ...(user.firstName ? { firstName: user.firstName } : {}),
        ...(user.lastName ? { lastName: user.lastName } : {}),
        ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
        role: user.role,
        status: user.status,
        route: `/users?tenant=${encodeURIComponent(tenant.slug)}&search=${encodeURIComponent(user.email)}&openUser=${encodeURIComponent(user.id)}`,
        updatedAt: user.updatedAt.getTime(),
      },
    ]);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.typesenseClient.deleteDocument(SEARCH_COLLECTIONS.users, userId);
  }

  async rebuildNavigation(): Promise<void> {
    await this.typesenseClient.ensureCollection(SEARCH_COLLECTION_SCHEMAS[2]!);
    await this.typesenseClient.importDocuments(
      SEARCH_COLLECTIONS.navigationModules,
      this.navigationCatalogService.list().map((item) => ({
        id: item.id,
        type: 'module',
        title: item.title,
        keywords: item.keywords,
        description: item.description,
        route: item.route,
        order: item.order,
      })),
    );
  }

  private async readUsersForTenant(tenantId: string): Promise<unknown[]> {
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
    if (!tenant) {
      return [];
    }

    const users = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      return qr.manager.find(User, { where: { tenantId }, order: { updatedAt: 'DESC' } });
    });

    return users.map((user) => ({
      id: user.id,
      type: 'user',
      tenantId,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      email: user.email,
      ...(user.firstName ? { firstName: user.firstName } : {}),
      ...(user.lastName ? { lastName: user.lastName } : {}),
      ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
      role: user.role,
      status: user.status,
      route: `/users?tenant=${encodeURIComponent(tenant.slug)}&search=${encodeURIComponent(user.email)}&openUser=${encodeURIComponent(user.id)}`,
      updatedAt: user.updatedAt.getTime(),
    }));
  }
}
