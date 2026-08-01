/**
 * Guarda estructural del vocabulario de estados del upload-intent de evidencia.
 *
 * Existe porque el defecto que rompió CA-1 sobrevivió a la cobertura unitaria:
 * los tests de `execution-orders.evidence.service.spec.ts` mockean el
 * `EntityManager`, así que el CHECK de PostgreSQL nunca se evalúa y un estado
 * que la base rechaza puede quedar fijado como "esperado" sin que nadie se
 * entere hasta el E2E.
 *
 * Esta prueba no mockea nada: compara tres fuentes que deben decir lo mismo.
 *
 *   1. El CHECK vigente en la cadena de migraciones tenant.
 *   2. La constante canónica de la entidad (`@iwana/db`).
 *   3. Los literales que el servicio persiste en la columna `status`.
 *
 * El contrato público (`EvidenceAssetReceipt.status` de `@iwana/shared`) NO
 * entra en la comparación a propósito: solo expone los cuatro estados del ciclo
 * de análisis de Media, y es un subconjunto deliberado del vocabulario durable.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXECUTION_ORDER_EVIDENCE_UPLOAD_INTENT_STATUSES } from '@iwana/db';
import type { EvidenceAssetReceipt } from '@iwana/shared';

const TENANT_MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'database',
  'src',
  'migrations',
  'tenant',
);

const SERVICE_PATH = join(__dirname, '..', 'services', 'execution-orders.service.ts');

const CONSTRAINT = 'chk_execution_order_evidence_upload_intents_status';

/** Número de orden de una migración tenant, tomado de su prefijo. */
function migrationNumber(file: string): number {
  const prefix = /^(\d+)_/.exec(file)?.[1];
  if (prefix === undefined) {
    throw new Error(`Fichero de migración sin prefijo numérico: "${file}"`);
  }

  return Number.parseInt(prefix, 10);
}

/**
 * Ordena por el número de la migración, no por el nombre.
 *
 * INVARIANTE DE ORDEN: esta guarda solo es válida si recorre las migraciones en
 * el mismo orden en que se aplican, porque se queda con el ÚLTIMO CHECK que
 * encuentra. Ordenar con `.sort()` sobre el nombre coincide con el orden
 * numérico únicamente mientras todos los prefijos tengan el mismo ancho: hoy
 * son 95 ficheros, todos de 3 dígitos, y por eso el orden lexicográfico es
 * correcto — `'095' < '100'`, no al revés. Pero deja de serlo en cuanto el
 * ancho deje de ser uniforme (`'1000' < '999'`), y el fallo sería silencioso:
 * la guarda leería un CHECK obsoleto y pasaría en VERDE. Parsear el número
 * elimina esa dependencia implícita del zero-padding.
 */
function sortByMigrationNumber(files: string[]): string[] {
  // Se resuelve el número ANTES de ordenar: comparar dentro del `sort` dejaría
  // sin validar los ficheros que el comparador nunca llega a visitar.
  return files
    .map((file) => ({ file, order: migrationNumber(file) }))
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.file);
}

/**
 * Estados del CHECK vigente: el que declara el `up()` de la migración de mayor
 * número que toca la constraint. El `down()` se descarta porque contiene, por
 * definición, el CHECK anterior.
 */
