import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para RolesGuard.
 * Se usa para leer los roles requeridos en el guard.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorador @Roles(...roles).
 * Define que roles del sistema pueden acceder al endpoint.
 * Se evalua en RolesGuard despues de JwtAuthGuard.
 *
 * Uso:
 *   @Roles(PlatformRole.SYSTEM_ADMIN)
 *   @Roles(UserRole.ADMIN, UserRole.SUPPORT)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (RBAC)
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
