'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.MinioStorageAdapter = void 0;
const client_s3_1 = require('@aws-sdk/client-s3');
const s3_request_presigner_1 = require('@aws-sdk/s3-request-presigner');
/**
 * Adaptador de almacenamiento MinIO / S3 compatible.
 *
 * Usa @aws-sdk/client-s3 v3 con path-style forced para compatibilidad on-premise
 * con MinIO sin DNS wildcard.
 *
 * ADR-033 — Storage MinIO + StoragePort
 */
class MinioStorageAdapter {
  config;
  client;
  bucket;
  publicBaseUrl;
  constructor(config) {
    this.config = config;
    this.bucket = config.bucket;
    this.client = new client_s3_1.S3Client({
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
  async putObject(objectKey, body, options) {
    await this.client.send(
      new client_s3_1.PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
        Metadata: options.metadata,
      }),
    );
  }
  async deleteObject(objectKey) {
    await this.client.send(
      new client_s3_1.DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }
  async objectExists(objectKey) {
    try {
      await this.client.send(
        new client_s3_1.HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      return true;
    } catch (err) {
      // HeadObject lanza NotFound o NoSuchKey cuando el objeto no existe
      const code = err?.name;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }
  getPublicUrl(objectKey) {
    return `${this.publicBaseUrl}/${objectKey}`;
  }
  async getSignedUrl(objectKey, expiresInSeconds) {
    const command = new client_s3_1.GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}
exports.MinioStorageAdapter = MinioStorageAdapter;
//# sourceMappingURL=minio-storage.adapter.js.map
