import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { OrganizationSiteSummary } from '../../organization/ports/organization-site-read.port';

export abstract class WfmOrganizationSitesReadPort {
  abstract listDispatchSites(actor: JwtPayload): Promise<OrganizationSiteSummary[]>;
}
