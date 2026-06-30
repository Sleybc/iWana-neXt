import { type MinioStorageConfig } from './adapters/minio-storage.adapter';
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
export declare function createStorageAdapter(options: CreateStorageAdapterOptions): StoragePort;
//# sourceMappingURL=create-storage-adapter.d.ts.map