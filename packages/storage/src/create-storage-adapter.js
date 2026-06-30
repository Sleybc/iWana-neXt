'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createStorageAdapter = createStorageAdapter;
const local_fs_storage_adapter_1 = require('./adapters/local-fs-storage.adapter');
const minio_storage_adapter_1 = require('./adapters/minio-storage.adapter');
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
function createStorageAdapter(options) {
  if (options.driver === 'minio') {
    if (!options.minio) {
      throw new Error('[StorageFactory] driver=minio requiere opciones de configuración S3/MinIO.');
    }
    return new minio_storage_adapter_1.MinioStorageAdapter(options.minio);
  }
  // driver='local' — solo para desarrollo
  return new local_fs_storage_adapter_1.LocalFsStorageAdapter(
    options.localBasePath ?? './storage',
    options.localPublicBaseUrl,
  );
}
//# sourceMappingURL=create-storage-adapter.js.map
