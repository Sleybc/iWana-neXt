import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Aserción estructural del contrato de capas de superposición del ADR-075
 * `docs/adrs/ADR-075-Contrato-Capas-Z-Portal.md`:
 *
 *   §2 — En código de aplicación (`apps/<app>/src`, `packages/ui/src`) no se
 *        escriben valores de z literales: se usa el token de la capa
 *        semántica (`z-(--z-*)`) que corresponda.
 *   §4 — La norma se exige con una regla estructural ejecutable, con el
 *        molde probado de `aria-busy-contrast.structure.spec.ts`.
 *
 * Por qué TRES detectores (enmienda C-DS-03 del propio ADR, aceptada el
 * 2026-08-04): la emisión literal tiene dos formas y una regla que solo
 * mirara una dejaría pasar la mitad del problema.
 *
 *   D1 — Etiqueta JSX de apertura con clase `fixed` Y una utilidad `z-<n>` /
 *        `z-[<n>]`: capa de viewport posicionada con literal. Siempre es
 *        violación, sea cual sea el número.
 *
 *        Límite conocido frente a §2ter: un `fixed` bajo un ancestro que ya
 *        crea contexto de apilamiento es apilamiento LOCAL y, en rigor, cae
 *        fuera del contrato — pero eso NO es decidible estáticamente desde el
 *        archivo, porque el ancestro puede vivir en otro componente. D1 se
 *        queda a propósito en la regla práctica «todo `fixed` + z literal se
 *        marca»: hoy no produce ni un falso positivo en el árbol, y el caso
 *        vivo de apilamiento local bajo `fixed` ya se emite SIN z
 *        (`apps/web/src/components/layout/TopHeader.tsx`, hoja de búsqueda
 *        móvil dentro del header `sticky`), justo como §2ter obliga. Si algún
 *        día marcara un caso legítimo, la salida es portalar la capa o
 *        declarar el escalón en el elemento que crea el contexto (§2ter,
 *        obligación 1) — nunca añadir una lista de excepciones.
 *   D2 — Cualquier `z-<n>` / `z-[<n>]` con n >= 100, con o sin `fixed`. El
 *        historial vivo lo justifica: existieron `z-10002` SIN `fixed`
 *        (posicionado por Floating UI) y `relative z-10001`; un detector que
 *        exigiera `fixed` los dejaría escapar.
 *   D3 — `zIndex:` cuyo valor no sea `var(--z-…)`. Marca `zIndex: 11000`,
 *        `zIndex: '11000'` y variables; acepta `zIndex: 'var(--z-popover)'`.
 *
 * Qué NO marca, a propósito:
 *   - La forma tokenizada `z-(--z-modal)`, con o sin variantes de responsive
 *     o tema (`lg:`, `max-lg:`, `md:`, `dark:`).
 *   - `z-auto` y utilidades que solo empiezan por «z» (`zoom-in-95`).
 *   - El apilamiento LOCAL: `relative`/`absolute`/`sticky` con `z-<n>` donde
 *     n < 100 y sin `fixed` (medido el 2026-09-07: 33 sitios, 33 utilidades
 *     `z-0`/`z-10`/`z-20`/`z-30`). Queda FUERA DE ALCANCE por contrato
 *     VIGENTE, no por espera: ADR-075 §2 ampliado y §2ter — enmienda C-DS-04,
 *     aprobada por el CTO el 2026-09-07 — excluyen de la prohibición de
 *     literales al elemento que no compite en el contexto de apilamiento
 *     raíz, sea porque no es capa de viewport (`relative`/`absolute` sin
 *     `fixed`) o porque un ancestro ya creó contexto de apilamiento. La
 *     prohibición gobierna CAPAS DE VIEWPORT, no ordenación interna. Se
 *     documenta aquí como fuera de alcance y NO como lista de excepciones:
 *     una lista de excepciones sobrevive al motivo que la creó (ADR-056
 *     §Lección de gobernanza; ADR-075 §Riesgos).
 *
 * Este test NACE VERDE y sin lista de excepciones porque M1-M10 del plan
 * `docs/plans/2026-09-07-adr075-cierre-contrato-capas.md` ya limpiaron el
 * árbol. Un test que naciera en rojo documentaría el incumplimiento en vez
 * de impedirlo.
 *
 * Qué NO escanea, a propósito: `*.spec.ts(x)` (los fixtures de prueba no son
 * código de aplicación y varios asierten la AUSENCIA del literal) y los
 * directorios `node_modules`, `.next`, `dist` y `coverage`. La exclusión de
 * `coverage` no es cosmética: `apps/portal/coverage/lcov-report/**` contiene
 * HTML con JSX escapado de ejecuciones anteriores que dispararía los tres
 * detectores con código obsoleto ya corregido.
 *
 * Canario de cobertura: el mismo recorrido cuenta las apariciones de
 * `z-(--z-` y exige un mínimo de 12 (piso deliberadamente holgado fijado por
 * el plan). Si alguien rompe un regex o el recorrido de directorios, la
 * regla principal se volvería verde por vacío; el canario lo mata.
 *
 * Límite documentado, heredado del molde: la regex de etiquetas tolera
 * flechas y comparaciones dentro de los atributos (`=>`, `>=`), pero una
 * etiqueta con JSX anidado DENTRO de un prop (`render={<Foo />}`) se
 * trunca en ese punto. Misma clase de límite que el molde declara para los
 * atributos con `=>` en las regiones busy.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const SCAN_ROOTS = ['apps/portal/src', 'apps/web/src', 'packages/ui/src'].map((root) =>
  join(REPO_ROOT, root),
);

