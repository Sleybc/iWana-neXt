/**
 * S-M01-01 — el guard de scope limitado compara rutas, no prefijos de cadena.
 *
 * `MFA_SETUP_ALLOWED_PATHS.some((allowed) => requestPath.startsWith(allowed))`
 * aceptaba cualquier ruta que empezara por una permitida: `/auth/mfa/setupX`
 * pasaba el guard. Hoy no existe tal endpoint y el 404 del router tapaba el
 * hueco, pero el guard no puede depender de que el router no exista.
 *
 * Sin PII ni credenciales: el payload es un JWT ficticio mínimo.
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

/** Construye un ExecutionContext HTTP mínimo con la ruta pedida. */
function contextoConRuta(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, url: path }),
    }),
  } as unknown as ExecutionContext;
}

const TOKEN_ALCANCE_MFA = {
  sub: 'usuario-ficticio',
  scope: 'mfa-setup',
} as unknown as JwtPayload;

describe('JwtAuthGuard — coincidencia de ruta para tokens de alcance limitado', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(new Reflector());
  });

  function autorizar(path: string): JwtPayload {
    return guard.handleRequest(null, TOKEN_ALCANCE_MFA, null, contextoConRuta(path));
  }

  describe('rutas permitidas', () => {
    it.each(['/api/v1/auth/mfa/setup', '/api/v1/auth/mfa/verify'])('acepta %s', (path) => {
      expect(autorizar(path)).toBe(TOKEN_ALCANCE_MFA);
    });

    it('acepta un descendiente real de una ruta permitida', () => {
      expect(autorizar('/api/v1/auth/mfa/setup/qr')).toBe(TOKEN_ALCANCE_MFA);
    });
  });

  describe('rutas rechazadas', () => {
    // El defecto: prefijo de cadena, no de ruta.
    it.each([
      '/api/v1/auth/mfa/setupX',
      '/api/v1/auth/mfa/setup-admin',
      '/api/v1/auth/mfa/verifyY',
    ])('rechaza %s aunque comparta prefijo de cadena', (path) => {
      expect(() => autorizar(path)).toThrow(ForbiddenException);
    });

    it('rechaza una ruta sin relacion con el alcance', () => {
      expect(() => autorizar('/api/v1/users')).toThrow(ForbiddenException);
    });
  });

  it('no aplica la restriccion a tokens sin scope limitado', () => {
    const tokenCompleto = { sub: 'usuario-ficticio' } as unknown as JwtPayload;

    expect(guard.handleRequest(null, tokenCompleto, null, contextoConRuta('/api/v1/users'))).toBe(
      tokenCompleto,
    );
  });
});
