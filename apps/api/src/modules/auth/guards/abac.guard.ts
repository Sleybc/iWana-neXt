import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard ABAC (Attribute-Based Access Control).
 *
 * Complementa RolesGuard con restricciones por atributo:
 * valida que el usuario solo pueda operar sobre recursos de su propio tenant.
 *
 * Regla principal:
 * - Un usuario de tipo 'tenant' SOLO puede acceder a recursos del tenant
 *   declarado en su JWT (tenantId == recurso.tenantId).
 * - Un usuario de tipo 'platform' (SYSTEM_ADMIN, IWANA_SUPPORT) puede
 *   acceder a todos los tenants sin restriccion de ownership.
 *
 * Implementacion actual: valida que el tenantId del JWT coincida con
 * el tenantId presente en req.params o req.body cuando aplique.
 * Modulos futuros pueden extender este guard para restricciones mas finas.
 *
 * NOTA: Este guard es opt-in por modulo. No todas las rutas lo requieren.
 * Usar solo donde haya riesgo real de cross-tenant data leakage.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (ABAC)
 * RF-RBAC-04 (ADMIN no puede operar sobre ADMIN de otro tenant)
 */
@Injectable()
export class AbacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload; params: Record<string, string>; body: Record<string, unknown> }>();

    const user = request.user;

    // Usuarios de plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) tienen acceso total
    if (user.type === 'platform') {
      return true;
    }

    // Usuarios de tenant: verificar que no operen fuera de su tenant
    const requestedTenantId =
      (request.params['tenantId'] as string | undefined) ??
      (request.body?.['tenantId'] as string | undefined);

    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException(
        'No tienes permiso para operar sobre recursos de otro tenant.',
      );
    }

    return true;
  }
}
