import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { validateMagicBytes } from './magic-bytes';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MediaAsset, MediaUsage } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  EVIDENCE_ASSET_CONSTRAINTS,
  EVIDENCE_ASSET_PORT,
  type EvidenceUploadResult,
  type IEvidenceAssetPort,
} from '../tasks/ports/evidence-asset.port';

export const EVIDENCE_ANALYSIS_QUEUE = 'evidence-analysis';

export interface EvidenceAnalysisJobData {
  tenantSchema: string;
  mediaAssetId: string;
  correlationId: string;
}

/**
 * Extensión de archivo a partir del MIME type.
 */
function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? 'bin';
}

/**
 * Implementación del puerto IEvidenceAssetPort.
 *
 * Reside en MOD03 Media/Assets porque es la única capa que debe conocer
 * MediaAsset, StoragePort y el bucket físico. MOD11 solo consume el puerto
 * via EVIDENCE_ASSET_PORT.
 *
 * Wrapping MediaService + StoragePort para proveer las operaciones de ciclo de
 * vida de evidencia que MOD11 necesita, respetando el boundary:
 * - Sin FK cross-schema
 * - Sin importar repositorios de MOD11
 * - Object key determinista derivado de mediaAssetId
 * - Sin PII en keys, metadata ni logs
 *
 * ADR-034 — Bounded Context Media/Assets
 * ADR-068 — Sincronización de OT de ejecución y proyecciones operativas
 */
@Injectable()
export class EvidenceAssetProvider implements IEvidenceAssetPort {
  private readonly logger = new Logger(EvidenceAssetProvider.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
    private readonly config: ConfigService,
    @InjectQueue(EVIDENCE_ANALYSIS_QUEUE)
    private readonly analysisQueue: Queue,
  ) {
    this.mediaRepo = this.dataSource.getRepository(MediaAsset);
  }

  private readonly mediaRepo: Repository<MediaAsset>;

  private getMediaRepo(manager?: EntityManager): Repository<MediaAsset> {
    return manager?.getRepository(MediaAsset) ?? this.mediaRepo;
  }

