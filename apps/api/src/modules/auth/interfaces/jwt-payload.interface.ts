/**
 * Payload del JWT RS256 emitido por iWana neXt.
 *
 * sub: UUID del usuario (User o PlatformUser).
 * email: email hash SHA-256 (nunca email plano en token).
 * role: rol del usuario en el sistema.
 * tenantId: UUID del tenant al que pertenece el usuario (null para plataforma).
 * schemaName: nombre del schema PostgreSQL del tenant (null para plataforma).
 * jti: JWT ID unico para blacklist de revocacion en Redis.
 * type: distingue tokens de usuario vs plataforma.
 * iat / exp: emitidos automaticamente por @nestjs/jwt.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (JWT RS256)
 */
export interface JwtPayload {
  sub: string;
  email: string; // hash SHA-256 — nunca email plano
  role: string;
  tenantId: string | null;
  schemaName: string | null;
  jti: string;
  type: 'platform' | 'tenant';
  /** Indica si el usuario debe cambiar su contrasena en el siguiente ingreso (primer acceso con credenciales temporales) */
  passwordResetRequired?: boolean;
  /**
   * Alcance del token. Ausente o undefined = token completo sin restricciones de ruta.
   *
   * - 'mfa-setup': solo POST /auth/mfa/setup y POST /auth/mfa/verify.
   * - 'password-change': solo POST /auth/change-password. Lo emite el login de
   *   plataforma cuando la cuenta sigue con la credencial de arranque
   *   (`passwordResetRequired`), de modo que el token no abra la consola.
   */
  scope?: 'mfa-setup' | 'password-change';
  /**
   * Emisor y audiencia. Diferencian criptograficamente los tokens de plataforma
   * de los de tenant (ver auth.constants.ts). Los emite @nestjs/jwt al firmar.
   */
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}
