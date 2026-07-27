import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Aserción estructural del contrato de estados atenuados §7.2
 * (docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md):
 *
 *   Ningún elemento con `aria-busy="true"` puede llevar una clase `opacity-*`.
 *
 * Por qué existe: el flake R-14 de v2-34 era una violación REAL de contraste
 * (WCAG AA) que axe-core solo veía cuando auditaba dentro de la ventana de
 * carga. Once pantallas aplicaban `opacity-60` al contenedor `aria-busy` de su
 * tabla; la opacidad compone el texto contra el fondo y destruye el contraste
 * (celda gray-700 → 3,34:1; línea secundaria gray-500 → 2,32:1). axe mide el
 * resultado en la ventana; esta regla mide la estructura y no puede ser flaky.
 *
 * Estado tras la corrección E-6 (2026-07-26): las 11 pantallas migraron a
 * `portalDataBusyRegionClassName` (`cursor-progress`, sin opacidad). Si alguien
 * reintroduce `opacity-*` sobre una región busy, este test muere en rojo con
 * la lista de infractores.
 *
 * Qué NO escanea, a propósito: los `disabled:opacity-50` de los controles
 * dentro de la región busy son exentos por §2/§4.1 (`disabled` nativo en el
 * DOM) y no forman parte de esta regla — aquí solo se mira la etiqueta que
 * declara `aria-busy`.
 */

const SRC_ROOT = join(__dirname, '..', '..');

function* walkTsx(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkTsx(full);
    } else if (full.endsWith('.tsx') && !full.endsWith('.spec.tsx')) {
      yield full;
    }
  }
}

/**
 * Etiquetas de apertura JSX que declaran `aria-busy`.
 * `[^<]*` no cruza otro `<`, así que cada coincidencia queda acotada a su
 * propia etiqueta (los atributos con `=>` no aparecen en las regiones busy de
 * este repo; si algún día aparecen, el test de cobertura de abajo lo delata).
 */
const BUSY_TAG_RE = /<[A-Za-z][\w.]*[^<]*aria-busy[^<]*>/g;
const OPACITY_CLASS_RE = /\bopacity-\d/;

interface Offense {
  file: string;
  tag: string;
}

describe('contrato de estados atenuados — regla estructural §7.2', () => {
  const offenses: Offense[] = [];
  let busyTagsFound = 0;

  for (const file of walkTsx(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(BUSY_TAG_RE)) {
      busyTagsFound += 1;
      const tag = match[0].replace(/\s+/g, ' ');
      if (OPACITY_CLASS_RE.test(tag)) {
        offenses.push({ file: relative(SRC_ROOT, file), tag });
      }
    }
  }

  it('la exploración encuentra regiones busy (guardia anti-vacío)', () => {
    // Si esto falla, la expresión dejó de ver las regiones busy y la regla
    // principal estaría pasando en falso.
    expect(busyTagsFound).toBeGreaterThan(0);
  });

  it('ninguna etiqueta con aria-busy lleva una clase opacity-*', () => {
    // El diff del fallo lista archivo y etiqueta infractora, uno por línea.
    const report = offenses.map(({ file, tag }) => `${file} :: ${tag.slice(0, 140)}`);
    expect(report).toEqual([]);
  });

  it('portalDataTableInactiveRowClassName no usa opacidad (§4.3: escalón de token)', () => {
    const portalUi = readFileSync(join(__dirname, 'portal-ui.tsx'), 'utf8');
    const declaration = portalUi.match(
      /export const portalDataTableInactiveRowClassName\s*=\s*[^;]+;/,
    );
    expect(declaration).not.toBeNull();
    expect(declaration?.[0]).not.toMatch(/opacity/);
  });
});
