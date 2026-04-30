import { LocalFsStorageAdapter } from './adapters/local-fs-storage.adapter';
import { MinioStorageAdapter, type MinioStorageConfig } from './adapters/minio-storage.adapter';
import type { StoragePort } from './ports/storage.port';

export type StorageDriver = 'minio' | 'local';

export interface CreateStorageAdapterOptions {
  driver: StorageDriver;
  /** Requerido cuando driver='minio' */
  minio?: MinioStorageConfig;
  /** Requerido cuando driver='local' */
  localBasePath?: string;
  localPublicBaseUrl?: string;
}

/**
 * Factoría que instancia el adaptador de almacenamiento correcto
 * según la variable STORAGE_DRIVER.
 *
 * Uso típico en NestJS:
 * ```ts
 * {
 *   provide: STORAGE_PORT,
 *   useFactory: (config: ConfigService) =>
 *     createStorageAdapter({
 *       driver: config.get('STORAGE_DRIVER', 'local'),
 *       minio: { ... },
 *       localBasePath: join(process.cwd(), 'storage'),
 *     }),
 *   inject: [ConfigService],
 * }
 * ```
 *
 * ADR-033 — Storage MinIO + StoragePort
 */
export function createStorageAdapter(options: CreateStorageAdapterOptions): StoragePort {
  if (options.driver === 'minio') {
    if (!options.minio) {
      throw new Error('[StorageFactory] driver=minio requiere opciones de configuración S3/MinIO.');
    }
    return new MinioStorageAdapter(options.minio);
  }

  // driver='local' — solo para desarrollo
  return new LocalFsStorageAdapter(
    options.localBasePath ?? './storage',
    options.localPublicBaseUrl,
  );
}
