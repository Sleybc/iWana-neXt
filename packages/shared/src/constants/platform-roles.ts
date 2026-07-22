import { PlatformRole } from '../enums/platform-role.enum';
import { UserRole } from '../enums/user-role.enum';

/**
 * Frontera de procedencia de roles.
 *
 * `PlatformRole` y `UserRole` comparten los literales `SYSTEM_ADMIN` e
 * `IWANA_SUPPORT`, asi que en tiempo de ejecucion un rol es solo un string y
 * NO es posible deducir de que enum provino. Este conjunto es la unica fuente
 * de verdad que declara, explicitamente, que roles solo pueden ejercerse con
 * un token de plataforma (`jwt.type === 'platform'`).
 *
 * Se deriva de los valores de `PlatformRole` para que no pueda desincronizarse
 * si el enum crece.
 *
 * Consumido por `RolesGuard` (apps/api) para exigir el tipo de token correcto
 * y por `UsersService` para impedir que el CRUD de un tenant asigne un rol de
 * plataforma a un usuario de tenant.
 */
export const PLATFORM_ONLY_ROLES: ReadonlySet<string> = new Set<string>(
  Object.values(PlatformRole),
);

/** ¿El rol solo puede ejercerse con un token de plataforma? */
export function isPlatformOnlyRole(role: string): boolean {
  return PLATFORM_ONLY_ROLES.has(role);
}

/**
 * Roles que el CRUD de usuarios de un tenant puede asignar.
 *
 * Es `UserRole` menos los roles de plataforma. Que `SYSTEM_ADMIN` e
 * `IWANA_SUPPORT` sigan siendo miembros de `UserRole` es deuda estructural
 * conocida: sacarlos del enum exige migracion de datos y ADR aprobado. Hasta
 * entonces, esta lista es la frontera que impide asignarlos desde el tenant.
 */
export const TENANT_ASSIGNABLE_ROLES: readonly UserRole[] = Object.values(UserRole).filter(
  (role) => !isPlatformOnlyRole(role),
);

/** ¿El rol puede asignarse a un usuario desde el modulo de usuarios del tenant? */
export function isTenantAssignableRole(role: string): boolean {
  return !isPlatformOnlyRole(role);
}
