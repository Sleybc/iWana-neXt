import { DataSource } from 'typeorm';
import { runInTenantSchema } from '../../data-source';

/**
 * Migración retroactiva de schemas de tenant — Campo mfa_required en users.
 *
 * Agrega columna `mfa_required` a la tabla `users` en TODOS los schemas
 * de tenant activos. Default false — no cambia el comportamiento de usuarios existentes.
 *
 * Uso:
 *   pnpm --filter @iwana/db migration:tenant:run
 */
export async function runMigration(dataSource: DataSource): Promise<void> {
  const tenants = (await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  )) as Array<{ id: string; schema_name: string }>;

  if (tenants.length === 0) {
    console.log('[tenant-migration] No hay tenants activos. Nada que migrar.');
    return;
  }

  console.log(`[tenant-migration] Migrando ${tenants.length} tenant(s)...`);

  const results: { schema: string; success: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    try {
      await runInTenantSchema(dataSource, tenant.schema_name, async (qr) => {
        await qr.query(`
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT false
        `);
      });
      results.push({ schema: tenant.schema_name, success: true });
      console.log(`[tenant-migration] ✓ ${tenant.schema_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ schema: tenant.schema_name, success: false, error: message });
      console.error(`[tenant-migration] ✗ ${tenant.schema_name}: ${message}`);
    }
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    throw new Error(`Migración parcialmente fallida: ${failed.length}/${tenants.length} schemas.`);
  }

  console.log(`[tenant-migration] Completado. ${tenants.length} schema(s) migrados exitosamente.`);
}

/**
 * Punto de entrada para ejecutar desde CLI:
 *   node dist/migrations/tenant/004_add_mfa_required_to_users.js
 */
async function main() {
  const { AppDataSource } = await import('../../data-source');
  await AppDataSource.initialize();
  try {
    await runMigration(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}

// Solo ejecutar si se llama directamente (no como módulo importado)
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
