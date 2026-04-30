/**
 * @iwana/storage — Capa de abstracción de almacenamiento de objetos.
 *
 * Expone StoragePort (contrato), STORAGE_PORT (token DI), adaptadores
 * y la factoría createStorageAdapter para instanciar el driver correcto
 * según STORAGE_DRIVER.
 *
 * Drivers disponibles:
 * - 'minio'  → MinioStorageAdapter (MinIO S3-compatible, producción)
 * - 'local'  → LocalFsStorageAdapter (sistema de archivos, solo dev)
 *
 * ADR-033 — Storage MinIO + StoragePort
 * ADR-034 — Bounded Context Media/Assets
 */

// Contrato + token DI
export type { StoragePort, PutObjectOptions } from './ports/storage.port';
export { STORAGE_PORT } from './ports/storage.port';

// Adaptadores
export { MinioStorageAdapter } from './adapters/minio-storage.adapter';
export type { MinioStorageConfig } from './adapters/minio-storage.adapter';
export { LocalFsStorageAdapter } from './adapters/local-fs-storage.adapter';

// Factoría
export { createStorageAdapter } from './create-storage-adapter';
export type { CreateStorageAdapterOptions, StorageDriver } from './create-storage-adapter';
