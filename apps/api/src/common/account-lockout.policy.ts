/**
 * Contador de fallos por cuenta para endpoints que validan `currentPassword`
 * (P-09, Ola 2). Espeja los umbrales del login (`auth.service.ts`):
 * 5 intentos consecutivos activan lockout de 15 minutos.
 *
 * Vive en `common` para no cruzar boundaries: `UsersModule` no puede importar
 * de `AuthModule` (ni al reves en este caso) solo por dos constantes.
 */

/** Intentos fallidos maximos antes del lockout. */
export const ACCOUNT_LOCKOUT_MAX_ATTEMPTS = 5;

/** Duracion del lockout en segundos (15 minutos). */
export const ACCOUNT_LOCKOUT_DURATION_SECONDS = 15 * 60;

/** Forma minima que un verificador de password necesita del usuario. */
export interface AccountLockoutState {
  failedLoginAttempts: number | null;
  lockedUntil: Date | string | null;
}

/** true cuando la cuenta sigue dentro de la ventana de lockout. */
export function isAccountLocked(user: AccountLockoutState, now: Date = new Date()): boolean {
  if (!user.lockedUntil) return false;
  const lockedUntil =
    user.lockedUntil instanceof Date ? user.lockedUntil : new Date(user.lockedUntil);
  return lockedUntil > now;
}

/** Minutos restantes de lockout, redondeados hacia arriba (mensaje al usuario). */
export function remainingLockoutMinutes(user: AccountLockoutState, now: Date = new Date()): number {
  if (!user.lockedUntil) return 0;
  const lockedUntil =
    user.lockedUntil instanceof Date ? user.lockedUntil : new Date(user.lockedUntil);
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
}

/**
 * Calcula la actualizacion de persistencia tras un intento fallido.
 * Activa `lockedUntil` al alcanzar el umbral. No audita: el llamador decide
 * el evento (LOGIN_FAILED / ACCOUNT_LOCKED) segun su contexto.
 */
export function nextFailedAttemptUpdate(user: AccountLockoutState): {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
} {
  const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
  return {
    failedLoginAttempts: newAttempts,
    lockedUntil:
      newAttempts >= ACCOUNT_LOCKOUT_MAX_ATTEMPTS
        ? new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_SECONDS * 1000)
        : null,
  };
}
