import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import Redis from 'ioredis';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Estrategia JWT RS256 para Passport.
 *
 * Valida el access token Bearer en el header Authorization.
 * Usa la clave publica RSA (jwt-public.pem) para verificar la firma.
 *
 * Adicionalmente, verifica que el JTI del token NO este en la blacklist
 * de Redis (tokens revocados por logout o cambio de contrasena).
 *
 * Si el token es valido y el JTI no esta bloqueado, el payload queda
 * disponible en req.user para el resto del pipeline.
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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
    });
  }

  /**
   * Valida el payload del JWT decodificado.
   * Si el JTI esta en la blacklist Redis, el token fue revocado (logout).
   * Retorna el payload completo que queda en req.user.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Verificar blacklist de tokens revocados (logout, cambio de password, etc.)
    const revoked = await this.redis.get(`jti:blacklist:${payload.jti}`);
    if (revoked) {
      throw new UnauthorizedException('El token ha sido revocado.');
    }

    return payload;
  }
}
