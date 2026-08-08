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
 * - Token con scope='password-change' → solo permite POST /auth/change-password.
 *   Cualquier otra ruta, en ambos casos → HTTP 403 Forbidden.
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

  /**
   * Rutas permitidas para tokens con scope='password-change'. Solo esta ruta.
   *
   * Deliberadamente no incluye /auth/me: el indicador de cambio obligatorio
   * viaja en la respuesta del login, asi que el cliente no necesita consultar
   * el perfil para saber que debe cambiar la contrasena. Abrir /auth/me aqui
   * ampliaria el alcance de un token cuya credencial de origen es conocida.
   */
  private static readonly PASSWORD_CHANGE_ALLOWED_PATHS = ['/api/v1/auth/change-password'];

  /**
   * Compara la ruta pedida contra una permitida ([SEC-REVIEW] S-M01-01).
   *
   * `requestPath.startsWith(allowed)` era coincidencia por prefijo de **cadena**,
   * no de ruta: `/api/v1/auth/change-passwordX` la satisfacia. Se comprobo contra
   * la API real y el guard no lo rechazo — lo freno el 404 del router, que es
   * decir que hoy no existe tal endpoint, no que el guard lo cubra. Cualquier ruta
   * futura bajo uno de estos prefijos quedaria alcanzable con un token cuya
   * credencial de origen es conocida.
   *
   * Se acepta la igualdad exacta y los descendientes reales (`allowed + '/'`), que
   * es lo que significa un prefijo de ruta. **No introducir aqui `startsWith` a
   * secas**: `jwt-auth.guard.scope-path-match.spec.ts` recorre todos los alcances
   * declarados en {@link LIMITED_SCOPES} y cae si alguno vuelve a admitir un
   * sufijo pegado.
   */
  private static matchesAllowedPath(requestPath: string, allowed: string): boolean {
    return requestPath === allowed || requestPath.startsWith(`${allowed}/`);
  }

  /** Rutas permitidas por alcance limitado, y el mensaje con el que se rechaza el resto. */
  private static readonly LIMITED_SCOPES: Record<
    'mfa-setup' | 'password-change',
    { paths: readonly string[]; message: string }
  > = {
    'mfa-setup': {
      paths: JwtAuthGuard.MFA_SETUP_ALLOWED_PATHS,
      message: 'Token de alcance limitado. Completa la configuracion de MFA antes de continuar.',
    },
    'password-change': {
      paths: JwtAuthGuard.PASSWORD_CHANGE_ALLOWED_PATHS,
      message: 'Token de alcance limitado. Cambia tu contrasena antes de continuar.',
    },
  };

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

    // Verificar scope limitado: un token con alcance acotado solo alcanza sus rutas.
    const limitedScope = user.scope ? JwtAuthGuard.LIMITED_SCOPES[user.scope] : undefined;

    if (limitedScope) {
      const request = context.switchToHttp().getRequest<{ url: string; path: string }>();
      const requestPath = request.path ?? request.url;
      const isAllowed = limitedScope.paths.some((allowed) =>
        JwtAuthGuard.matchesAllowedPath(requestPath, allowed),
      );

      if (!isAllowed) {
        throw new ForbiddenException(limitedScope.message);
      }
    }

    return user;
  }
}