const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.next', 'coverage', 'dist']);
const SPEC_FILE_RE = /\.spec\.tsx?$/;

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry)) {
        yield* walkSourceFiles(full);
      }
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !SPEC_FILE_RE.test(entry)) {
      yield full;
    }
  }
}

/** Las tres raíces del contrato (§2) en un solo recorrido. */
function* walkContractSurface(): Generator<string> {
  for (const root of SCAN_ROOTS) {
    yield* walkSourceFiles(root);
  }
}

/**
 * Etiquetas de apertura JSX. `[^<>]*` no cruza otra etiqueta, así que cada
 * coincidencia queda acotada a la suya; el grupo central de separadores
 * (`=>`, `>=`) permite que el recorrido del atributo sobreviva a handlers
 * (`onClick={() => …}`) y comparaciones ANTES del `className`.
 */
const OPENING_TAG_RE = /<[A-Za-z][\w.]*[^<>]*(?:(?:=>|>=)[^<>]*)*>/g;

/** `fixed` como clase del className: rodeado de espacios o comillas. */
const FIXED_CLASS_RE = /(?:^|[\s"'`])fixed(?:[\s"'`]|$)/;

/** `fixed` como valor de propiedad (`position: 'fixed'`, `pin="fixed"`): no es clase. */
const FIXED_AS_VALUE_RE = /[:=]\s*(['"`])fixed\1/g;

/**
 * Utilidad z con número literal: `z-40`, `z-[1200]`. El lookbehind impide
 * coincidir dentro de identificadores (`data-z-10`, `baz-10`) y las formas
 * no numéricas quedan fuera por construcción: `z-(--z-modal)` (token) y
 * `z-auto` no tienen dígitos tras el guion, y `zoom-100` tampoco expone
 * `z-<dígito>`. Versión sin /g para `test()` dentro de una etiqueta.
 */
const Z_LITERAL_TOKEN_RE = /(?<![\w-])z-(?:\d+|\[\d+\])/;

/** La misma utilidad, con /g para recorrer el archivo entero (D2). */
const Z_LITERAL_GLOBAL_RE = /(?<![\w-])z-(?:\d+|\[\d+\])/g;

/** Asignación `zIndex:` con su valor (C-DS-03: la segunda forma de emisión). */
const Z_INDEX_ASSIGN_RE = /\bzIndex\s*:\s*([^,}\n\r]+)/g;

/** Único valor admitido: el token de capa, con o sin comillas. */
const Z_INDEX_TOKEN_VALUE_RE = /^['"]?var\(--z-/;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

interface Offense {
  file: string;
  line: number;
  detail: string;
}

const reportLine = ({ file, line, detail }: Offense): string => `${file}:${line} :: ${detail}`;

describe('contrato de capas de superposición — regla estructural ADR-075 §2/§4', () => {
  const viewportLayerLiterals: Offense[] = [];
  const highZLiterals: Offense[] = [];
  const styleZLiterals: Offense[] = [];
  let tokenizedLayers = 0;

  for (const file of walkContractSurface()) {
    const source = readFileSync(file, 'utf8');
    const relPath = relative(REPO_ROOT, file).split(sep).join('/');

    for (const match of source.matchAll(OPENING_TAG_RE)) {
      const tag = match[0].replace(/\s+/g, ' ');
      // Se descartan primero los `fixed` que son valor de propiedad, para no
      // confundir `position: 'fixed'` con la clase `fixed`.
      const withoutFixedValues = tag.replace(FIXED_AS_VALUE_RE, '');
      if (FIXED_CLASS_RE.test(withoutFixedValues) && Z_LITERAL_TOKEN_RE.test(tag)) {
        viewportLayerLiterals.push({
          file: relPath,
          line: lineOf(source, match.index ?? 0),
          detail: `D1 fixed + z literal: ${tag.slice(0, 140)}`,
        });
      }
    }

    for (const match of source.matchAll(Z_LITERAL_GLOBAL_RE)) {
      const value = Number(match[0].replace(/\D/g, ''));
      if (value >= 100) {
        highZLiterals.push({
          file: relPath,
          line: lineOf(source, match.index ?? 0),
          detail: `D2 z literal >= 100: ${match[0]}`,
        });
      }
    }

    for (const match of source.matchAll(Z_INDEX_ASSIGN_RE)) {
      const value = match[1]?.trim() ?? '';
      if (!Z_INDEX_TOKEN_VALUE_RE.test(value)) {
        styleZLiterals.push({
          file: relPath,
          line: lineOf(source, match.index ?? 0),
          detail: `D3 zIndex sin token: ${match[0].replace(/\s+/g, ' ').slice(0, 140)}`,
        });
      }
    }

    tokenizedLayers += source.split('z-(--z-').length - 1;
  }

  it('la exploración encuentra capas tokenizadas (canario anti-vacío, mínimo del plan: 12)', () => {
    // Si esto falla, la regex o el recorrido dejaron de ver el árbol y las
    // reglas de abajo estarían pasando en falso.
    expect(tokenizedLayers).toBeGreaterThanOrEqual(12);
  });

  it('D1: ningún elemento fixed lleva una utilidad z numérica literal', () => {
    // El diff del fallo lista archivo, línea y etiqueta infractora, uno por línea.
    expect(viewportLayerLiterals.map(reportLine)).toEqual([]);
  });

  it('D2: ninguna utilidad z-<n>/z-[<n>] alcanza o supera 100', () => {
    expect(highZLiterals.map(reportLine)).toEqual([]);
  });

  it('D3: ningún zIndex: deja de ser var(--z-*)', () => {
    expect(styleZLiterals.map(reportLine)).toEqual([]);
  });
});
