/**
 * Respuesta del endpoint POST /api/v1/auth/login.
 *
 * accessToken: JWT RS256 (15 min).
 * mfaRequired: true si el usuario tiene MFA habilitado y no envio totpCode.
 *   En ese caso, el frontend debe solicitar el codigo TOTP antes de continuar.
 *   El token provisional NO da acceso a recursos protegidos hasta confirmar MFA.
 *
 * El refreshToken se emite como cookie httpOnly (Secure, SameSite=Strict, 7 dias).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4.1
 */
export interface AuthResponse {
  accessToken: string;
  mfaRequired?: boolean;
  /**
   * true cuando el usuario tiene rol critico (ADMIN, NOC, ACCOUNTANT) pero no tiene MFA configurado.
   * El accessToken emitido tiene scope='mfa-setup' y solo permite llamar a /auth/mfa/setup y /auth/mfa/verify.
   * No se emite refresh token en este caso.
   */
  mfaSetupRequired?: boolean;
  /**
   * true cuando la cuenta sigue usando la credencial de arranque y debe cambiarla
   * antes de operar. El accessToken emitido tiene scope='password-change' y solo
   * permite llamar a /auth/change-password.
   *
   * Se propaga EXPLICITAMENTE en el controlador: NestJS descarta los campos
   * omitidos al serializar, y un indicador que no llega al cliente deja al
   * usuario entrando sin cambiar nada mientras el backend cree que lo exigio.
   */
  passwordResetRequired?: boolean;
}

/**
 * Respuesta del endpoint POST /api/v1/auth/mfa/setup.
 * Contiene el QR code en base64 y el URI otpauth para el authenticator.
 */
export interface MfaSetupResponse {
  qrCodeBase64: string;
  otpauthUri: string;
}
