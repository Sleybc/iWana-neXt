/**
 * S-M01-01 — el guard de scope limitado compara rutas, no prefijos de cadena.
 *
 * `MFA_SETUP_ALLOWED_PATHS.some((allowed) => requestPath.startsWith(allowed))`
 * aceptaba cualquier ruta que empezara por una permitida: `/auth/mfa/setupX`
 * pasaba el guard. Hoy no existe tal endpoint y el 404 del router tapaba el
 * hueco, pero el guard no puede depender de que el router no exista.
 *
 * Además del comportamiento, se afirma sobre la **fuente** del guard. La razón es
 * un merge concreto: la rama de MOD01 refactoriza este mismo bloque a un mapa
 * `LIMITED_SCOPES` y añade un segundo alcance (`password-change`). Al resolver ese
 * conflicto, volver al `startsWith` a secas reintroduciría el defecto con los
 * tests de ambas ramas en verde, porque cada uno prueba solo su mitad. La
 * afirmación sobre la fuente sobrevive a la resolución del conflicto: caiga el
 * lado que caiga, `startsWith(allowed)` no puede volver al guard.
 *
 * Sin PII ni credenciales: el payload es un JWT ficticio mínimo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  // ---------------------------------------------------------------------------
  // Red sobre la fuente: `startsWith` a secas no puede volver al guard
  // ---------------------------------------------------------------------------

  describe('la fuente del guard no compara por prefijo de cadena', () => {
    /**
     * Solo el código: los comentarios del guard citan literalmente la forma
     * defectuosa para explicar por qué se descartó, y compararlos daría un rojo
     * falso. Un rojo falso es peor que ninguna red — invita a relajar la
     * afirmación hasta dejarla sin fuerza.
     */
    const fuente = readFileSync(join(__dirname, 'jwt-auth.guard.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    it('no invoca startsWith con la ruta permitida sin delimitar', () => {
      // Se prohíbe `startsWith(allowed)`. El `startsWith` con el delimitador
      // añadido, dentro de matchesAllowedPath, es la forma correcta y no empareja.
      expect(fuente).not.toMatch(/startsWith\(\s*allowed\s*\)/);
    });

    it('la comparacion de rutas pasa por matchesAllowedPath', () => {
      expect(fuente).toMatch(/\.some\(\s*\(allowed\)\s*=>\s*[\s\S]{0,80}matchesAllowedPath/);
    });
  });
});
