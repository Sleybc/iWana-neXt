import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CanActivate } from '@nestjs/common';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { platformAccessCookieName, tenantAccessCookieName } from '../session-cookies.constants';

/**
 * Guard de protección CSRF (ADR-081, condición C-2).
 *
 * Patrón custom-header: exige la cabecera `X-Requested-With` en todo método
 * mutante autenticado por cookie. El navegador no adjunta cabeceras
 * personalizadas en peticiones cross-origin sin pasar por un preflight CORS,
 * que la API rechaza para orígenes fuera de `CORS_ORIGIN` (app.config.ts).
 * `SameSite=Strict` es necesario pero no suficiente (ADR-081, decisión 4).
 *
 * Ámbito ("rutas cookie-autenticadas"), sin estado ni endpoint nuevo:
 * - Rutas `@Public()` quedan exentas: no hay sesión automática que proteger.
 * - Métodos no mutantes (GET/HEAD/OPTIONS) pasan: no cambian estado.
 * - Peticiones con `Authorization: Bearer` pasan: el token viaja en una
 *   cabecera que el navegador no adjunta solo — no hay riesgo CSRF. Durante la
 *   transición los clientes siguen autenticando por Bearer, así que no rompe.
 * - Solo cuando la sesión ES la cookie (access presente y sin Bearer) se exige
 *   la cabecera; una petición cross-site con cookie válida y sin cabecera
 *   recibe 403.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  /** Valor canónico de la cabecera (convención de clientes AJAX). */
  private static readonly CSRF_HEADER = 'x-requested-with';

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const method = (request.method ?? '').toUpperCase();

    if (!CsrfGuard.MUTATING_METHODS.has(method)) {
      return true;
    }

    // Bearer auth: el navegador no adjunta esta cabecera por sí solo.
    if (request.headers.authorization?.startsWith('Bearer ')) {
      return true;
    }

    const cookies = (request.cookies ?? {}) as Record<string, string>;

    if (!cookies[tenantAccessCookieName()] && !cookies[platformAccessCookieName()]) {
      return true;
    }

    if (request.headers[CsrfGuard.CSRF_HEADER]) {
      return true;
    }

    throw new ForbiddenException(
      'Petición rechazada por protección CSRF: falta la cabecera X-Requested-With.',
    );
  }
}
