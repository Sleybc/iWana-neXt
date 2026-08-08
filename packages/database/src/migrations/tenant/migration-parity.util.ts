import { DataSource } from 'typeorm';

import { isValidSchemaName } from '../../data-source';
import { isMigrationDeferred, type DeferrableMigration } from '../shared/deferred-migration.util';
import { TENANT_MIGRATIONS } from './runner';

/**
 * Chequeo de paridad de migraciones entre tenants ACTIVE.
 *
 * `runTenantMigrations` itera los schemas en serie y no es atómico entre
 * tenants: si uno falla, los demás siguen y el error se lanza al final. Un
 * operador podría acabar con una flota mixta (algunos schemas con el expand,
 * otros sin él) si rearranca sin leer el resumen `[MIGRATOR]`.
 *
 * Este módulo es la red de seguridad post-run que cierra ese hueco: compara el
 * conjunto de migraciones registradas en `typeorm_migrations` de cada tenant
 * ACTIVE contra un baseline y denuncia cualquier divergencia. Se invoca desde
 * el CLI de migración (`cli/tenant-migrate.ts`) después de `runTenantMigrations`
 * y antes de dar la corrida por buena — no cambia el runner.
 *
 * Los tenants no-ACTIVE (SUSPENDED, PROVISIONING, MARKED_FOR_DELETION, …) no
 * se migran por diseño, así que no participan del chequeo que falla; sí se
 * reportan como aviso informativo (cuántos son y cuántos difieren del baseline
 * ACTIVE) para que un rezago no pase inadvertido al reactivarlos.
 *
 * Solo lectura: no toca datos ni DDL. Los nombres de schema se validan con
 * `isValidSchemaName` antes de interpolarse en SQL (mismo patrón que
 * `runInTenantSchema`).
 */

export interface TenantMigrationSnapshot {
  schemaName: string;
  names: string[];
}

/** Snapshot de un tenant no-ACTIVE: `names` es null cuando no tiene tabla
 * `typeorm_migrations` (provisioning a medias): sin registro, sin comparar. */
export interface NonActiveTenantSnapshot {
  schemaName: string;
  names: string[] | null;
  /** true si el conjunto difiere del baseline ACTIVE (incluye "sin registro"). */
  diverges: boolean;
  /** Migraciones que el baseline tiene y este schema no (vacíos si sin registro). */
  missing: string[];
  /** Migraciones que este schema tiene y el baseline no (vacíos si sin registro). */
  extra: string[];
}

export interface NonActiveTenantParityReport {
  /** Total de schemas de tenant con status <> 'ACTIVE'. */
  count: number;
  /** Cuántos tienen un conjunto de migraciones distinto del de la flota ACTIVE. */
  diverging: number;
  /** Schemas no-ACTIVE sin tabla typeorm_migrations (provisioning a medias). */
  withoutMigrationRecord: number;
  snapshots: NonActiveTenantSnapshot[];
}

export interface MigrationDivergence {
  schemaName: string;
  /** Migraciones que el baseline tiene y este schema no. */
  missing: string[];
  /** Migraciones que este schema tiene y el baseline no. */
  extra: string[];
}

export interface MigrationParityReport {
  ok: boolean;
  /** Primer tenant ACTIVE, usado como baseline. */
  baselineSchema: string;
  tenants: TenantMigrationSnapshot[];
  divergences: MigrationDivergence[];
  /** Conjunto de migraciones que el código espera aplicado en cada tenant. */
  expectedNames: string[];
}

/**
 * Conjunto de migraciones que el código espera aplicado en cada tenant (F-2).
 *
 * La paridad intra-flota no detecta un fallo *uniforme*: si ninguna corrida
 * aplicó una migración, todos los tenants quedan idénticamente mal y el
 * baseline coincide con ellos. Este conjunto resuelve esa ceguera comparando
 * la DB contra el código.
 *
 * Reglas de resolución de diferidas:
 * - Una migración no diferida (según el env actual) siempre se espera aplicada.
 * - Una diferida se espera aplicada solo si ya consta en el baseline: pudo
 *   aplicarse en una corrida anterior con la variable activa, y entonces su
 *   ausencia en un tenant es un hueco real, no un diferimiento legítimo.
 */
export function computeExpectedTenantMigrationNames(
  appliedInBaseline: ReadonlyArray<string>,
  migrationClasses: readonly (new () => DeferrableMigration & {
    name?: string;
  })[] = TENANT_MIGRATIONS,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const applied = new Set(appliedInBaseline);

  return migrationClasses
    .map((MigrationClass) => {
      const migration = new MigrationClass();
      return { migration, name: migration.name ?? MigrationClass.name };
    })
    .filter(({ migration, name }) => !isMigrationDeferred(migration, env) || applied.has(name))
    .map(({ name }) => name);
}

