import { UserRole } from '@iwana/shared';

/**
 * Reglas del alta de usuarios compartidas por el alta manual (`UsersService.create`) y el alta
 * de usuarios importados desde UISP (ADR-110 D15): una sola fuente para el costo del hash y el
 * valor por defecto de «recurso operativo».
 */

/** Iteraciones bcrypt para hashes de contraseña de usuarios creados por un administrador. */
export const USER_PASSWORD_BCRYPT_ROUNDS = 12;

/** Recurso operativo por defecto según el rol (Programación): técnicos y contratistas. */
export function defaultOperationalResourceForRole(role: UserRole): boolean {
  return role === UserRole.TECHNICIAN || role === UserRole.CONTRACTOR;
}
