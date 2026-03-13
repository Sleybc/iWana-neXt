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
}

/**
 * Respuesta del endpoint POST /api/v1/auth/mfa/setup.
 * Contiene el QR code en base64 y el URI otpauth para el authenticator.
 */
export interface MfaSetupResponse {
  qrCodeBase64: string;
  otpauthUri: string;
}
