import { OrganizationSiteCapability, OrganizationSiteType } from '@iwana/shared';
import type { ListResponse, RouterSiteOptionDto } from '@iwana/shared';
import type { AuthorizedSiteScope } from '../../access-control/ports/effective-permission-scope.port';

export interface OrganizationSiteSummary {
  id: string;
  name: string;
  code: string;
  siteType: OrganizationSiteType;
  address: string | null;
  municipality: string | null;
  department: string | null;
  capabilities: OrganizationSiteCapability[];
  isActive: boolean;
}

export interface ListOrganizationSitesByCapabilityInput {
  tenantId: string;
  capability: OrganizationSiteCapability;
}

export interface OrganizationSiteReference {
  id: string;
  isActive: boolean;
}

export interface OrganizationSiteRouterSummary {
  name: string;
  siteType: OrganizationSiteType;
  isActive: boolean;
}

export interface ListRouterSiteOptionsInput {
  scope: AuthorizedSiteScope;
  page: number;
  limit: number;
}

export abstract class OrganizationSiteReadPort {
  abstract listByCapability(
    input: ListOrganizationSitesByCapabilityInput,
  ): Promise<OrganizationSiteSummary[]>;

  abstract findReferenceById(siteId: string): Promise<OrganizationSiteReference | null>;

  abstract findRouterSummaryById(siteId: string): Promise<OrganizationSiteRouterSummary | null>;

  abstract listRouterOptions(
    input: ListRouterSiteOptionsInput,
  ): Promise<ListResponse<RouterSiteOptionDto>>;
}