  async createUploadIntent(
    tenantSchema: string,
    file: Express.Multer.File,
    actorId: string,
    manager?: EntityManager,
  ): Promise<EvidenceUploadResult> {
    const mediaRepo = this.getMediaRepo(manager);

    // ── Validación de tamaño ────────────────────────────────────────────────
    if (file.size > EVIDENCE_ASSET_CONSTRAINTS.MAX_BYTES) {
      const maxMb = Math.round(EVIDENCE_ASSET_CONSTRAINTS.MAX_BYTES / (1024 * 1024));
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_TOO_LARGE',
        message: `El archivo supera el tamaño máximo de ${maxMb} MB.`,
      });
    }

    if (file.size === 0) {
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_EMPTY',
        message: 'El archivo está vacío.',
      });
    }

    // ── Validación MIME por allowlist ──────────────────────────────────────
    const declaredMime = (file.mimetype?.toLowerCase() ?? 'application/octet-stream') as string;
    const allowedMimes: readonly string[] = EVIDENCE_ASSET_CONSTRAINTS.ALLOWED_MIMES;
    if (!allowedMimes.includes(declaredMime)) {
      throw new BadRequestException({
        code: 'EVIDENCE_MIME_NOT_ALLOWED',
        message: `MIME type '${file.mimetype}' no permitido para evidencia.`,
      });
    }

    // ── Validación magic bytes ─────────────────────────────────────────────
    if (!validateMagicBytes(file.buffer, declaredMime)) {
      this.logger.warn(`Magic bytes mismatch: declared=${declaredMime} size=${file.size}`);
      throw new BadRequestException({
        code: 'EVIDENCE_MIME_MISMATCH',
        message: 'El contenido del archivo no coincide con el tipo declarado.',
      });
    }

    // ── SHA-256 checksum ───────────────────────────────────────────────────
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

    // ── Nombre de archivo opaco generado por el servidor ───────────────────
    const ext = mimeToExt(declaredMime);

    // ── Crear registro en BD (QUARANTINED) ──────────────────────────────────
    const assetId = randomUUID();
    const objectKey = `${tenantSchema}/${MediaUsage.EXECUTION_EVIDENCE}/${assetId}.${ext}`;

    const asset = mediaRepo.create({
      tenantSchema,
      usage: MediaUsage.EXECUTION_EVIDENCE,
      themeVariant: null,
      // El nombre recibido es no confiable y no se persiste. El nombre opaco
      // servidor-side evita filtrar datos aportados por el cliente.
      originalFilename: `${assetId}.${ext}`,
      mimeType: declaredMime,
      ext,
      sizeBytes: file.size,
      objectKey,
      publicUrl: null,
      uploadedByUserId: actorId || null,
      assetStatus: 'QUARANTINED',
      claimRef: null,
      checksumSha256,
      // Forzar id para que coincida con objectKey determinista
      id: assetId,
    } as Partial<MediaAsset> & { id: string });

    let saved: MediaAsset;

    try {
      saved = await mediaRepo.save(asset);
    } catch (err: unknown) {
      this.logger.error(`Error al persistir metadata de evidencia: ${String(err)}`);
      throw new BadRequestException({
        code: 'EVIDENCE_METADATA_PERSIST_FAILED',
        message: 'Error al registrar el asset de evidencia.',
      });
    }

    // ── Subir objeto a MinIO ────────────────────────────────────────────────
    try {
      await this.storage.putObject(objectKey, file.buffer, {
        contentType: declaredMime,
        contentLength: file.size,
        metadata: {
          tenantSchema,
          usage: MediaUsage.EXECUTION_EVIDENCE,
          assetId: saved.id,
          uploadedBy: actorId || 'system',
        },
      });
    } catch (err: unknown) {
      // Compensación: revertir el registro en BD
      await mediaRepo.delete(saved.id);
      this.logger.error(`Fallo al subir objeto a storage [assetId=${saved.id}]: ${String(err)}`);
      throw new BadRequestException({
        code: 'EVIDENCE_STORAGE_WRITE_FAILED',
        message: 'Error al almacenar el archivo de evidencia.',
      });
    }

    this.logger.log(
      `Asset de evidencia creado [id=${saved.id} tenant=${tenantSchema} ` +
        `mime=${declaredMime} bytes=${file.size}]`,
    );

    await this.analysisQueue.add(
      'analyze-evidence-asset',
      {
        tenantSchema,
        mediaAssetId: saved.id,
        correlationId: saved.id,
      } satisfies EvidenceAnalysisJobData,
      {
        jobId: `evidence-analysis-${saved.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    const now = new Date();
    return {
      mediaAssetId: saved.id,
      checksumSha256,
      mimeType: declaredMime,
      sizeBytes: file.size,
      uploadedAt: now.toISOString(),
    };
  }

  async getAssetStatus(
    mediaAssetId: string,
    tenantSchema: string,
  ): Promise<{
    status: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string | null;
    uploadedAt: string;
    expiresAt?: string;
  }> {
    const asset = await this.mediaRepo.findOne({
      where: { id: mediaAssetId, tenantSchema },
      select: [
        'id',
        'assetStatus',
        'mimeType',
        'sizeBytes',
        'checksumSha256',
        'createdAt',
        'deletedAt',
      ],
    });

    if (!asset || asset.deletedAt) {
      throw new NotFoundException({
        code: 'EVIDENCE_ASSET_NOT_FOUND',
        message: 'Asset de evidencia no encontrado.',
      });
    }

    // Mapear estado interno a estado público (ADR-068: QUARANTINED → PENDING_ANALYSIS)
    const publicStatus = mapInternalStatus(asset.assetStatus);

    // Calcular expiración: 24h desde creación para assets no reclamados
    const expiresAt = new Date(
      asset.createdAt.getTime() + EVIDENCE_ASSET_CONSTRAINTS.ORPHAN_TTL_MINUTES * 60 * 1000,
    );

    return {
      status: publicStatus,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksumSha256: asset.checksumSha256,
      uploadedAt: asset.createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async getSignedUrl(
    mediaAssetId: string,
    tenantSchema: string,
    ttlSeconds: number,
  ): Promise<string> {
    const clampedTtl = Math.min(ttlSeconds, EVIDENCE_ASSET_CONSTRAINTS.MAX_SIGNED_URL_TTL_SECONDS);

    const asset = await this.mediaRepo.findOne({
      where: { id: mediaAssetId, tenantSchema },
      select: ['id', 'objectKey', 'assetStatus', 'deletedAt'],
    });

    if (!asset || asset.deletedAt) {
      throw new NotFoundException({
        code: 'EVIDENCE_ASSET_NOT_FOUND',
        message: 'Asset de evidencia no encontrado.',
      });
    }

    // Solo assets AVAILABLE pueden servirse
    if (asset.assetStatus !== 'AVAILABLE') {
      throw new ConflictException({
        code: 'EVIDENCE_ASSET_NOT_AVAILABLE',
        message: 'El asset no está disponible para descarga.',
      });
    }

    try {
      const signedUrl = await this.storage.getSignedUrl(asset.objectKey, clampedTtl);
      // No registrar la URL firmada en logs — contiene credenciales temporales
      this.logger.log(`Signed URL generada [assetId=${mediaAssetId} ttl=${clampedTtl}s]`);
      return signedUrl;
    } catch (err: unknown) {
      this.logger.error(`Error al generar signed URL [assetId=${mediaAssetId}]: ${String(err)}`);
      throw new BadRequestException({
        code: 'EVIDENCE_SIGNED_URL_FAILED',
        message: 'Error al generar la URL de descarga.',
      });
    }
  }

  async claimAsset(
    mediaAssetId: string,
    tenantSchema: string,
    executionOrderId: string,
  ): Promise<void> {
    const claimRef = `${tenantSchema}:${executionOrderId}`;

    // Actualización atómica: solo reclama si está AVAILABLE y no reclamado
    const result = await this.mediaRepo
      .createQueryBuilder()
      .update(MediaAsset)
      .set({ claimRef })
      .where('id = :id', { id: mediaAssetId })
      .andWhere('tenant_schema = :tenantSchema', { tenantSchema })
      .andWhere('asset_status = :status', { status: 'AVAILABLE' })
      .andWhere('claim_ref IS NULL')
      .andWhere('deleted_at IS NULL')
      .execute();

    if ((result.affected ?? 0) === 0) {
      // Verificar por qué falló para dar un mensaje preciso
      const asset = await this.mediaRepo.findOne({
        where: { id: mediaAssetId, tenantSchema },
        select: ['id', 'assetStatus', 'claimRef', 'deletedAt'],
      });

      if (!asset || asset.deletedAt) {
        throw new NotFoundException({
          code: 'EVIDENCE_ASSET_NOT_FOUND',
          message: 'Asset de evidencia no encontrado.',
        });
      }

      if (asset.claimRef) {
        throw new ConflictException({
          code: 'EVIDENCE_ASSET_ALREADY_CLAIMED',
          message: 'El asset ya fue reclamado por otra OT.',
        });
      }

      throw new ConflictException({
        code: 'EVIDENCE_ASSET_NOT_AVAILABLE',
        message: `El asset no está disponible para reclamar (estado: ${asset.assetStatus}).`,
      });
    }

    this.logger.log(`Asset reclamado [id=${mediaAssetId} claimRef=${claimRef}]`);
  }
}

/**
 * Mapea el estado interno del asset al estado público del recibo.
 *
 * ADR-068: Media persiste QUARANTINED → expuesto como PENDING_ANALYSIS.
 * Los estados se mantienen como cadenas para evitar dependencias de enum.
 */
function mapInternalStatus(internal: string): string {
  switch (internal) {
    case 'QUARANTINED':
      return 'PENDING_ANALYSIS';
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'REJECTED':
      return 'REJECTED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'DELETED':
      return 'EXPIRED';
    default:
      return 'PENDING_ANALYSIS';
  }
}

// Export explícito para facilitar tests de inyección del token.
export { EVIDENCE_ASSET_PORT };
