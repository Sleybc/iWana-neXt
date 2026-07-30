import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { PutObjectOptions, StoragePort } from '../ports/storage.port';

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
export class LocalFsStorageAdapter implements StoragePort {
  private readonly resolvedBase: string;

  constructor(
    private readonly basePath: string,
    private readonly publicBaseUrl: string = 'http://localhost:3000/storage',
  ) {
    this.resolvedBase = basePath;
    // Crear el directorio base si no existe
    mkdirSync(this.resolvedBase, { recursive: true });
  }

  async putObject(
    objectKey: string,
    body: Buffer | Readable,
    _options: PutObjectOptions,
  ): Promise<void> {
    const filePath = join(this.resolvedBase, objectKey);
    // Crear directorios intermedios (ej: tenant_xxx/logo/)
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });

    if (Buffer.isBuffer(body)) {
      writeFileSync(filePath, body);
    } else {
      // Readable stream — leer y escribir
      await new Promise<void>((resolve, reject) => {
        const chunks: Buffer[] = [];
        body.on('data', (chunk: Buffer) => chunks.push(chunk));
        body.on('error', reject);
        body.on('end', () => {
          writeFileSync(filePath, Buffer.concat(chunks));
          resolve();
        });
      });
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    const filePath = join(this.resolvedBase, objectKey);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }

  async objectExists(objectKey: string): Promise<boolean> {
    const filePath = join(this.resolvedBase, objectKey);
    return existsSync(filePath) && statSync(filePath).isFile();
  }

  async getObject(objectKey: string): Promise<Buffer> {
    return readFileSync(join(this.resolvedBase, objectKey));
  }

  getPublicUrl(objectKey: string): string {
    return `${this.publicBaseUrl}/${objectKey}`;
  }

  // Signed URLs no tienen sentido en FS local — devolver URL pública directa
  async getSignedUrl(objectKey: string, _expiresInSeconds: number): Promise<string> {
    return Promise.resolve(this.getPublicUrl(objectKey));
  }

  /** Exponer el stream de lectura de un archivo local (útil para pruebas) */
  createReadStream(objectKey: string): Readable {
    return createReadStream(join(this.resolvedBase, objectKey));
  }
}