/** Obtiene el conjunto de migraciones aplicadas de cada tenant ACTIVE. */
export async function loadTenantMigrationSnapshots(
  dataSource: DataSource,
): Promise<TenantMigrationSnapshot[]> {
  const tenants = (await dataSource.query(
    `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' ORDER BY schema_name`,
  )) as Array<{ schema_name: string }>;

  const snapshots: TenantMigrationSnapshot[] = [];
  for (const tenant of tenants) {
    const schemaName = tenant.schema_name;
    if (!isValidSchemaName(schemaName)) {
      throw new Error(
        `Chequeo de paridad abortado: schema inválido en public.tenants: "${schemaName}".`,
      );
    }

    const rows = (await dataSource.query(
      `SELECT "name" FROM "${schemaName}"."typeorm_migrations" ORDER BY "id" ASC`,
    )) as Array<{ name: string }>;

    snapshots.push({ schemaName, names: rows.map((row) => row.name) });
  }

  return snapshots;
}

/**
 * Compara los snapshots contra un baseline (F-2: también contra lo que el
 * código espera aplicado). Pura y testeable.
 *
 * Si `expectedNames` viene con contenido, cada snapshot se compara contra ese
 * conjunto (incluido el baseline): detecta el fallo uniforme y las migraciones
 * que el código ya no conoce. Sin `expectedNames` conserva el comportamiento
 * intra-flota (comparar todos contra el primero).
 */
export function computeMigrationParityReport(
  snapshots: TenantMigrationSnapshot[],
  expectedNames: string[] = [],
): MigrationParityReport {
  if (snapshots.length === 0) {
    return {
      ok: true,
      baselineSchema: '',
      tenants: [],
      divergences: [],
      expectedNames,
    };
  }

  const baseline = snapshots[0];
  if (!baseline) {
    // No alcanzable tras el guard anterior; satisface el narrowing estricto.
    return {
      ok: true,
      baselineSchema: '',
      tenants: snapshots,
      divergences: [],
      expectedNames,
    };
  }

  const referenceNames = expectedNames.length > 0 ? expectedNames : baseline.names;
  const divergences: MigrationDivergence[] = [];

  for (const snapshot of snapshots) {
    if (expectedNames.length === 0 && snapshot.schemaName === baseline.schemaName) {
      continue;
    }
    const missing = referenceNames.filter((name) => !snapshot.names.includes(name));
    const extra = snapshot.names.filter((name) => !referenceNames.includes(name));
    if (missing.length > 0 || extra.length > 0) {
      divergences.push({ schemaName: snapshot.schemaName, missing, extra });
    }
  }

  return {
    ok: divergences.length === 0,
    baselineSchema: baseline.schemaName,
    tenants: snapshots,
    divergences,
    expectedNames,
  };
}

/**
 * Compara el conjunto de migraciones de cada tenant no-ACTIVE contra el
 * baseline ACTIVE. Pura y testeable (mismo patrón que
 * `computeMigrationParityReport`).
 *
 * Un no-ACTIVE "sin registro" (sin tabla `typeorm_migrations`) cuenta como
 * divergente informativo: su estado de migraciones es desconocido, y eso es
 * exactamente lo que el operador debe verificar al reactivarlo.
 */
export function computeNonActiveTenantParityReport(
  snapshots: Pick<NonActiveTenantSnapshot, 'schemaName' | 'names'>[],
  referenceNames: ReadonlyArray<string>,
): NonActiveTenantParityReport {
  const computed: NonActiveTenantSnapshot[] = snapshots.map((snapshot) => {
    if (snapshot.names === null) {
      return { ...snapshot, diverges: true, missing: [], extra: [] };
    }
    const missing = referenceNames.filter((name) => !snapshot.names!.includes(name));
    const extra = snapshot.names.filter((name) => !referenceNames.includes(name));
    return {
      ...snapshot,
      diverges: missing.length > 0 || extra.length > 0,
      missing,
      extra,
    };
  });

  return {
    count: computed.length,
    diverging: computed.filter((snapshot) => snapshot.diverges).length,
    withoutMigrationRecord: computed.filter((snapshot) => snapshot.names === null).length,
    snapshots: computed,
  };
}

/**
 * Carga el conjunto de migraciones de cada tenant no-ACTIVE (`status <> 'ACTIVE'`).
 *
 * No se migran por diseño, así que un rezago es esperado: esta carga es la base
 * del aviso informativo, nunca de un fallo. Un schema sin tabla
 * `typeorm_migrations` (provisioning a medias) se tolera como "sin registro".
 */