function readEffectiveCheckStatuses(): string[] {
  const files = sortByMigrationNumber(
    readdirSync(TENANT_MIGRATIONS_DIR).filter(
      (name) => /^\d+_.*\.ts$/.test(name) && !name.endsWith('.spec.ts'),
    ),
  );

  let effective: string[] | null = null;

  for (const file of files) {
    const upSection = readFileSync(join(TENANT_MIGRATIONS_DIR, file), 'utf8').split(
      'public async down(',
    )[0]!;

    const addConstraint = new RegExp(
      `ADD CONSTRAINT ${CONSTRAINT}\\s*CHECK \\(status IN \\(([^)]*)\\)\\)`,
      'g',
    );

    for (const match of upSection.matchAll(addConstraint)) {
      effective = [...(match[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((literal) => literal[1]!);
    }
  }

  return effective ?? [];
}

/** Literales que el servicio escribe en `status` del upload-intent. */
function readServiceEmittedStatuses(): string[] {
  const source = readFileSync(SERVICE_PATH, 'utf8');
  const emitted = new Set<string>();

  // Cada create/update del intent nombra la entidad justo antes del objeto que
  // fija el estado; se inspecciona la ventana posterior a cada mención.
  const entityMention = /ExecutionOrderEvidenceUploadIntent\b/g;
  for (const mention of source.matchAll(entityMention)) {
    const window = source.slice(mention.index, mention.index + 400);
    for (const assignment of window.matchAll(/status: '([A-Z_]+)'/g)) {
      emitted.add(assignment[1]!);
    }
  }

  return [...emitted];
}

describe('Upload-intent de evidencia — orden de lectura de las migraciones', () => {
  // El helper es puro y recibe la lista, así que la regresión se cubre sin
  // fabricar ficheros en disco ni ensuciar la cadena real de migraciones.

  it('ordena por número aunque el ancho del prefijo deje de ser uniforme', () => {
    const files = ['1000_futura.ts', '999_previa.ts', '095_create_intents.ts'];

    expect(sortByMigrationNumber(files)).toEqual([
      '095_create_intents.ts',
      '999_previa.ts',
      '1000_futura.ts',
    ]);
    // El orden por nombre colocaría la 1000 ANTES que la 999: la guarda leería
    // un CHECK obsoleto y pasaría en verde.
    expect([...files].sort()).not.toEqual(sortByMigrationNumber(files));
  });

  it('coincide con el orden por nombre mientras el prefijo sea de ancho fijo', () => {
    const files = ['100_posterior.ts', '099_extend.ts', '095_create_intents.ts'];

    expect(sortByMigrationNumber(files)).toEqual([
      '095_create_intents.ts',
      '099_extend.ts',
      '100_posterior.ts',
    ]);
    expect([...files].sort()).toEqual(sortByMigrationNumber(files));
  });

  it('no ordena en silencio un fichero sin prefijo numérico', () => {
    expect(() => sortByMigrationNumber(['runner.ts'])).toThrow(/prefijo numérico/);
  });

  it('deja la cadena real en orden creciente', () => {
    const ordered = sortByMigrationNumber(
      readdirSync(TENANT_MIGRATIONS_DIR).filter(
        (name) => /^\d+_.*\.ts$/.test(name) && !name.endsWith('.spec.ts'),
      ),
    ).map(migrationNumber);

    expect(ordered.length).toBeGreaterThan(0);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });
});

describe('Upload-intent de evidencia — vocabulario de estados', () => {
  const checkStatuses = readEffectiveCheckStatuses();
  const canonicalStatuses = [...EXECUTION_ORDER_EVIDENCE_UPLOAD_INTENT_STATUSES] as string[];
  const emittedStatuses = readServiceEmittedStatuses();

  it('localiza el CHECK vigente y los literales del servicio', () => {
    // Guarda de la propia prueba: sin estos dos conjuntos las asserts de abajo
    // pasarían en vacío, que es justo el modo de fallo que venimos a cerrar.
    expect(checkStatuses.length).toBeGreaterThan(0);
    expect(emittedStatuses.length).toBeGreaterThan(0);
  });

  it('el CHECK de la migración y la constante canónica declaran el mismo conjunto', () => {
    expect([...checkStatuses].sort()).toEqual([...canonicalStatuses].sort());
  });

  it.each(['PENDING', 'FAILED'])(
    'el CHECK acepta el estado interno %s, previo a la existencia del asset en Media',
    (status) => {
      expect(checkStatuses).toContain(status);
    },
  );

  it.each(readServiceEmittedStatuses())('el servicio persiste %s y la base lo acepta', (status) => {
    expect(checkStatuses).toContain(status);
  });

  it('el contrato público sigue siendo un subconjunto estricto del vocabulario durable', () => {
    const publicStatuses: Array<EvidenceAssetReceipt['status']> = [
      'PENDING_ANALYSIS',
      'AVAILABLE',
      'REJECTED',
      'EXPIRED',
    ];

    for (const status of publicStatuses) {
      expect(checkStatuses).toContain(status);
    }
    // Los dos estados internos no viajan al recibo: `toEvidenceAssetReceipt`
    // rechaza con 409 cualquier intent sin mediaAssetId, y ambos lo tienen nulo.
    expect(publicStatuses).not.toContain('PENDING' as EvidenceAssetReceipt['status']);
    expect(publicStatuses).not.toContain('FAILED' as EvidenceAssetReceipt['status']);
  });
});
