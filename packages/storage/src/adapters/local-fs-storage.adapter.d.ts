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
export declare class LocalFsStorageAdapter implements StoragePort {
    private readonly basePath;
    private readonly publicBaseUrl;
    private readonly resolvedBase;
    constructor(basePath: string, publicBaseUrl?: string);
    putObject(objectKey: string, body: Buffer | Readable, _options: PutObjectOptions): Promise<void>;
    deleteObject(objectKey: string): Promise<void>;
    objectExists(objectKey: string): Promise<boolean>;
    getPublicUrl(objectKey: string): string;
    getSignedUrl(objectKey: string, _expiresInSeconds: number): Promise<string>;
    /** Exponer el stream de lectura de un archivo local (útil para pruebas) */
    createReadStream(objectKey: string): Readable;
}
//# sourceMappingURL=local-fs-storage.adapter.d.ts.map