import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
export class MinioStorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: MinioStorageConfig) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });

    // URL pública: si se configura publicBaseUrl, usarla; si no, construir desde endpoint+bucket
    this.publicBaseUrl =
      config.publicBaseUrl?.replace(/\/$/, '') ??
      `${config.endpoint.replace(/\/$/, '')}/${config.bucket}`;
  }

  async putObject(
    objectKey: string,
    body: Buffer | Readable,
    options: PutObjectOptions,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
        Metadata: options.metadata,
      }),
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      return true;
    } catch (err) {
      // HeadObject lanza NotFound o NoSuchKey cuando el objeto no existe
      const code = (err as { name?: string })?.name;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    if (!response.Body) {
      throw new Error('Storage object returned without a body');
    }

    if ('transformToByteArray' in response.Body) {
      return Buffer.from(await response.Body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  getPublicUrl(objectKey: string): string {
    return `${this.publicBaseUrl}/${objectKey}`;
  }

  async getSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
