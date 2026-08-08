import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Alcance de los tokens acotados (MOD01 §3.4 y MOD02 DA-MOD02-01).
 *
 * El indicador de la respuesta del login es una senal; la frontera real es este
 * guard. Si un token con scope='password-change' alcanzase cualquier ruta de la
 * consola, la credencial de arranque —conocida por diseno— seria una sesion
 * util, y el cambio forzado quedaria en decoracion.
 */

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'platform-uuid-1',
    email: 'hash-sha256',
    role: 'system_admin',
    tenantId: null,
    schemaName: null,
    jti: 'jti-scope-test',
    type: 'platform',
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

function contextForPath(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ path, url: path }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function runGuard(payload: JwtPayload, path: string): JwtPayload {
  const guard = new JwtAuthGuard(new Reflector());
  return guard.handleRequest(null, payload, undefined, contextForPath(path));
}

describe('JwtAuthGuard — alcance de los tokens acotados', () => {
  describe("scope='password-change' (primer ingreso de plataforma)", () => {
    const scoped = buildPayload({ scope: 'password-change', passwordResetRequired: true });

    it('permite POST /api/v1/auth/change-password', () => {
      expect(runGuard(scoped, '/api/v1/auth/change-password')).toBe(scoped);
    });

    it.each([
      '/api/v1/auth/me',
      '/api/v1/tenants',
      '/api/v1/platform-users',
      '/api/v1/platform-users/me/change-password',
      '/api/v1/audit-logs',
      '/api/v1/search',
      '/api/v1/auth/mfa/setup',
      '/api/v1/auth/mfa/verify',
    ])('rechaza %s con 403', (path) => {
      expect(() => runGuard(scoped, path)).toThrow(ForbiddenException);
    });

    it('el mensaje de rechazo dice que hay que cambiar la contrasena', () => {
      expect(() => runGuard(scoped, '/api/v1/tenants')).toThrow(
        'Token de alcance limitado. Cambia tu contrasena antes de continuar.',
      );
    });

    it('no alcanza /auth/me: el indicador viaja en la respuesta del login', () => {
      // Abrir /auth/me aqui ampliaria el alcance de un token cuya credencial de
      // origen es publica, y no hace falta: el login ya devuelve el indicador.
      expect(() => runGuard(scoped, '/api/v1/auth/me')).toThrow(ForbiddenException);
    });
  });

  describe("scope='mfa-setup' (sin regresion)", () => {
    const scoped = buildPayload({ scope: 'mfa-setup', type: 'tenant', schemaName: 'tenant_x' });

    it.each(['/api/v1/auth/mfa/setup', '/api/v1/auth/mfa/verify'])('permite %s', (path) => {
      expect(runGuard(scoped, path)).toBe(scoped);
    });

    it('sigue rechazando el cambio de contrasena y el resto de la consola', () => {
      expect(() => runGuard(scoped, '/api/v1/auth/change-password')).toThrow(ForbiddenException);
      expect(() => runGuard(scoped, '/api/v1/tenants')).toThrow(
        'Token de alcance limitado. Completa la configuracion de MFA antes de continuar.',
      );
    });
  });

  describe('token completo (sin scope)', () => {
    const full = buildPayload();

    it.each(['/api/v1/auth/me', '/api/v1/tenants', '/api/v1/auth/change-password'])(
      'no restringe %s',
      (path) => {
        expect(runGuard(full, path)).toBe(full);
      },
    );
  });

  it('sigue exigiendo un usuario resuelto: sin payload responde 401', () => {
    const guard = new JwtAuthGuard(new Reflector());

    expect(() =>
      guard.handleRequest(null, undefined as never, undefined, contextForPath('/api/v1/auth/me')),
    ).toThrow('Token de acceso invalido o expirado.');
  });
});
