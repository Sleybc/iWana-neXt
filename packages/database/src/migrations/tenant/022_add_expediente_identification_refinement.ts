import { DataSource } from 'typeorm';
import { runInTenantSchema } from '../../data-source';

/**
 * Migracion retroactiva de schemas tenant — MOD05 Identificacion Refinement.
 * Agrega columnas para soporte de persona natural y juridica:
 * - firstName, lastName: nombre y apellido para persona natural
 * - primaryContactName, primaryContactRole: contacto principal para persona juridica
 */
export async function runMigration(dataSource: DataSource): Promise<void> {
  const tenants = (await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  )) as Array<{ id: string; schema_name: string }>;

  if (tenants.length === 0) {
    console.log('[tenant-migration] No hay tenants activos. Nada que migrar.');
    return;
  }

  console.log(
    `[tenant-migration] Aplicando identification refinement en ${tenants.length} tenant(s)...`,
  );

  const results: { schema: string; success: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    try {
      await runInTenantSchema(dataSource, tenant.schema_name, async (qr) => {
        await qr.query(`
          ALTER TABLE expediente_records
          ADD COLUMN IF NOT EXISTS first_name VARCHAR(160)
        `);
        await qr.query(`
          ALTER TABLE expediente_records
          ADD COLUMN IF NOT EXISTS last_name VARCHAR(160)
        `);
        await qr.query(`
          ALTER TABLE expediente_records
          ADD COLUMN IF NOT EXISTS primary_contact_name VARCHAR(160)
        `);
        await qr.query(`
          ALTER TABLE expediente_records
          ADD COLUMN IF NOT EXISTS primary_contact_role VARCHAR(120)
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

  const failed = results.filter((result) => !result.success);
  if (failed.length > 0) {
    console.error(`[tenant-migration] ${failed.length} schema(s) fallaron:`);
    for (const failure of failed) {
      console.error(`  - ${failure.schema}: ${failure.error}`);
    }
    throw new Error(`Migracion parcialmente fallida: ${failed.length}/${tenants.length} schemas.`);
  }

  console.log(
    `[tenant-migration] Identification refinement aplicado en ${tenants.length} schema(s) tenant.`,
  );
}

export async function rollbackMigration(dataSource: DataSource): Promise<void> {
  const tenants = (await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  )) as Array<{ id: string; schema_name: string }>;

  if (tenants.length === 0) {
    console.log('[tenant-migration] No hay tenants activos. Nada que migrar.');
    return;
  }

  console.log(
    `[tenant-migration] Revirtiendo identification refinement en ${tenants.length} tenant(s)...`,
  );

  const results: { schema: string; success: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    try {
      await runInTenantSchema(dataSource, tenant.schema_name, async (qr) => {
        await qr.query(`
          ALTER TABLE expediente_records
          DROP COLUMN IF EXISTS primary_contact_role
        `);
        await qr.query(`
          ALTER TABLE expediente_records
          DROP COLUMN IF EXISTS primary_contact_name
        `);
        await qr.query(`
          ALTER TABLE expediente_records
          DROP COLUMN IF EXISTS last_name
        `);
        await qr.query(`
          ALTER TABLE expediente_records
          DROP COLUMN IF EXISTS first_name
        `);
      });

      results.push({ schema: tenant.schema_name, success: true });
      console.log(`[tenant-migration] ✓ ${tenant.schema_name} (rollback)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ schema: tenant.schema_name, success: false, error: message });
      console.error(`[tenant-migration] ✗ ${tenant.schema_name}: ${message}`);
    }
  }

  const failed = results.filter((result) => !result.success);
  if (failed.length > 0) {
    console.error(`[tenant-migration] ${failed.length} schema(s) fallaron en rollback:`);
    for (const failure of failed) {
      console.error(`  - ${failure.schema}: ${failure.error}`);
    }
    throw new Error(`Rollback parcialmente fallido: ${failed.length}/${tenants.length} schemas.`);
  }

  console.log(
    `[tenant-migration] Rollback de identification refinement aplicado en ${tenants.length} schema(s) tenant.`,
  );
}

async function main() {
  const { AppDataSource } = await import('../../data-source');
  await AppDataSource.initialize();
  try {
    await runMigration(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
