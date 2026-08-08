/**
 * [SEC-REVIEW] S-M01-01 — el guard de alcance limitado compara rutas, no
 * prefijos de cadena.
 *
 * `limitedScope.paths.some((allowed) => requestPath.startsWith(allowed))`
 * aceptaba cualquier ruta que empezara por una permitida. Comprobado contra la
 * API real: `POST /api/v1/auth/change-passwordX` **no fue rechazado por el
 * guard** — devolvió el 404 del router, que dice que hoy no existe tal endpoint,
 * no que el guard lo cubra. Cualquier ruta futura bajo uno de esos prefijos
 * quedaría alcanzable con un token cuya credencial de origen es conocida.
 *
 * Dos redes, deliberadamente redundantes:
 *
 * 1. **Comportamiento, derivado de `LIMITED_SCOPES`.** Los casos no se escriben a
 *    mano: se generan recorriendo todos los alcances declarados y todas sus
 *    rutas. Un alcance nuevo queda cubierto sin tocar este archivo, y volver a
 *    `startsWith` deja en rojo a todos a la vez.
 * 2. **Fuente.** Una afirmación sobre el texto del guard, porque la primera red
 *    solo protege lo que hoy está declarado. Si alguien resuelve un conflicto de
 *    merge devolviendo el `startsWith` a secas, esta cae aunque el mapa de
 *    alcances haya cambiado de forma.
 *
 * Sin PII ni credenciales: el payload es un JWT ficticio mínimo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

type LimitedScopeMap = Record<string, { paths: readonly string[]; message: string }>;

/** Los alcances declarados por el guard, leídos de su propia fuente de verdad. */
const LIMITED_SCOPES = (JwtAuthGuard as unknown as { LIMITED_SCOPES: LimitedScopeMap })
  .LIMITED_SCOPES;

/** Construye un ExecutionContext HTTP mínimo con la ruta pedida. */
function contextoConRuta(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, url: path }),
    }),
  } as unknown as ExecutionContext;
}

function tokenConAlcance(scope: string): JwtPayload {
  return { sub: 'usuario-ficticio', scope } as unknown as JwtPayload;
}

describe('JwtAuthGuard — coincidencia de ruta para tokens de alcance limitado', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(new Reflector());
  });

  function autorizar(scope: string, path: string): JwtPayload {
    const token = tokenConAlcance(scope);
    return guard.handleRequest(null, token, null, contextoConRuta(path));
  }

  it('el guard declara al menos un alcance limitado', () => {
    // Si el mapa se vacía o cambia de nombre, los casos derivados de abajo se
    // quedarían en cero y la suite pasaría sin comprobar nada.
    expect(Object.keys(LIMITED_SCOPES).length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Red 1 — comportamiento, para cada alcance y cada ruta declarada
  // ---------------------------------------------------------------------------

  const casos = Object.entries(LIMITED_SCOPES).flatMap(([scope, { paths }]) =>
    paths.map((path) => ({ scope, path })),
  );

  describe.each(casos)('alcance $scope sobre $path', ({ scope, path }) => {
    it('acepta la ruta exacta', () => {
      expect(autorizar(scope, path)).toMatchObject({ scope });
    });

    it('acepta un descendiente real', () => {
      expect(autorizar(scope, `${path}/detalle`)).toMatchObject({ scope });
    });

    // El defecto: prefijo de cadena, no de ruta.
    it.each(['X', '-admin', '.json'])('rechaza la ruta con el sufijo pegado "%s"', (sufijo) => {
      expect(() => autorizar(scope, `${path}${sufijo}`)).toThrow(ForbiddenException);
    });

    it('rechaza una ruta sin relacion con el alcance', () => {
      expect(() => autorizar(scope, '/api/v1/users')).toThrow(ForbiddenException);
    });
  });

  it('un alcance no puede alcanzar las rutas de otro', () => {
    const alcances = Object.keys(LIMITED_SCOPES);

    for (const scope of alcances) {
      for (const otro of alcances) {
        if (otro === scope) continue;

        for (const ajena of LIMITED_SCOPES[otro]?.paths ?? []) {
          expect(() => autorizar(scope, ajena)).toThrow(ForbiddenException);
        }
      }
    }
  });

  it('no aplica la restriccion a tokens sin scope limitado', () => {
    const tokenCompleto = { sub: 'usuario-ficticio' } as unknown as JwtPayload;

    expect(guard.handleRequest(null, tokenCompleto, null, contextoConRuta('/api/v1/users'))).toBe(
      tokenCompleto,
    );
  });

  // ---------------------------------------------------------------------------
  // Red 2 — fuente: `startsWith` a secas no puede volver al guard
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
