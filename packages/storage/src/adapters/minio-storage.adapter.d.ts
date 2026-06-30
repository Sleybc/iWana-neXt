import type { Readable } from 'node:stream';
import type { PutObjectOptions, StoragePort } from '../ports/storage.port';
/**
 * Configuración para el adaptador MinIO / S3.
 */
export interface MinioStorageConfig {
    /** Endpoint completo, ej: 'http://localhost:9002' o 'http://minio:9000' */
    endpoint: string;
    /** Región — MinIO acepta cualquier valor, ej: 'us-east-1' */
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Nombre del bucket donde se almacenan los objetos */
    bucket: string;
    /**
     * Forzar path-style para MinIO on-premise.
     * Con virtual-hosted-style MinIO requiere wildcard DNS — no disponible on-prem.
     */
    forcePathStyle: boolean;
    /**
     * URL base para construir URLs públicas de los objetos.
     * Si no se provee, se construye desde endpoint + bucket.
     * Ej: 'https://cdn.midominio.co'
     */
    publicBaseUrl?: string;
}
/**
 * Adaptador de almacenamiento MinIO / S3 compatible.
 *
 * Usa @aws-sdk/client-s3 v3 con path-style forced para compatibilidad on-premise
 * con MinIO sin DNS wildcard.
 *
 * ADR-033 — Storage MinIO + StoragePort
 */
export declare class MinioStorageAdapter implements StoragePort {
    private readonly config;
    private readonly client;
    private readonly bucket;
    private readonly publicBaseUrl;
    constructor(config: MinioStorageConfig);
    putObject(objectKey: string, body: Buffer | Readable, options: PutObjectOptions): Promise<void>;
    deleteObject(objectKey: string): Promise<void>;
    objectExists(objectKey: string): Promise<boolean>;
    getPublicUrl(objectKey: string): string;
    getSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
//# sourceMappingURL=minio-storage.adapter.d.ts.map