import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guarda estructural: los mocks de `useRouter`, `useAuth` y `usePermissions` no
 * pueden devolver un literal nuevo en cada llamada.
 *
 * Por qué existe: los hooks reales devuelven la misma identidad entre renders.
 * Un mock `useRouter: () => ({ push, replace })` crea un objeto nuevo por render;
 * `useTableQueryState` y `loadPage` lo tienen en sus dependencias, así que cada
 * render relanzaba la carga de la lista en bucle (44 llamadas a `tickets.list`
 * en una sola prueba, 3 con mocks estables). Esa CPU y el pager deshabilitado
 * durante cada recarga produjeron dos flakes en CI: «Unable to find role="option"»
 * (run 41805430065, AssuranceClient) y «Unable to find … Proveedor P2 0»
 * (run 42298936387, SuppliersPanel).
 *
 * Forma correcta: referencia estable a nivel de módulo (`const mockRouter = …`)
 * o memoización perezosa `(() => { let x; return () => (x ??= {…}); })()` — el
 * factory de `jest.mock` se hoistea, por eso la construcción debe ser perezosa.
 *
 * Exención: si el valor depende de estado mutable que cambia por prueba, el spec
 * declara el comentario `ctx-inestable-intencional` con su motivo.
 */

const SRC_ROOT = join(__dirname, '..');
const EXEMPT_MARKER = 'ctx-inestable-intencional';
const UNSTABLE_LITERAL = /\b(useRouter|useAuth|usePermissions):\s*\(\)\s*=>\s*\(\{/;

function* walkSpecs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkSpecs(full);
    } else if (full.endsWith('.spec.tsx')) {
      yield full;
    }
  }
}

describe('mocks de contexto estables (hooks de router, auth y permisos)', () => {
  it('ningún spec devuelve un literal nuevo por render sin exención explícita', () => {
    const offenders: string[] = [];
    for (const file of walkSpecs(SRC_ROOT)) {
      const source = readFileSync(file, 'utf8');
      if (UNSTABLE_LITERAL.test(source) && !source.includes(EXEMPT_MARKER)) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
