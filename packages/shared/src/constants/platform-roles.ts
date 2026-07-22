import { PlatformRole } from '../enums/platform-role.enum';
import { UserRole } from '../enums/user-role.enum';

/**
 * Frontera de procedencia de roles (ADR-061 §2 y §4).
 *
 * Tras ADR-061 §4 los dos dominios ya NO comparten literales a nivel de tipo:
 * `SYSTEM_ADMIN` e `IWANA_SUPPORT` salieron de `UserRole` y viven solo en
 * `PlatformRole`. Aun asi estos conjuntos siguen siendo necesarios, y por la
 * razon original: **en tiempo de ejecucion un rol es solo un string**. El claim
 * `role` de un JWT (`JwtPayload.role: string`), una fila de base de datos o un
 * payload externo no arrastran su enum de origen, asi que la separacion de tipos
 * no puede comprobarse en el limite. Este modulo es donde se comprueba.
 */

/**
 * Roles que solo pueden ejercerse con un token de plataforma
 * (`jwt.type === 'platform'`).
 *
 * Se deriva de `PlatformRole` para que no pueda desincronizarse si el enum crece.
 * Consumido por `RolesGuard` (frontera token↔rol), `AccessControlService` y
 * `VisitRequestsService`.
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
 * Desde ADR-061 §4 equivale a `UserRole` completo: el enum ya no contiene roles
 * de plataforma que hubiera que restar. Se conserva como constante con nombre
 * propio porque es el vocabulario del contrato (`@IsIn` de `CreateUserDto`, enum
 * de OpenAPI, selects del portal), y porque el nombre declara la intencion —
 * «asignable desde un tenant» — que un `Object.values(UserRole)` desnudo no.
 */
export const TENANT_ASSIGNABLE_ROLES: readonly UserRole[] = Object.values(UserRole);

const TENANT_ASSIGNABLE_ROLE_SET: ReadonlySet<string> = new Set<string>(TENANT_ASSIGNABLE_ROLES);

/**
 * ¿El rol puede asignarse a un usuario desde el modulo de usuarios del tenant?
 *
 * Comprueba pertenencia positiva a `UserRole`, no solo ausencia de
 * `PLATFORM_ONLY_ROLES`: la entrada es `string` y un valor desconocido —un rol
 * de plataforma futuro, una cadena arbitraria— debe rechazarse por defecto.
 */
export function isTenantAssignableRole(role: string): boolean {
  return TENANT_ASSIGNABLE_ROLE_SET.has(role);
}
