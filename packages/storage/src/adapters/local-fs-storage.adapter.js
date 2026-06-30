'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.LocalFsStorageAdapter = void 0;
const node_fs_1 = require('node:fs');
const node_path_1 = require('node:path');
/**
 * Adaptador de almacenamiento local sobre el sistema de archivos.
 *
 * SOLO para entornos de desarrollo donde MinIO no está disponible.
 * Configurar con STORAGE_DRIVER=local.
 * NO usar en staging ni producción.
 *
 * Los objetos se guardan en {basePath}/{objectKey}.
 * Las URLs públicas usan el base URL del servidor de archivos estáticos.
 *
 * ADR-033 — Storage MinIO + StoragePort
 */
class LocalFsStorageAdapter {
  basePath;
  publicBaseUrl;
  resolvedBase;
  constructor(basePath, publicBaseUrl = 'http://localhost:3000/storage') {
    this.basePath = basePath;
    this.publicBaseUrl = publicBaseUrl;
    this.resolvedBase = basePath;
    // Crear el directorio base si no existe
    (0, node_fs_1.mkdirSync)(this.resolvedBase, { recursive: true });
  }
  async putObject(objectKey, body, _options) {
    const filePath = (0, node_path_1.join)(this.resolvedBase, objectKey);
    // Crear directorios intermedios (ej: tenant_xxx/logo/)
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    if (Buffer.isBuffer(body)) {
      (0, node_fs_1.writeFileSync)(filePath, body);
    } else {
      // Readable stream — leer y escribir
      await new Promise((resolve, reject) => {
        const chunks = [];
        body.on('data', (chunk) => chunks.push(chunk));
        body.on('error', reject);
        body.on('end', () => {
          (0, node_fs_1.writeFileSync)(filePath, Buffer.concat(chunks));
          resolve();
        });
      });
    }
  }
  async deleteObject(objectKey) {
    const filePath = (0, node_path_1.join)(this.resolvedBase, objectKey);
    if ((0, node_fs_1.existsSync)(filePath)) {
      (0, node_fs_1.rmSync)(filePath, { force: true });
    }
  }
  async objectExists(objectKey) {
    const filePath = (0, node_path_1.join)(this.resolvedBase, objectKey);
    return (0, node_fs_1.existsSync)(filePath) && (0, node_fs_1.statSync)(filePath).isFile();
  }
  getPublicUrl(objectKey) {
    return `${this.publicBaseUrl}/${objectKey}`;
  }
  // Signed URLs no tienen sentido en FS local — devolver URL pública directa
  async getSignedUrl(objectKey, _expiresInSeconds) {
    return Promise.resolve(this.getPublicUrl(objectKey));
  }
  /** Exponer el stream de lectura de un archivo local (útil para pruebas) */
  createReadStream(objectKey) {
    return (0, node_fs_1.createReadStream)((0, node_path_1.join)(this.resolvedBase, objectKey));
  }
}
exports.LocalFsStorageAdapter = LocalFsStorageAdapter;
//# sourceMappingURL=local-fs-storage.adapter.js.map
