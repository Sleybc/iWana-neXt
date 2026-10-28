import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { OrganizationSite, TenantContext, runInTenantSchema } from '@iwana/db';
import type { ListResponse, RouterSiteOptionDto } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { buildPageMeta } from '../../../common/pagination';
import { OrganizationService } from '../organization.service';
import {
  ListRouterSiteOptionsInput,
  ListOrganizationSitesByCapabilityInput,
  OrganizationSiteReadPort,
  OrganizationSiteReference,
  OrganizationSiteSummary,
  OrganizationSiteRouterSummary,
} from './organization-site-read.port';

@Injectable()
export class OrganizationSiteReadAdapter implements OrganizationSiteReadPort {
  constructor(
    private readonly organizationService: OrganizationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listByCapability(
    input: ListOrganizationSitesByCapabilityInput,
  ): Promise<OrganizationSiteSummary[]> {
    return this.organizationService.listByCapabilityForTenant(input);
  }

  async findReferenceById(siteId: string): Promise<OrganizationSiteReference | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const site = await qr.manager.findOne(OrganizationSite, {
        where: { id: siteId, tenantId },
        select: ['id', 'isActive'],
      });
      return site ? { id: site.id, isActive: site.isActive } : null;
    });
  }

  async findRouterSummaryById(siteId: string): Promise<OrganizationSiteRouterSummary | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const site = await qr.manager.findOne(OrganizationSite, {
        where: { id: siteId, tenantId },
        select: ['id', 'name', 'siteType', 'isActive'],
      });
      return site ? { name: site.name, siteType: site.siteType, isActive: site.isActive } : null;
    });
  }

  async listRouterOptions(
    input: ListRouterSiteOptionsInput,
  ): Promise<ListResponse<RouterSiteOptionDto>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const offset = (input.page - 1) * input.limit;
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const builder = qr.manager
        .createQueryBuilder(OrganizationSite, 'site')
        .where('site.tenant_id = :tenantId', { tenantId });
      if (input.scope.kind === 'SITE_IDS') {
        if (input.scope.siteIds.length === 0) {
          builder.andWhere('1 = 0');
        } else {
          builder.andWhere('site.id IN (:...siteIds)', { siteIds: input.scope.siteIds });
        }
      }

      const total = await builder.clone().getCount();
      const sites = await builder
        .select(['site.id', 'site.name', 'site.siteType', 'site.isActive'])
        .orderBy('site.name', 'ASC')
        .addOrderBy('site.id', 'ASC')
        .skip(offset)
        .take(input.limit)
        .getMany();
      const data = sites.map((site) => ({
        id: site.id,
        name: site.name,
        siteType: site.siteType,
        isActive: site.isActive,
      }));

      return {
        data,
        meta: buildPageMeta({
          total,
          page: input.page,
          limit: input.limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }
}
