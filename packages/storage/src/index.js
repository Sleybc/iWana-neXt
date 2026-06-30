'use strict';
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.createStorageAdapter =
  exports.LocalFsStorageAdapter =
  exports.MinioStorageAdapter =
  exports.STORAGE_PORT =
    void 0;
var storage_port_1 = require('./ports/storage.port');
Object.defineProperty(exports, 'STORAGE_PORT', {
  enumerable: true,
  get: function () {
    return storage_port_1.STORAGE_PORT;
  },
});
// Adaptadores
var minio_storage_adapter_1 = require('./adapters/minio-storage.adapter');
Object.defineProperty(exports, 'MinioStorageAdapter', {
  enumerable: true,
  get: function () {
    return minio_storage_adapter_1.MinioStorageAdapter;
  },
});
var local_fs_storage_adapter_1 = require('./adapters/local-fs-storage.adapter');
Object.defineProperty(exports, 'LocalFsStorageAdapter', {
  enumerable: true,
  get: function () {
    return local_fs_storage_adapter_1.LocalFsStorageAdapter;
  },
});
// Factoría
var create_storage_adapter_1 = require('./create-storage-adapter');
Object.defineProperty(exports, 'createStorageAdapter', {
  enumerable: true,
  get: function () {
    return create_storage_adapter_1.createStorageAdapter;
  },
});
//# sourceMappingURL=index.js.map
