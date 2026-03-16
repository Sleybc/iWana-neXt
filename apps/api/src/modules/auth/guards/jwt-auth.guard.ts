import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

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
 * - Token con scope='mfa-setup' → solo permite POST /auth/mfa/setup y POST /auth/mfa/verify.
 *   Cualquier otra ruta → HTTP 403 Forbidden.
 *
 * Pipeline de seguridad (HLD Seccion 2):
 *   Rate Limiter → TLS → JwtAuthGuard → TenantMiddleware → RolesGuard → AbacGuard
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (guards)
 * HLD-MOD02-ARQUITECTURA-v1.0 §2.2 — Scope check para token mfa-setup (DA-MOD02-01)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /** Rutas permitidas para tokens con scope='mfa-setup'. Solo estas rutas. */
  private static readonly MFA_SETUP_ALLOWED_PATHS = [
    '/api/v1/auth/mfa/setup',
    '/api/v1/auth/mfa/verify',
  ];

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

  handleRequest<TUser extends JwtPayload>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Token de acceso invalido o expirado.');
    }

    // Verificar scope limitado: tokens con scope='mfa-setup' solo pueden acceder a rutas MFA
    if (user.scope === 'mfa-setup') {
      const request = context.switchToHttp().getRequest<{ url: string; path: string }>();
      const requestPath = request.path ?? request.url;
      const isAllowed = JwtAuthGuard.MFA_SETUP_ALLOWED_PATHS.some((allowed) =>
        requestPath.startsWith(allowed),
      );
      if (!isAllowed) {
        throw new ForbiddenException(
          'Token de alcance limitado. Completa la configuracion de MFA antes de continuar.',
        );
      }
    }

    return user;
  }
}
