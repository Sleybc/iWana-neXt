import { UnauthorizedException } from '@nestjs/common';

/** Códigos estables de los 401 de autenticación; no dicen más que el mensaje que acompañan. */
export const AUTH_ERROR_CODES = {
  SESSION_NOT_CURRENT: 'AUTH_SESSION_NOT_CURRENT',
  MFA_SETUP_NOT_PENDING: 'AUTH_MFA_SETUP_NOT_PENDING',
  MFA_CODE_INVALID: 'AUTH_MFA_CODE_INVALID',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/** Añade `code` al cuerpo que Nest ya entregaba (`statusCode`, `error` y `message` no cambian). */
export function unauthorizedWithCode(code: AuthErrorCode, message: string): UnauthorizedException {
  return new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', code, message });
}
