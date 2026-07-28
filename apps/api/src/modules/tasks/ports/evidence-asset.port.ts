import type { EntityManager } from 'typeorm';
import type { EvidenceAssetReceipt } from '@iwana/shared';

/**
 * Puerto para la gestión de assets de evidencia desde MOD11 hacia Media/Assets.
 *
 * ADR-068 §13: Media/Assets conserva el binario, metadata técnica, análisis y
 * lifecycle; MOD11 conserva upload-intent y relación probatoria OT–asset.
 * Sin FK ni import de repositorios cross-module.
 *
 * Token de inyección: EVIDENCE_ASSET_PORT
 */
export const EVIDENCE_ASSET_PORT = Symbol('EVIDENCE_ASSET_PORT');

/**
 * Resultado de la subida de un asset de evidencia con cuarentena.
 */
export interface EvidenceUploadResult {
  /** UUID del MediaAsset creado en estado QUARANTINED */
  mediaAssetId: string;
  /** SHA-256 del contenido binario */
  checksumSha256: string;
  /** MIME type validado por magic bytes */
  mimeType: string;
  /** Tamaño en bytes */
  sizeBytes: number;
  /** Timestamp de subida */
  uploadedAt: string;
}

/**
 * Contrato tipado para el puerto de assets de evidencia entre MOD11 y Media.
 *
 * MediaModule implementa este puerto y lo expone con el token EVIDENCE_ASSET_PORT.
 * MOD11 lo consume vía @Inject(EVIDENCE_ASSET_PORT).
 */
export interface IEvidenceAssetPort {
  /**
   * Crea un asset de evidencia en estado QUARANTINED (PENDING_ANALYSIS externamente).
   *
   * - Valida MIME por magic bytes (no extensión)
   * - Rechaza tipos no permitidos
   * - Rechaza archivos que excedan el tamaño máximo
   * - Calcula SHA-256 del contenido
   * - Persiste metadata en public.media_assets
   * - Almacena el binario en MinIO vía StoragePort
   * - Object key determinista derivado de mediaAssetId
   *
   * @param tenantSchema Schema del tenant propietario
   * @param file Archivo multipart recibido
   * @param actorId UUID del usuario que sube
   * @param manager EntityManager opcional para ejecutar dentro de una transacción existente.
   *        Si se omite, el provider usa su propio repositorio.
   */
  createUploadIntent(
    tenantSchema: string,
    file: Express.Multer.File,
    actorId: string,
    manager?: EntityManager,
  ): Promise<EvidenceUploadResult>;

  /**
   * Consulta el estado actual de un asset de evidencia.
   *
   * @param mediaAssetId UUID del asset
   * @param tenantSchema Schema del tenant propietario
   * @returns Estado interno (QUARANTINED/AVAILABLE/REJECTED/EXPIRED)
   */
  getAssetStatus(
    mediaAssetId: string,
    tenantSchema: string,
  ): Promise<{
    status: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string | null;
    uploadedAt: string;
    expiresAt?: string;
  }>;

  /**
   * Genera una URL firmada para descargar el contenido del asset.
   *
   * TTL máximo: 15 minutos (900 segundos). Si se solicita más, se recorta.
   * No expone objectKey, bucket ni secretos en la respuesta ni en logs.
   *
   * @param mediaAssetId UUID del asset
   * @param tenantSchema Schema del tenant propietario
   * @param ttlSeconds Tiempo de validez en segundos (máx. 900)
   * @returns URL firmada con el TTL recortado
   */
  getSignedUrl(mediaAssetId: string, tenantSchema: string, ttlSeconds: number): Promise<string>;

  /**
   * Reclama atómicamente un asset AVAILABLE para una OT.
   *
   * - Verifica que el asset existe y está en estado AVAILABLE
   * - Verifica que no haya sido reclamado ya (claimRef IS NULL)
   * - Actualiza claimRef con la referencia opaca [tenantSchema]:[executionOrderId]
   * - Si el asset no está AVAILABLE o ya fue reclamado, lanza error
   *
   * @param mediaAssetId UUID del asset
   * @param tenantSchema Schema del tenant propietario
   * @param executionOrderId UUID de la OT que reclama
   */
  claimAsset(mediaAssetId: string, tenantSchema: string, executionOrderId: string): Promise<void>;
}

/**
 * Constantes de validación para assets de evidencia.
 */
export const EVIDENCE_ASSET_CONSTRAINTS = {
  /** Tamaño máximo: 25 MB */
  MAX_BYTES: 25 * 1024 * 1024,
  /** MIME types permitidos para evidencia (SEC-F04) */
  ALLOWED_MIMES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'image/heic',
    'image/heif',
  ],
  /** TTL máximo para signed URL: 15 minutos */
  MAX_SIGNED_URL_TTL_SECONDS: 900,
  /** TTL para assets huérfanos: 24 horas (antes de ser considerados expirados) */
  ORPHAN_TTL_MINUTES: 24 * 60,
} as const;
