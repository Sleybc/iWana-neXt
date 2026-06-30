import { OrganizationSiteCapability, OrganizationSiteType } from '@iwana/shared';

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

export abstract class OrganizationSiteReadPort {
  abstract listByCapability(
    input: ListOrganizationSitesByCapabilityInput,
  ): Promise<OrganizationSiteSummary[]>;
}
