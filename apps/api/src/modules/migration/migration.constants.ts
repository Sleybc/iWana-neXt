import type { MigrationBatchCounts } from '@iwana/shared';

/** Reintentos del job de simulación: cubren la carrera job ↔ commit y fallos transitorios. */
export const MIGRATION_SIMULATE_ATTEMPTS = 5;
export const MIGRATION_SIMULATE_BACKOFF_MS = 2_000;

/** Purga diaria (D10) a las 03:30 de Bogotá; un job por tenant, lotes de 50. */
export const MIGRATION_PURGE_CRON_PATTERN = '30 3 * * *';
export const MIGRATION_PURGE_TIME_ZONE = 'America/Bogota';
export const MIGRATION_PURGE_REPEATABLE_JOB_ID = 'migration-import-purge-sweep';
export const MIGRATION_PURGE_BATCH_SIZE = 50;
export const MIGRATION_PURGE_ATTEMPTS = 3;

/**
 * Tope descomprimido del lote completo (H3 sec-eng): el de cada ZIP (200 MiB) por 20 ZIP
 * permitiría 4 GiB. La simulación lo aplica; la promoción solo abre un ZIP a la vez.
 */
export const MIGRATION_MAX_UNCOMPRESSED_BYTES_PER_BATCH = 1024 * 1024 * 1024;

/** Filas por INSERT al cargar las intermedias. */
export const MIGRATION_STAGING_CHUNK = 200;

export const MIGRATION_AUDIT_ENTITY = 'MigrationBatch';
export const MIGRATION_MAPPING_AUDIT_ENTITY = 'MigrationMapping';

export function migrationSimulateJobId(batchId: string): string {
  return `migration-simulate-${batchId}`;
}

/** Prefijo de los objetos del lote: `<schema>/migration/<batchId>/`. */
export function migrationObjectPrefix(schemaName: string, batchId: string): string {
  return `${schemaName}/migration/${batchId}/`;
}

export function migrationObjectKey(prefix: string, fileIndex: number): string {
  return `${prefix}${fileIndex}.zip.enc`;
}

export function initialBatchCounts(filesReceived: number): MigrationBatchCounts {
  return {
    procesamiento: 'PENDIENTE',
    archivos: { recibidos: filesReceived, leidos: 0, rechazados: {} },
    entidades: {},
    observaciones: {},
    tareasSinFuente: 0,
    pendientesEquivalencia: [],
    procesadoEn: null,
  };
}
