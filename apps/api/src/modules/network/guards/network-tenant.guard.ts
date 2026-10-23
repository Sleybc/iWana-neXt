import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class NetworkTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    const tenantContext = TenantContext.get();

    if (
      !user ||
      user.type !== 'tenant' ||
      !user.tenantId ||
      !user.schemaName ||
      !tenantContext ||
      tenantContext.tenantId !== user.tenantId ||
      tenantContext.schemaName !== user.schemaName
    ) {
      throw new UnauthorizedException({
        message: 'Se requiere un contexto de empresa autenticado.',
      });
    }

    return true;
  }
}
