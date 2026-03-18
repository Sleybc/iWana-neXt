import fs from 'fs';
import path from 'path';
import { DataSource } from 'typeorm';

type TenantMigrationModule = {
  runMigration?: (dataSource: DataSource) => Promise<void>;
};

/**
 * Retorna los archivos de migracion tenant versionados disponibles en el directorio.
 *
 * Convencion esperada:
 * - 003_add_user_profile_fields.js
 * - 004_add_mfa_required_to_users.js
 *
 * Se excluye este runner (`run-all`) para evitar recursion y se ordena por prefijo
 * numerico ascendente para mantener una ejecucion deterministica.
 */
function getTenantMigrationFiles(directoryPath: string): string[] {
  return fs
    .readdirSync(directoryPath)
    .filter((fileName) => /^\d{3}_.+\.js$/.test(fileName))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => path.join(directoryPath, fileName));
}

/**
 * Ejecuta todas las migraciones tenant compiladas en `dist/migrations/tenant`.
 *
 * Cada modulo debe exportar `runMigration(dataSource)`; si no lo hace, el runner
 * falla explicitamente para evitar una ejecucion parcial o silenciosa.
 */
export async function runAllTenantMigrations(dataSource: DataSource): Promise<void> {
  const migrationFiles = getTenantMigrationFiles(__dirname);

  if (migrationFiles.length === 0) {
    console.log('[tenant-migration] No hay migraciones tenant compiladas para ejecutar.');
    return;
  }

  console.log(`[tenant-migration] Ejecutando ${migrationFiles.length} migracion(es) tenant...`);

  for (const migrationFilePath of migrationFiles) {
    const fileName = path.basename(migrationFilePath);
    console.log(`[tenant-migration] → ${fileName}`);

    const migrationModule = require(migrationFilePath) as TenantMigrationModule;
    if (typeof migrationModule.runMigration !== 'function') {
      throw new Error(
        `El modulo ${fileName} no exporta runMigration(dataSource). Ejecucion abortada.`,
      );
    }

    await migrationModule.runMigration(dataSource);
  }

  console.log('[tenant-migration] Todas las migraciones tenant finalizaron correctamente.');
}

/**
 * Punto de entrada para ejecutar desde CLI:
 *   node dist/migrations/tenant/run-all.js
 */
async function main() {
  const { AppDataSource } = await import('../../data-source');
  await AppDataSource.initialize();
  try {
    await runAllTenantMigrations(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}