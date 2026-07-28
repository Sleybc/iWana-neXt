import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MediaAsset, MediaUsage } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import { ConfigService } from '@nestjs/config';
import type { IEvidenceAssetPort, EvidenceUploadResult } from './evidence-asset.port';
import { EVIDENCE_ASSET_CONSTRAINTS } from './evidence-asset.port';

/**
 * Magic bytes para validación de MIME types sin depender de la extensión.
 * Cada entrada: [offset, bytes] donde bytes es un array de hex values esperados.
 */
const MAGIC_BYTES: Array<{ mime: string; offset: number; bytes: number[] }> = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // HEIC/HEIF: ftyp box at offset 4, 'heic' or 'mif1' or 'heif' at offset 8
  { mime: 'image/heic', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
];

/**
 * Valida el MIME type real de un buffer usando magic bytes.
 * Retorna true si alguno de los patrones coincide.
 */
function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.length < 12) return false;

  for (const pattern of MAGIC_BYTES) {
    if (pattern.mime !== declaredMime) continue;
    if (buffer.length < pattern.offset + pattern.bytes.length) continue;

    const matches = pattern.bytes.every((byte, i) => buffer[pattern.offset + i] === byte);

    if (matches) {
      // Para WebP, además verificar que empiece con RIFF
      if (declaredMime === 'image/webp') {
        const riff =
          buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        if (!riff) return false;
      }
      return true;
    }
  }

  return false;
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
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mimeType] ?? 'bin';
}

/**
 * Implementación del puerto IEvidenceAssetPort.
 *
 * Wraps MediaService + StoragePort para proveer las operaciones de ciclo de
 * vida de evidencia que MOD11 necesita, respetando el boundary:
 * - Sin FK cross-schema
 * - Sin importar repositorios de MOD11
 * - Object key determinista derivado de mediaAssetId
 * - Sin PII en keys, metadata ni logs
 *
 * Proveído en TasksModule con token EVIDENCE_ASSET_PORT.
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
  ) {
    this.mediaRepo = this.dataSource.getRepository(MediaAsset);
  }

  private readonly mediaRepo: Repository<MediaAsset>;

  async createUploadIntent(
    tenantSchema: string,
    file: Express.Multer.File,
    actorId: string,
  ): Promise<EvidenceUploadResult> {
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
    // Solo para tipos donde tenemos patrones definidos. HEIF/HEIC requiere
    // verificación adicional del ftyp box.
    if (MAGIC_BYTES.some((p) => p.mime === declaredMime)) {
      if (!validateMagicBytes(file.buffer, declaredMime)) {
        this.logger.warn(`Magic bytes mismatch: declared=${declaredMime} size=${file.size}`);
        throw new BadRequestException({
          code: 'EVIDENCE_MIME_MISMATCH',
          message: 'El contenido del archivo no coincide con el tipo declarado.',
        });
      }
    }

    // ── SHA-256 checksum ───────────────────────────────────────────────────
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

    // ── Sanitizar nombre de archivo ─────────────────────────────────────────
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const ext = mimeToExt(declaredMime);

    // ── Crear registro en BD (QUARANTINED) ──────────────────────────────────
    const assetId = randomUUID();
    const objectKey = `${tenantSchema}/${MediaUsage.EXECUTION_EVIDENCE}/${assetId}.${ext}`;

    const asset = this.mediaRepo.create({
      tenantSchema,
      usage: MediaUsage.EXECUTION_EVIDENCE,
      themeVariant: null,
      originalFilename: safeFilename || 'evidence',
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
      saved = await this.mediaRepo.save(asset);
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
      await this.mediaRepo.delete(saved.id);
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
