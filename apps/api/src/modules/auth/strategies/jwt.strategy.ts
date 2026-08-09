import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import Redis from 'ioredis';
import { Strategy } from 'passport-jwt';
import { REDIS_CLIENT } from '../../redis/redis.module';
import {
  JWT_ACCEPTED_AUDIENCES,
  JWT_ACCEPTED_ISSUERS,
  JWT_CLAIMS_BY_TOKEN_TYPE,
} from '../auth.constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { platformAccessCookieName, tenantAccessCookieName } from '../session-cookies.constants';

/**
 * Estrategia JWT RS256 para Passport.
 *
 * Extrae el access token de la cabecera `Authorization` o de la cookie de
 * access por audiencia (ADR-081, C-1) y lo valida.
 * Usa la clave publica RSA (jwt-public.pem) para verificar la firma.
 *
 * Verificaciones aplicadas, en orden:
 * 1. Firma RS256 + expiracion.
 * 2. `iss` y `aud` dentro de los pares emitidos por la plataforma.
 * 3. Coherencia entre el par (`iss`, `aud`) y el claim `type` — impide que un
 *    token de tenant se presente como token de plataforma (H-01). Ambos se
 *    firman con la misma clave RSA, asi que esta es la frontera criptografica
 *    entre las dos audiencias.
 * 4. JTI fuera de la blacklist de Redis (tokens revocados por logout o cambio
 *    de contrasena).
 *
 * Clave de blacklist Redis: `jti:blacklist:<jti>` con TTL = tiempo restante del token.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 5 (JWT RS256)
 * RF-AUTH-05 (revocacion inmediata via JTI blacklist)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: JwtStrategy.extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
      issuer: JWT_ACCEPTED_ISSUERS,
      audience: JWT_ACCEPTED_AUDIENCES,
    });
  }

  /**
   * Fuentes del access token, en orden (ADR-081, C-1):
   *
   * 1. Cabecera `Authorization: Bearer` — sigue operativa durante la transición.
   * 2. Cookie de access por audiencia (`portalAccessToken` / `webAccessToken`,
   *    `__Host-` en producción) — el navegador la adjunta sola, httpOnly.
   *
   * La coherencia (`iss`, `aud`) ↔ `type` la verifica `validate()`, de modo que
   * leer ambas cookies no abre la frontera de audiencias (ADR-061).
   */
  private static extractAccessToken(req: Request): string | null {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const bearerToken = authHeader.slice('Bearer '.length).trim();
      if (bearerToken) {
        return bearerToken;
      }
    }

    const cookies = (req.cookies ?? {}) as Record<string, string>;
    return cookies[tenantAccessCookieName()] ?? cookies[platformAccessCookieName()] ?? null;
  }

  /**
   * Valida el payload del JWT decodificado.
   * Retorna el payload completo que queda en req.user.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // El par (iss, aud) debe corresponder exactamente al tipo declarado en el token.
    const expected = JWT_CLAIMS_BY_TOKEN_TYPE[payload.type];
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    if (!expected || payload.iss !== expected.issuer || !audiences.includes(expected.audience)) {
      throw new UnauthorizedException('El token no es valido para esta superficie.');
    }

    // Verificar blacklist de tokens revocados (logout, cambio de password, etc.)
    const revoked = await this.redis.get(`jti:blacklist:${payload.jti}`);
    if (revoked) {
      throw new UnauthorizedException('El token ha sido revocado.');
    }

    return payload;
  }
}
