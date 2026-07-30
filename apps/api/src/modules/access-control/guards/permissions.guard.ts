import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPermissionKey } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { EffectivePermissionsService } from '../services/effective-permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly effectivePermissionsService: EffectivePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<AccessPermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      params?: Record<string, string | undefined>;
      body?: Record<string, unknown>;
      query?: Record<string, string | undefined>;
    }>();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      });
    }

    if (user.type === 'platform') {
      return true;
    }

    const scopedSiteId = this.resolveScopedSiteId(request);

    const effectivePermissions =
      await this.effectivePermissionsService.getEffectivePermissionsForUser(user.sub, scopedSiteId);

    const grantedPermissions = new Set(effectivePermissions);
    const missingPermissions = requiredPermissions.filter(
      (permission) => !grantedPermissions.has(permission),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      });
    }

    return true;
  }

  private resolveScopedSiteId(request: {
    params?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
    query?: Record<string, string | undefined>;
  }): string | undefined {
    const body = request.body ?? {};

    const candidates = [
      request.params?.siteId,
      request.params?.organizationSiteId,
      typeof body['siteId'] === 'string' ? body['siteId'] : undefined,
      typeof body['organizationSiteId'] === 'string' ? body['organizationSiteId'] : undefined,
      request.query?.siteId,
      request.query?.organizationSiteId,
    ];

    return candidates.find((value) => typeof value === 'string' && value.length > 0);
  }
}
