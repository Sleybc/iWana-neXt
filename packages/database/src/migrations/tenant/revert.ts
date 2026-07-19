import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';

import { isValidSchemaName } from '../../data-source';
import {
  TENANT_MIGRATIONS,
  acquireGlobalLock,
  createTenantDataSource,
  ensureTenantMigrationsTable,
  releaseGlobalLock,
} from './runner';

/**
 * Revert de migraciones tenant — contraparte de `runner.ts`.
 *
 * Asimetría deliberada respecto a la ruta de up: `runTenantMigrations` itera
 * todos los tenants activos; aquí **nunca** se itera. El schema es un argumento
 * obligatorio y se revierte uno solo. Un revert masivo accidental es la peor
 * forma posible de esta operación, así que no existe forma de expresarlo.
 *
 * Seguimiento de ADR-056: ciertas migraciones exigen
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` para que su `down()` proceda sobre
 * un schema con datos. Este módulo no lee ni fija esa variable — la guarda vive
 * en la migración, que es quien sabe qué está a punto de destruir. Lo que sí
 * hace es *anunciarla* en el plan, para que el operador la vea antes de
 * disparar y no después, en un stacktrace.
 */

/** Variable de entorno que exigen las migraciones con `down()` destructivo. */
export const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migraciones cuyo `down()` consulta `DESTRUCTIVE_DOWN_ENV_VAR`.
 *
 * Se mantiene explícita en vez de inferirla: el plan debe poder anunciar el
 * requisito *sin* ejecutar nada, y no hay forma honesta de saber si un `down()`
 * va a exigir el flag salvo ejecutándolo. La sincronía con el código real la
 * verifica un test que lee las fuentes de las migraciones.
 */
export const MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG: readonly string[] = [
  'InitialTenantSchema1700000000000',
];

export interface TenantRevertStep {
  /** Nombre registrado en `typeorm_migrations`. */
  name: string;
  /** `id` de la fila a eliminar del registro. */
  registryId: number;
  /** El `down()` de esta migración exige `DESTRUCTIVE_DOWN_ENV_VAR=true`. */
  requiresDestructiveFlag: boolean;
}

export interface TenantRevertPlan {
  schemaName: string;
  /** Pasos en el orden en que se ejecutarán: del más reciente hacia atrás. */
  steps: TenantRevertStep[];
  /** Total de migraciones aplicadas en el schema antes de revertir. */
  appliedCount: number;
}

export interface TenantRevertOptions {
  /** Cuántas migraciones revertir. Por defecto 1 — nunca más salvo petición explícita. */
  steps?: number;
  /** Resuelve e informa el plan sin tocar el schema. */
  dryRun?: boolean;
  /** Sumidero de trazas; inyectable para test. */
  logger?: Pick<Console, 'log' | 'warn'>;
}

interface AppliedRow {
  id: number;
  name: string;
}

function migrationClassByName(name: string): (new () => MigrationInterface) | undefined {
  return TENANT_MIGRATIONS.find((MigrationClass) => {
    const instance = new MigrationClass();

    return (instance.name ?? MigrationClass.name) === name;
  });
}

async function readAppliedDescending(queryRunner: QueryRunner): Promise<AppliedRow[]> {
  return (await queryRunner.query(`
    SELECT "id", "name"
    FROM "typeorm_migrations"
    ORDER BY "id" DESC
  `)) as AppliedRow[];
}

/**
 * Resuelve qué se revertiría, sin ejecutar nada.
 *
 * Falla antes de tocar el schema si alguna de las migraciones registradas no
 * tiene clase conocida: revertir a ciegas una migración que este build no
 * conoce dejaría el registro mintiendo sobre el estado real del schema.
 */
