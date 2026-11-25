import type { ApiError } from './api-client';

/** Códigos de los 401 de autenticación. Espejo de `AUTH_ERROR_CODES` de la API. */
export const AUTH_ERROR_CODES = {
  SESSION_NOT_CURRENT: 'AUTH_SESSION_NOT_CURRENT',
  MFA_SETUP_NOT_PENDING: 'AUTH_MFA_SETUP_NOT_PENDING',
  MFA_CODE_INVALID: 'AUTH_MFA_CODE_INVALID',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
} as const;

/** Lo emite el propio portal cuando ya no conserva el token de configuración. */
export const MFA_SETUP_TOKEN_MISSING = 'MFA_SETUP_TOKEN_MISSING';

/** Lo emite el propio portal si el servidor vuelve a pedir el código. */
const MFA_CODE_REQUESTED_AGAIN = 'MFA_CODE_INVALID';

/** Motivo visible de un 401 al ingresar con el código de verificación. */
export function mfaLoginUnauthorizedMessage(error: ApiError): string {
  switch (error.code) {
    case AUTH_ERROR_CODES.ACCOUNT_LOCKED:
      // El mensaje del servidor dice cuánto falta.
      return error.message;
    case AUTH_ERROR_CODES.MFA_CODE_INVALID:
    case MFA_CODE_REQUESTED_AGAIN:
      return 'Código incorrecto. Intenta de nuevo.';
    default:
      // Sin código no se sabe qué falló: no se afirma que sea el código.
      return 'No fue posible verificar tu ingreso. Revisa el código o inicia sesión de nuevo.';
  }
}
