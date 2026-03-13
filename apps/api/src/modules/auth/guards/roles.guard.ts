import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard RBAC (Role-Based Access Control).
 *
 * Evalua el rol del usuario autenticado contra los roles declarados
 * con el decorador @Roles() en el endpoint o controlador.
 *
 * Requerimientos:
 * - JwtAuthGuard DEBE ejecutarse ANTES de este guard.
 * - Si no hay roles declarados en la metadata, el acceso es permitido
 *   (manejado por JwtAuthGuard solamente).
 * - Si el rol del usuario no esta en la lista → HTTP 403 Forbidden.
 *
 * Soporta tanto PlatformRole (SYSTEM_ADMIN, IWANA_SUPPORT) como
 * UserRole (ADMIN, SUPPORT, TECHNICIAN, etc.) del mismo enum base.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (RBAC)
 * RF-RBAC-01 a RF-RBAC-06
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles() declarado → solo requiere estar autenticado (JwtAuthGuard)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los roles: ${requiredRoles.join(', ')}.`,
      );
    }

    return true;
  }
}