export async function loadNonActiveTenantSnapshots(
  dataSource: DataSource,
  referenceNames: ReadonlyArray<string>,
): Promise<NonActiveTenantParityReport> {
  const tenants = (await dataSource.query(
    `SELECT schema_name FROM public.tenants WHERE status <> 'ACTIVE' ORDER BY schema_name`,
  )) as Array<{ schema_name: string }>;

  const raw: { schemaName: string; names: string[] | null }[] = [];
  for (const tenant of tenants) {
    const schemaName = tenant.schema_name;
    if (!isValidSchemaName(schemaName)) {
      throw new Error(
        `Chequeo de paridad abortado: schema inválido en public.tenants: "${schemaName}".`,
      );
    }

    const hasRecord = (await dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = '${schemaName}' AND table_name = 'typeorm_migrations'
       ) AS "exists"`,
    )) as Array<{ exists: boolean }>;

    let names: string[] | null = null;
    if (hasRecord[0]?.exists) {
      const rows = (await dataSource.query(
        `SELECT "name" FROM "${schemaName}"."typeorm_migrations" ORDER BY "id" ASC`,
      )) as Array<{ name: string }>;
      names = rows.map((row) => row.name);
    }

    raw.push({ schemaName, names });
  }

  return computeNonActiveTenantParityReport(raw, referenceNames);
}

/** Resumen del aviso de tenants no-ACTIVE (sin prefijo `[MIGRATOR]`). */
export function describeNonActiveTenantParityWarning(report: NonActiveTenantParityReport): string {
  return (
    `Aviso: ${report.count} schema(s) no-ACTIVE; ` +
    `${report.diverging} con migraciones distintas de la flota ACTIVE ` +
    `— no se migran por diseño, verificar al reactivar.`
  );
}

/** Detalle por schema no-ACTIVE divergente (para la consola del CLI). */
export function describeNonActiveTenantDivergence(snapshot: NonActiveTenantSnapshot): string {
  if (snapshot.names === null) {
    return (
      `Aviso: ${snapshot.schemaName} sin tabla typeorm_migrations ` +
      `(provisioning a medias) — sin registro de migraciones comparables.`
    );
  }
  return (
    `Aviso: ${snapshot.schemaName} con migraciones distintas de la flota ACTIVE ` +
    `(faltantes=[${snapshot.missing.join(', ')}] extra=[${snapshot.extra.join(', ')}]).`
  );
}

/**
 * Lanza si la flota de tenants ACTIVE no tiene el mismo conjunto de migraciones
 * o si ese conjunto se desalinea con lo que el código espera (F-2).
 *
 * Emite además un aviso informativo (no bloqueante) sobre los tenants
 * no-ACTIVE: no se migran por diseño, así que un rezago no es un error ni
 * cambia el código de salida. Al reactivar un no-ACTIVE hay que verificar su
 * alineación y medir el volumen de la 108 sobre su schema (ver runbook SEC-P1).
 */
export async function assertTenantMigrationParity(
  dataSource: DataSource,
  opts: {
    log?: (message: string) => void;
    /** Reemplaza el catálogo por defecto (TENANT_MIGRATIONS) — útil en tests. */
    migrationClasses?: readonly (new () => DeferrableMigration & { name?: string })[];
  } = {},
): Promise<MigrationParityReport> {
  const log = opts.log ?? ((message: string): void => console.log(`[MIGRATOR] ${message}`));

  const snapshots = await loadTenantMigrationSnapshots(dataSource);
  const baseline = snapshots[0];
  const expectedNames = baseline
    ? computeExpectedTenantMigrationNames(
        baseline.names,
        opts.migrationClasses ?? TENANT_MIGRATIONS,
      )
    : [];
  const report = computeMigrationParityReport(snapshots, expectedNames);

  const referenceNames = expectedNames.length > 0 ? expectedNames : (baseline?.names ?? []);
  const nonActive = await loadNonActiveTenantSnapshots(dataSource, referenceNames);
  if (nonActive.count > 0) {
    log(describeNonActiveTenantParityWarning(nonActive));
    for (const snapshot of nonActive.snapshots) {
      if (snapshot.diverges) {
        log(describeNonActiveTenantDivergence(snapshot));
      }
    }
  }

  if (report.ok) {
    const migrationCount = report.tenants[0]?.names.length ?? 0;
    log(
      `Paridad de migraciones OK: ${report.tenants.length} tenant(s) ACTIVE ` +
        `con ${migrationCount} migraciones idénticas` +
        (expectedNames.length > 0 ? ` (alineadas con ${expectedNames.length} del código)` : '') +
        '.',
    );
    return report;
  }

  const detail = report.divergences
    .map(
      (divergence) =>
        `${divergence.schemaName}: ` +
        `faltantes=[${divergence.missing.join(', ')}] ` +
        `extra=[${divergence.extra.join(', ')}]`,
    )
    .join(' | ');

  throw new Error(
    `Paridad de migraciones ROTA entre tenants ACTIVE ` +
      `(baseline ${report.baselineSchema}, esperado=${expectedNames.length} del código): ${detail}. ` +
      `No arrancar API/portal/worker con flota mixta: alinear los schemas divergentes antes.`,
  );
}
