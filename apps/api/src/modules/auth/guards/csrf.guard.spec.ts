import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { tenantAccessCookieName } from '../session-cookies.constants';
import { CsrfGuard } from './csrf.guard';

function buildRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    headers: {},
    cookies: {},
    ...overrides,
  } as Request;
}

function contextFor(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardFor(request: Request, isPublic = false): CsrfGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  return new CsrfGuard(reflector);
}

const COOKIE_SESSION = { [tenantAccessCookieName()]: 'synthetic.cookie.jwt.token' };

/**
 * Protección CSRF (ADR-081, C-2) — patrón custom-header.
 *
 * El test que bloquea el merge es el negativo: petición mutante con cookie de
 * sesión válida y sin `X-Requested-With` debe recibir 403. `SameSite=Strict`
 * mitiga, pero un sitio del mismo sitio de nivel superior (subdominio) aún
 * podría emitir mutaciones cross-site; la cabecera cierra ese hueco.
 */
describe('CsrfGuard — custom-header X-Requested-With (ADR-081 C-2)', () => {
  it('TEST NEGATIVO: rechaza con 403 una petición mutante con cookie válida y sin X-Requested-With', () => {
    const request = buildRequest({ cookies: { ...COOKIE_SESSION } });

    expect(() => guardFor(request).canActivate(contextFor(request))).toThrow(ForbiddenException);
  });

  it('permite una petición mutante con cookie válida y X-Requested-With presente', () => {
    const request = buildRequest({
      cookies: { ...COOKIE_SESSION },
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    });

    expect(guardFor(request).canActivate(contextFor(request))).toBe(true);
  });

  it('permite mutantes autenticados por Bearer aunque exista cookie (sin riesgo CSRF)', () => {
    const request = buildRequest({
      cookies: { ...COOKIE_SESSION },
      headers: { authorization: 'Bearer synthetic.bearer.token' },
    });

    expect(guardFor(request).canActivate(contextFor(request))).toBe(true);
  });

  it('permite GET con cookie aunque no lleve la cabecera (no muta estado)', () => {
    const request = buildRequest({ method: 'GET', cookies: { ...COOKIE_SESSION } });

    expect(guardFor(request).canActivate(contextFor(request))).toBe(true);
  });

  it('permite mutantes sin cookie de sesión (no hay sesión por cookie que proteger)', () => {
    const request = buildRequest();

    expect(guardFor(request).canActivate(contextFor(request))).toBe(true);
  });

  it('exime las rutas @Public() aunque la petición traiga cookie', () => {
    const request = buildRequest({ cookies: { ...COOKIE_SESSION } });

    expect(guardFor(request, true).canActivate(contextFor(request))).toBe(true);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('exige la cabecera también en %s', (method) => {
    const request = buildRequest({ method, cookies: { ...COOKIE_SESSION } });

    expect(() => guardFor(request).canActivate(contextFor(request))).toThrow(ForbiddenException);
  });
});
