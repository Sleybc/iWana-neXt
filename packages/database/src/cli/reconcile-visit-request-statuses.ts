import { AppDataSource, runInTenantSchema } from '../data-source';

type ActiveTenant = {
  schema_name: string;
};

type ReconcileResult = {
  schemaName: string;
  updatedCount: number;
};

const READY_TO_SCHEDULE = 'READY_TO_SCHEDULE';
const NEEDS_CONTEXT = 'NEEDS_CONTEXT';

function buildStatusReconciliationSql(alias: string): string {
  return `CASE
    WHEN NULLIF(TRIM(${alias}.address), '') IS NOT NULL
     AND NULLIF(TRIM(${alias}.municipality), '') IS NOT NULL
    THEN '${READY_TO_SCHEDULE}'::visit_request_status
    ELSE '${NEEDS_CONTEXT}'::visit_request_status
  END`;
}

async function getActiveTenants(): Promise<ActiveTenant[]> {
  return AppDataSource.query(`
    SELECT schema_name
    FROM public.tenants
    WHERE status = 'ACTIVE'
    ORDER BY schema_name ASC
  `);
}

async function reconcileTenant(schemaName: string): Promise<ReconcileResult> {
  const nextStatusSql = buildStatusReconciliationSql('vr');

  return runInTenantSchema(AppDataSource, schemaName, async (qr) => {
    const result = await qr.query(`
      WITH updated AS (
        UPDATE visit_requests vr
        SET status = ${nextStatusSql},
            updated_at = NOW()
        WHERE vr.deleted_at IS NULL
          AND vr.status IN (
            '${READY_TO_SCHEDULE}'::visit_request_status,
            '${NEEDS_CONTEXT}'::visit_request_status
          )
          AND vr.status IS DISTINCT FROM ${nextStatusSql}
        RETURNING 1
      )
      SELECT COUNT(*)::int AS updated_count
      FROM updated
    `);

    const updatedCount = Number(result?.[0]?.updated_count ?? 0);

    return {
      schemaName,
      updatedCount: Number.isFinite(updatedCount) ? updatedCount : 0,
    };
  });
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  let exitCode = 0;

  try {
    const tenants = await getActiveTenants();
    const failures: Array<{ schemaName: string; error: unknown }> = [];
    const successes: ReconcileResult[] = [];

    console.log(`[RECONCILE] Iniciando saneamiento para ${tenants.length} tenant(s)`);

    for (const tenant of tenants) {
      const startTime = Date.now();

      try {
        const result = await reconcileTenant(tenant.schema_name);
        successes.push(result);
        console.log(
          `[RECONCILE] ${tenant.schema_name}: ${result.updatedCount} solicitud(es) corregida(s) en ${Date.now() - startTime}ms`,
        );
      } catch (error) {
        failures.push({ schemaName: tenant.schema_name, error });
        console.error(`[RECONCILE] ${tenant.schema_name}: fallo durante el saneamiento`, error);
      }
    }

    const totalUpdated = successes.reduce((sum, item) => sum + item.updatedCount, 0);
    console.log(`[RECONCILE] Total de solicitudes corregidas: ${totalUpdated}`);

    if (failures.length > 0) {
      throw new Error(
        `El saneamiento falló en ${failures.length} tenant(s): ${failures
          .map((failure) => failure.schemaName)
          .join(', ')}`,
      );
    }

    console.log('[RECONCILE] Saneamiento completado sin errores');
  } catch (error) {
    console.error('[RECONCILE] Error fatal:', error);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }

  process.exit(exitCode);
}

main();
