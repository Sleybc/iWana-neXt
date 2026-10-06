import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * B0 — aserción estructural de la consolidación de copy (dictamen G3 §7, spec
 * base §10.5): cada texto de respaldo vive en UNA fuente y nadie vuelve a
 * declarar un mapa paralelo.
 *
 *   - Texto por tipo de requisito -> `execution-order-requirements.ts`
 *     (`requirementKindLabel`); el mapa `REQUIREMENT_KIND_LABELS` es privado.
 *   - Texto de sincronización     -> `execution-order-sync-copy.ts` (`syncCopy`).
 */
const OPERATIONS_DIR = __dirname;
const sources = readdirSync(OPERATIONS_DIR)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.spec\.tsx?$/.test(file))
  .map((file) => ({ file, text: readFileSync(join(OPERATIONS_DIR, file), 'utf8') }));

function filesContaining(fragment: string | RegExp): string[] {
  return sources
    .filter(({ text }) =>
      typeof fragment === 'string' ? text.includes(fragment) : fragment.test(text),
    )
    .map(({ file }) => file)
    .sort();
}

describe('consolidación de copy: una fuente por texto', () => {
  it('el mapa de respaldo por tipo de requisito se declara solo en execution-order-requirements', () => {
    expect(filesContaining(/\bREQUIREMENT_KIND_LABELS\b/)).toEqual([
      'execution-order-requirements.ts',
    ]);
    expect(filesContaining('Material o equipo requerido')).toEqual([
      'execution-order-requirements.ts',
    ]);
    expect(filesContaining('Información requerida')).toEqual(['execution-order-requirements.ts']);
  });

  it('no existe una segunda función de etiqueta por tipo (requirementKindLabel es la única)', () => {
    expect(filesContaining(/function\s+requirementKindLabel\b/)).toEqual([
      'execution-order-requirements.ts',
    ]);
    expect(filesContaining(/function\s+requirementLabel\b/)).toEqual([]);
  });

  it('los textos de sincronización se declaran solo en execution-order-sync-copy', () => {
    expect(filesContaining('Sincronización pendiente')).toEqual(['execution-order-sync-copy.ts']);
    expect(filesContaining('La orden cambió; revisa la versión vigente')).toEqual([
      'execution-order-sync-copy.ts',
    ]);
    expect(filesContaining(/\bsyncStateCopy\b/)).toEqual([]);
    expect(filesContaining(/function\s+syncCopy\b/)).toEqual(['execution-order-sync-copy.ts']);
    expect(filesContaining(/function\s+toSummarySyncState\b/)).toEqual([
      'execution-order-sync-copy.ts',
    ]);
  });

  it('el resumen y el drawer consumen la misma fuente de sincronización', () => {
    expect(filesContaining("from './execution-order-sync-copy'")).toEqual(
      expect.arrayContaining(['ExecutionOrderMomentContainer.tsx', 'ExecutionOrderSummary.tsx']),
    );
  });
});
