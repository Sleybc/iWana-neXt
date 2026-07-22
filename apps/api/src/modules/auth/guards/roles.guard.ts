import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPlatformOnlyRole } from '@iwana/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard RBAC (Role-Based Access Control) con frontera de tipo de token.
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
 * FRONTERA DE TIPO DE TOKEN (H-01):
 * `PlatformRole` y `UserRole` compartian los literales `'SYSTEM_ADMIN'` e
 * `'IWANA_SUPPORT'`, asi que comparar solo el string permitia que un token de
 * tenant con `role: 'SYSTEM_ADMIN'` satisficiera un `@Roles(PlatformRole.…)` y
 * alcanzara la consola de plataforma. ADR-061 §4 los saco de `UserRole`, pero
 * eso solo separa los TIPOS: el claim `role` que llega aqui es un `string` y no
 * arrastra su enum de origen. Por eso, ademas de coincidir el rol, la
 * procedencia debe coincidir con el tipo de token:
 * - rol de plataforma (`PLATFORM_ONLY_ROLES`) → exige `jwt.type === 'platform'`
 * - rol de tenant → exige `jwt.type === 'tenant'`
 *
 * La comprobacion vive aqui —y no en un guard aplicado ruta por ruta— para
 * cerrar la clase entera de fallo: cualquier ruta futura que declare un rol de
 * plataforma queda cubierta sin que nadie tenga que acordarse.
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

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los roles: ${requiredRoles.join(', ')}.`,
      );
    }

    // El rol coincide: verificar que la procedencia del rol case con el tipo de token.
    const requiresPlatformToken = isPlatformOnlyRole(user.role);
    const isPlatformToken = user.type === 'platform';

    if (requiresPlatformToken !== isPlatformToken) {
      // Mensaje deliberadamente generico: no revelar la razon exacta del rechazo.
      throw new ForbiddenException('Acceso denegado. El token no habilita este recurso.');
    }

    return true;
  }
}
