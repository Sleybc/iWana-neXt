import { AppDataSource } from '../data-source';
import { PUBLIC_MIGRATIONS } from '../migrations/public';
import {
  describeContractEnvResidualWarning,
  describeDeferredMigration,
  filterDeferredMigrations,
  listDeferredMigrations,
  shouldWarnContractEnvResidual,
} from '../migrations/shared/deferred-migration.util';
import { assertTenantMigrationParity } from '../migrations/tenant/migration-parity.util';
import { runTenantMigrations, TENANT_MIGRATIONS } from '../migrations/tenant/runner';
import type { DataSource } from 'typeorm';

/**
 * Nombres ya registrados en `typeorm_migrations`: público + un tenant ACTIVE
 * representativo.
 *
 * El atajo del tenant representativo (`LIMIT 1`) es válido por una garantía
 * INDIRECTA, y conviene dejarla escrita porque la próxima refactorización que
 * mueva estas llamadas la rompe sin que nada falle en rojo:
 *
 *   `main()` encadena `runTenantMigrations` → `assertTenantMigrationParity` →
 *   `reportDeferredMigrations` dentro del MISMO `try`. La primera lanza si algún
 *   tenant falló; la segunda lanza si la flota ACTIVE no tiene exactamente el
 *   mismo conjunto de migraciones. Es decir: cuando esta función llega a
 *   ejecutarse, ya está probado que todos los tenants ACTIVE están alineados, y
 *   por eso mirar uno equivale a mirarlos todos.
 *
 * Si se invierte ese orden, se saca la paridad del `try`, o se llama a
 * `reportDeferredMigrations` desde otro sitio, el atajo pasa a ser incorrecto:
 * un solo tenant adelantado bastaría para que el aviso F-3 dijera «retire la
 * variable» con el resto de la flota sin el contract aplicado.
 *
 * La paridad solo cubre tenants ACTIVE en el chequeo que falla; los no-ACTIVE
 * (suspendidos, en provisioning, MARKED_FOR_DELETION) no se migran por diseño y
 * se reportan como aviso informativo sin cambiar el código de salida (Task 5
 * del plan de cierre 2026-08-06). Al reactivar un no-ACTIVE hay que alinear su
 * conjunto de migraciones y medir el volumen de la 108 sobre su schema antes de
 * correr su expand/contract (ver runbook SEC-P1 §4.2 paso 9).
 */
async function loadAppliedMigrationNames(dataSource: DataSource): Promise<Set<string>> {
  const publicRows = await dataSource.query<Array<{ name: string }>>(
    'SELECT "name" FROM "public"."typeorm_migrations"',
  );
  const applied = new Set<string>(publicRows.map((row) => row.name));

  const tenants = await dataSource.query<Array<{ schema_name: string }>>(
    `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' ORDER BY schema_name LIMIT 1`,
  );
  const representative = tenants[0];
  if (representative && /^[a-z0-9_]+$/i.test(representative.schema_name)) {
    const tenantRows = await dataSource.query<Array<{ name: string }>>(
      `SELECT "name" FROM "${representative.schema_name}"."typeorm_migrations"`,
    );
    for (const row of tenantRows) {
      applied.add(row.name);
    }
  }
  return applied;
}

/**
 * Último paso de `pnpm db:migrate:all`, y por eso el sitio donde se resume qué
 * quedó diferido: el CLI público es el de TypeORM y no tiene dónde colgar esto.
 */
async function reportDeferredMigrations(dataSource: DataSource): Promise<void> {
  const deferred = [
    ...listDeferredMigrations(PUBLIC_MIGRATIONS),
    ...listDeferredMigrations(TENANT_MIGRATIONS),
  ];
  const appliedNames = await loadAppliedMigrationNames(dataSource);

  const pending = filterDeferredMigrations(deferred, appliedNames);

  for (const { name, envVar } of pending) {
    console.warn(describeDeferredMigration(name, envVar));
  }

  // Concern F-3: env residual. Si la variable del contract quedó activa pero no
  // hay contracts pendientes, la ventana 2 ya se completó (o el env es huérfano);
  // dejarla activa arriesga un contract accidental en una corrida futura.
  const contractEnvVar = 'IWANA_APPLY_PII_CONTRACT';
  if (shouldWarnContractEnvResidual(pending.length, process.env, contractEnvVar)) {
    console.warn(describeContractEnvResidualWarning(contractEnvVar));
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  let exitCode = 0;
  try {
    await runTenantMigrations(AppDataSource);
    // Red de seguridad post-run (concern C2): el runner no es atómico entre
    // tenants; verificar que todos los ACTIVE quedaron con el mismo conjunto de
    // migraciones antes de dar la corrida por buena.
    await assertTenantMigrationParity(AppDataSource);
    console.log('[MIGRATOR] All tenants migrated successfully');
    await reportDeferredMigrations(AppDataSource);
  } catch (err) {
    console.error('[MIGRATOR] Fatal error:', err);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
  process.exit(exitCode);
}

main();
