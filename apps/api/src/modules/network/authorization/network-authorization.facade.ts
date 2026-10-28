import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessPermissionKey } from '@iwana/shared';
import {
  EffectivePermissionScopePort,
  type AuthorizedSiteScope,
} from '../../access-control/ports/effective-permission-scope.port';

@Injectable()
export class NetworkAuthorizationFacade {
  constructor(private readonly scopePort: EffectivePermissionScopePort) {}

  async requireTenantWideAction(
    actorId: string,
    permissionKey: AccessPermissionKey,
  ): Promise<void> {
    if (!(await this.scopePort.authorizeTenantWide({ actorId, permissionKey }))) {
      throw this.forbidden();
    }
  }

  async requireSiteAction(
    actorId: string,
    siteId: string,
    permissionKey: AccessPermissionKey,
  ): Promise<void> {
    const decision = await this.scopePort.evaluateSite({ actorId, siteId, permissionKey });
    if (decision === 'OUT_OF_SCOPE') throw this.notFound();
    if (decision === 'IN_SCOPE_NO_ACTION') throw this.forbidden();
  }

  async requireSiteOrTenantWideAction(
    actorId: string,
    siteId: string | null,
    permissionKey: AccessPermissionKey,
  ): Promise<void> {
    if (siteId === null) {
      if (!(await this.scopePort.authorizeTenantWide({ actorId, permissionKey }))) {
        throw this.notFound();
      }
      return;
    }
    await this.requireSiteAction(actorId, siteId, permissionKey);
  }

  async requireCreateScope(
    actorId: string,
    siteId: string | null,
    permissionKey: AccessPermissionKey,
  ): Promise<void> {
    if (siteId === null) {
      await this.requireTenantWideAction(actorId, permissionKey);
      return;
    }
    await this.requireSiteAction(actorId, siteId, permissionKey);
  }

  authorizedSiteScope(
    actorId: string,
    permissionKey: AccessPermissionKey,
  ): Promise<AuthorizedSiteScope> {
    return this.scopePort.listAuthorizedSiteScope({ actorId, permissionKey });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La referencia no está disponible para esta operación.',
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'No tienes autorización para esta operación.',
    });
  }
}
