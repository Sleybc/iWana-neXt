import type { Readable } from 'node:stream';
/**
 * Opciones para subir un objeto al almacenamiento.
 */
export interface PutObjectOptions {
    /** MIME type del archivo (ej: 'image/png', 'image/svg+xml') */
    contentType: string;
    /** Tamaño en bytes — recomendado para S3 multipart correcto */
    contentLength?: number;
    /** Metadatos arbitrarios asociados al objeto */
    metadata?: Record<string, string>;
}
/**
 * Contrato de almacenamiento de objetos de iWana neXt.
 *
 * El adaptador primario es MinioStorageAdapter (MinIO S3-compatible).
 * En entornos de desarrollo local sin MinIO, se puede usar LocalFsStorageAdapter
 * configurando STORAGE_DRIVER=local.
 *
 * Naming de objectKey: {tenantSchema}/{usage}/{assetId}.{ext}
 * - tenantSchema: schema del tenant (ej: 'tenant_mi_isp') o 'platform' para assets globales.
 * - usage: 'logo' | 'seal' | 'favicon' | 'login_background' | 'general'
 * - assetId: UUID del MediaAsset
 * - ext: extensión del archivo (sin punto, ej: 'png')
 *
 * ADR-033 — Storage MinIO + StoragePort
 */
export interface StoragePort {
    /**
     * Sube un objeto al bucket configurado.
     * @param objectKey Clave del objeto (path relativo dentro del bucket)
     * @param body Buffer o stream con el contenido del archivo
     * @param options Opciones de content-type, tamaño y metadatos
     */
    putObject(objectKey: string, body: Buffer | Readable, options: PutObjectOptions): Promise<void>;
    /**
     * Elimina un objeto del bucket.
     * No lanza error si el objeto no existe.
     */
    deleteObject(objectKey: string): Promise<void>;
    /**
     * Verifica si un objeto existe en el bucket.
     */
    objectExists(objectKey: string): Promise<boolean>;
    /**
     * Construye la URL pública de un objeto (bucket público o CDN configurado).
     * Síncrono — no realiza ninguna petición de red.
     */
    getPublicUrl(objectKey: string): string;
    /**
     * Genera una URL pre-firmada para acceso temporal a un objeto privado.
     * @param objectKey Clave del objeto
     * @param expiresInSeconds Tiempo de validez en segundos (máx. 604800 = 7 días)
     */
    getSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
/**
 * Token de inyección de dependencias para el StoragePort.
 * Usar con @Inject(STORAGE_PORT) en constructores NestJS.
 */
export declare const STORAGE_PORT: unique symbol;
//# sourceMappingURL=storage.port.d.ts.map