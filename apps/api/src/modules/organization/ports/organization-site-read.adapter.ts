import { Injectable } from '@nestjs/common';
import { OrganizationService } from '../organization.service';
import {
  ListOrganizationSitesByCapabilityInput,
  OrganizationSiteReadPort,
  OrganizationSiteSummary,
} from './organization-site-read.port';

@Injectable()
export class OrganizationSiteReadAdapter implements OrganizationSiteReadPort {
  constructor(private readonly organizationService: OrganizationService) {}

  async listByCapability(
    input: ListOrganizationSitesByCapabilityInput,
  ): Promise<OrganizationSiteSummary[]> {
    return this.organizationService.listByCapabilityForTenant(input);
  }
}
