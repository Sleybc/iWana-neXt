import { Injectable } from '@nestjs/common';
import { AccessPermissionKey } from '@iwana/shared';

export type SiteActionDecision = 'OUT_OF_SCOPE' | 'IN_SCOPE_NO_ACTION' | 'ALLOWED';

export type AuthorizedSiteScope = { kind: 'TENANT_WIDE' } | { kind: 'SITE_IDS'; siteIds: string[] };

@Injectable()
export abstract class EffectivePermissionScopePort {
  abstract authorizeTenantWide(input: {
    actorId: string;
    permissionKey: AccessPermissionKey;
  }): Promise<boolean>;

  abstract evaluateSite(input: {
    actorId: string;
    siteId: string;
    permissionKey: AccessPermissionKey;
  }): Promise<SiteActionDecision>;

  abstract listAuthorizedSiteScope(input: {
    actorId: string;
    permissionKey: AccessPermissionKey;
  }): Promise<AuthorizedSiteScope>;
}
