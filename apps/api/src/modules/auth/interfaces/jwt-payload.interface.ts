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
  iat?: number;
  exp?: number;
}