export async function planTenantRevert(
  queryRunner: QueryRunner,
  schemaName: string,
  steps = 1,
): Promise<TenantRevertPlan> {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error(
      `El número de migraciones a revertir debe ser un entero >= 1 (recibido: ${steps}).`,
    );
  }

  await ensureTenantMigrationsTable(queryRunner);
  const applied = await readAppliedDescending(queryRunner);
  const selected = applied.slice(0, steps);

  const plan: TenantRevertPlan = {
    schemaName,
    appliedCount: applied.length,
    steps: selected.map((row) => ({
      name: row.name,
      registryId: row.id,
      requiresDestructiveFlag: MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG.includes(row.name),
    })),
  };

  for (const step of plan.steps) {
    if (!migrationClassByName(step.name)) {
      throw new Error(
        `El schema "${schemaName}" registra la migración "${step.name}", que no existe en este build. ` +
          `No se puede revertir lo que no se puede cargar: el registro quedaría desincronizado del schema real. ` +
          `Ejecute el revert desde un build que contenga esa migración.`,
      );
    }
  }

  return plan;
}

/**
 * Revierte las últimas `steps` migraciones aplicadas a UN schema de tenant.
 *
 * Consistencia transaccional (criterio 5): cada paso ejecuta `down()` y el
 * `DELETE` de su fila en `typeorm_migrations` dentro de la misma transacción.
 * En PostgreSQL el DDL es transaccional, así que un `down()` que falle a mitad
 * deja el schema y el registro en el mismo estado previo — no hay ventana en la
 * que el registro afirme algo que el schema no cumple. Si falla el paso N de M,
 * los pasos anteriores ya commiteados siguen siendo válidos y el registro los
 * refleja con exactitud.
 */
export async function revertTenantMigrations(
  baseDataSource: DataSource,
  schemaName: string,
  options: TenantRevertOptions = {},
): Promise<TenantRevertPlan> {
  const { steps = 1, dryRun = false, logger = console } = options;

  if (!isValidSchemaName(schemaName)) {
    throw new Error(
      `Schema name invalido: "${schemaName}". Solo se aceptan schemas tenant_* (^tenant_[a-z][a-z0-9_]{0,54}$).`,
    );
  }

  await acquireGlobalLock(baseDataSource);

  let tenantDs: DataSource | null = null;
  try {
    tenantDs = createTenantDataSource(baseDataSource, schemaName, `tenant-revert-${schemaName}`);
    await tenantDs.initialize();

    const queryRunner = tenantDs.createQueryRunner();
    try {
      const plan = await planTenantRevert(queryRunner, schemaName, steps);

      if (plan.steps.length === 0) {
        logger.log(`[REVERT] ${schemaName}: no hay migraciones aplicadas. Nada que revertir.`);

        return plan;
      }

      for (const step of plan.steps) {
        const flagNote = step.requiresDestructiveFlag
          ? ` (exige ${DESTRUCTIVE_DOWN_ENV_VAR}=true si el schema tiene datos)`
          : '';

        if (dryRun) {
          logger.log(`[REVERT] [dry-run] revertiría ${schemaName} <- ${step.name}${flagNote}`);
          continue;
        }

        logger.log(`[REVERT] ${schemaName} <- ${step.name}${flagNote}`);
        await revertSingleStep(queryRunner, step);
        logger.log(`[REVERT] ${schemaName} <- ${step.name}: revertida`);
      }

      return plan;
    } finally {
      await queryRunner.release();
    }
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
    await releaseGlobalLock(baseDataSource);
  }
}

async function revertSingleStep(queryRunner: QueryRunner, step: TenantRevertStep): Promise<void> {
  const MigrationClass = migrationClassByName(step.name);

  if (!MigrationClass) {
    // Inalcanzable: planTenantRevert ya lo validó antes de ejecutar nada.
    throw new Error(`Migración "${step.name}" no resoluble en este build.`);
  }

  const migration = new MigrationClass();

  await queryRunner.startTransaction();
  try {
    await migration.down(queryRunner);
    await queryRunner.query(`DELETE FROM "typeorm_migrations" WHERE "id" = $1`, [step.registryId]);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
}
