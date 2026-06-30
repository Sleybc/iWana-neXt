import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { OrganizationSiteCapability } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  OrganizationSiteReadPort,
  OrganizationSiteSummary,
} from '../../organization/ports/organization-site-read.port';
import { WfmOrganizationSitesReadPort } from '../ports/wfm-organization-sites-read.port';

@Injectable()
export class WfmOrganizationSitesAdapter extends WfmOrganizationSitesReadPort {
  constructor(
    @Inject(OrganizationSiteReadPort)
    private readonly organizationSiteReadPort: OrganizationSiteReadPort,
  ) {
    super();
  }

  async listDispatchSites(actor: JwtPayload): Promise<OrganizationSiteSummary[]> {
    if (!actor.tenantId) {
      throw new BadRequestException('No fue posible resolver el tenant autenticado.');
    }

    return this.organizationSiteReadPort.listByCapability({
      tenantId: actor.tenantId,
      capability: OrganizationSiteCapability.TECH_DISPATCH,
    });
  }
}
