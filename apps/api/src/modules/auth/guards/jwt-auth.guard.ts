import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard de autenticacion JWT RS256.
 *
 * Es el primer guard de autorizacion en el pipeline (despues de rate limiter y TLS).
 * Valida el access token JWT en formato Bearer del header Authorization.
 *
 * Comportamiento:
 * - Endpoint marcado con @Public() → permite el paso sin validar JWT.
 * - Endpoint sin @Public() → require Bearer token valido.
 * - Token expirado o invalido → HTTP 401 Unauthorized.
 *
 * Pipeline de seguridad (HLD Seccion 2):
 *   Rate Limiter → TLS → JwtAuthGuard → TenantMiddleware → RolesGuard → AbacGuard
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (guards)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Verificar si el endpoint esta marcado como publico
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Token de acceso invalido o expirado.');
    }
    return user;
  }
}
