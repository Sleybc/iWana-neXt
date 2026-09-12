import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { MediaAsset, MediaUsage } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import { imageSize } from 'image-size';
import { validateMagicBytes } from './magic-bytes';
import type { UploadMediaDto } from './dto/upload-media.dto';
import type { MediaAssetResponseDto } from './dto/media-asset-response.dto';

/**
 * Restricciones de validación por uso del asset.
 * Alineadas con PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.
 */
const MEDIA_CONSTRAINTS: Record<MediaUsage, { maxBytes: number; allowedMimes: string[] }> = {
  [MediaUsage.LOGO]: {
    maxBytes: 1 * 1024 * 1024, // 1 MB
    allowedMimes: ['image/png', 'image/webp', 'image/jpeg'],
  },
  [MediaUsage.SEAL]: {
    maxBytes: 512 * 1024, // 512 KB
    allowedMimes: ['image/png', 'image/webp', 'image/jpeg'],
  },
  [MediaUsage.FAVICON]: {
    maxBytes: 256 * 1024, // 256 KB
    allowedMimes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
  },
  [MediaUsage.LOGIN_BACKGROUND]: {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    allowedMimes: ['image/jpeg', 'image/webp', 'image/png'],
  },
  [MediaUsage.GENERAL]: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimes: [
      'image/png',
      'image/webp',
      'image/jpeg',
      'image/gif',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ],
  },
  [MediaUsage.EXECUTION_EVIDENCE]: {
    maxBytes: 25 * 1024 * 1024, // 25 MB
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
  },
};

type DimensionConstraint = {
  minWidth: number;
  minHeight: number;
  aspectRatioMin?: number;
  aspectRatioMax?: number;
  square?: boolean;
  maxWidth?: number;
  maxHeight?: number;
};

const MEDIA_DIMENSION_CONSTRAINTS: Partial<Record<MediaUsage, DimensionConstraint>> = {
  [MediaUsage.LOGO]: {
    minWidth: 240,
    minHeight: 60,
    aspectRatioMin: 1.6,
    aspectRatioMax: 5,
  },
  [MediaUsage.SEAL]: {
    minWidth: 128,
    minHeight: 128,
    square: true,
    maxWidth: 1024,
    maxHeight: 1024,
  },
  [MediaUsage.FAVICON]: {
    minWidth: 32,
    minHeight: 32,
    square: true,
    maxWidth: 512,
    maxHeight: 512,
  },
  [MediaUsage.LOGIN_BACKGROUND]: {
    minWidth: 1280,
    minHeight: 720,
    aspectRatioMin: 1.6,
    aspectRatioMax: 1.9,
  },
};

/**
 * Servicio MediaAsset — MOD03 Media/Assets.
 *
 * Gestiona el ciclo de vida de assets de branding empresarial:
 * - Subida validada (MIME type, tamaño, usage)
 * - Almacenamiento en MinIO vía StoragePort
 * - Soft delete con limpieza física delegada al worker
 * - Generación de URLs firmadas para assets privados
 *
 * ADR-033 + ADR-034
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sube un archivo y registra el MediaAsset en BD.
   *
   * @param tenantSchema Schema del tenant propietario ('platform' para SYSTEM_ADMIN)
   * @param dto Metadatos del upload (usage, themeVariant)
   * @param file Archivo recibido por multipart/form-data
   * @param uploadedByUserId UUID del usuario que sube el archivo
   */
  async upload(
    tenantSchema: string,
    dto: UploadMediaDto,
    file: Express.Multer.File,
    uploadedByUserId?: string,
  ): Promise<MediaAssetResponseDto> {
    this.assertTenantSchema(tenantSchema);
    const usage = dto.usage ?? MediaUsage.GENERAL;

    if (usage === MediaUsage.EXECUTION_EVIDENCE) {
      throw new BadRequestException({
        code: 'MEDIA_GENERIC_EXECUTION_EVIDENCE_FORBIDDEN',
        message: 'La evidencia de ejecución debe cargarse mediante el flujo de evidencia.',
      });
    }

    // Validar MIME type y tamaño según el uso declarado
    this.validateFile(file, usage);

    // Extraer extensión del MIME type para naming consistente
    const ext = this.mimeToExt(file.mimetype);

    // Crear registro en BD primero para obtener UUID → usado en objectKey
    const asset = this.mediaRepo.create({
      tenantSchema,
      usage,
      themeVariant: dto.themeVariant ?? null,
      // El nombre recibido es no confiable y no se persiste.
      originalFilename: `${randomUUID()}.${ext}`,
      mimeType: file.mimetype,
      ext,
      sizeBytes: file.size,
      // objectKey se calcula después de tener el id
      objectKey: '',
      publicUrl: null,
      uploadedByUserId: uploadedByUserId ?? null,
    });

    const saved = await this.mediaRepo.save(asset);

    // Calcular objectKey con el UUID real
    const objectKey = `${tenantSchema}/${usage}/${saved.id}.${ext}`;

    // Subir objeto a MinIO
    try {
      await this.storage.putObject(objectKey, file.buffer, {
        contentType: file.mimetype,
        contentLength: file.size,
        metadata: {
          tenantSchema,
          usage,
          assetId: saved.id,
          uploadedBy: uploadedByUserId ?? 'system',
        },
      });
    } catch (err) {
      // Rollback del registro en BD si falla el storage
      await this.mediaRepo.delete(saved.id);
      this.logger.error(`Fallo al subir objeto a storage [assetId=${saved.id}]: ${String(err)}`);
      throw new BadRequestException('Error al almacenar el archivo. Intenta de nuevo.');
    }

    // Actualizar objectKey y publicUrl
    // La URL pública aplica si el bucket es público o si existe una base pública explícita.
    const bucketPublicConfig = this.config.get<string | boolean>('S3_BUCKET_PUBLIC');
    const bucketPublic = bucketPublicConfig === true || bucketPublicConfig === 'true';
    const publicBaseUrl = this.config.get<string>('S3_PUBLIC_BASE_URL');
    const hasPublicBaseUrl = typeof publicBaseUrl === 'string' && publicBaseUrl.trim().length > 0;
    const storageDriver = this.config.get<string>('STORAGE_DRIVER', 'local');
    const publicUrl =
      storageDriver === 'local' || bucketPublic || hasPublicBaseUrl
        ? this.storage.getPublicUrl(objectKey)
        : null;

    await this.mediaRepo.update(saved.id, { objectKey, publicUrl });
    saved.objectKey = objectKey;
    saved.publicUrl = publicUrl;

    this.logger.log(`Asset subido [id=${saved.id} usage=${usage} tenant=${tenantSchema}]`);

    return this.toResponseDto(saved);
  }

  /**
   * Obtiene un asset por ID y verifica que pertenece al tenant indicado.
   */
  async findOne(id: string, tenantSchema: string): Promise<MediaAssetResponseDto> {
    this.assertTenantSchema(tenantSchema);
    const asset = await this.mediaRepo.findOne({
      where: { id, tenantSchema, deletedAt: IsNull() },
    });

    if (!asset || asset.deletedAt) {
      throw new NotFoundException(`Asset ${id} no encontrado.`);
    }

    return this.toResponseDto(asset);
  }

  /**
   * Genera una URL pre-firmada para acceso temporal a un asset privado.
   * @param expiresInSeconds Tiempo de validez (máx. 3600 = 1 hora por política)
   */
  async getSignedUrl(
    id: string,
    tenantSchema: string,
    expiresInSeconds = 3600,
  ): Promise<{ signedUrl: string; expiresAt: Date }> {
    this.assertTenantSchema(tenantSchema);
    const asset = await this.mediaRepo.findOne({
      where: { id, tenantSchema },
    });

    if (!asset || asset.deletedAt) {
      throw new NotFoundException(`Asset ${id} no encontrado.`);
    }

    // Por política de seguridad, la URL firmada expira en máx. 1 hora
    const clampedExpiry = Math.min(expiresInSeconds, 3600);
    const signedUrl = await this.storage.getSignedUrl(asset.objectKey, clampedExpiry);
    const expiresAt = new Date(Date.now() + clampedExpiry * 1000);

    return { signedUrl, expiresAt };
  }

  /**
   * Soft delete del asset: marca deleted_at.
   * El worker eliminará el objeto físico de MinIO en la tarea de limpieza.
   * TODO: implementar job BullMQ de limpieza física (Fase 03B+).
   */
  async softDelete(id: string, tenantSchema: string): Promise<void> {
    this.assertTenantSchema(tenantSchema);
    const asset = await this.mediaRepo.findOne({
      where: { id, tenantSchema },
    });

    if (!asset || asset.deletedAt) {
      throw new NotFoundException(`Asset ${id} no encontrado.`);
    }

    await this.mediaRepo.update(id, { deletedAt: new Date() });
    this.logger.log(`Asset soft-deleted [id=${id} tenant=${tenantSchema}]`);
  }

  // ─── Helpers privados ────────────────────────────────────────────────────────

  private assertTenantSchema(tenantSchema: string): void {
    if (
      typeof tenantSchema !== 'string' ||
      tenantSchema.trim().length === 0 ||
      tenantSchema === 'platform'
    ) {
      throw new BadRequestException('Se requiere un tenant autenticado para operar sobre media.');
    }
  }

  private validateFile(file: Express.Multer.File, usage: MediaUsage): void {
    const constraints: { maxBytes: number; allowedMimes: string[] } | undefined =
      MEDIA_CONSTRAINTS[usage];

    if (!constraints) {
      throw new BadRequestException(`Usage '${usage}' no tiene restricciones configuradas.`);
    }

    if (!constraints.allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `MIME type '${file.mimetype}' no permitido para usage '${usage}'. ` +
          `Permitidos: ${constraints.allowedMimes.join(', ')}.`,
      );
    }

    // El allowlist de arriba compara contra `file.mimetype`, que lo DECLARA el
    // cliente en el multipart. Sin esta segunda comprobación bastaba con decir
    // `image/png` y enviar bytes de otro formato: `validateImageDimensions`
    // entrega ese buffer a `image-size`, que elige su parser por el contenido
    // real y arrastra avisos de DoS sin versión parcheada. La validación por
    // contenido es la defensa aplicable, porque no existe versión a la que
    // actualizar. `evidence-asset.provider.ts` ya lo hacía; esta ruta no.
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException('El contenido del archivo no coincide con el tipo declarado.');
    }

    if (file.size > constraints.maxBytes) {
      const maxKb = Math.round(constraints.maxBytes / 1024);
      throw new BadRequestException(
        `El archivo supera el tamaño máximo de ${maxKb} KB para usage '${usage}'.`,
      );
    }

    this.validateImageDimensions(file, usage);
  }

  /**
   * Valida dimensiones y proporción para evitar distorsión en UI.
   * La validación es obligatoria para usos de branding y no aplica a usage GENERAL.
   */
  private validateImageDimensions(file: Express.Multer.File, usage: MediaUsage): void {
    const dimensionConstraint = MEDIA_DIMENSION_CONSTRAINTS[usage];
    if (!dimensionConstraint || !file.mimetype.startsWith('image/')) {
      return;
    }

    const dimensions = imageSize(file.buffer);
    const width = dimensions.width ?? 0;
    const height = dimensions.height ?? 0;

    if (width <= 0 || height <= 0) {
      throw new BadRequestException(
        `No se pudieron validar las dimensiones de la imagen para usage '${usage}'.`,
      );
    }

    if (width < dimensionConstraint.minWidth || height < dimensionConstraint.minHeight) {
      throw new BadRequestException(
        `La imagen para usage '${usage}' debe ser al menos ${dimensionConstraint.minWidth}x${dimensionConstraint.minHeight}px.`,
      );
    }

    if (
      typeof dimensionConstraint.maxWidth === 'number' &&
      typeof dimensionConstraint.maxHeight === 'number' &&
      (width > dimensionConstraint.maxWidth || height > dimensionConstraint.maxHeight)
    ) {
      throw new BadRequestException(
        `La imagen para usage '${usage}' no puede superar ${dimensionConstraint.maxWidth}x${dimensionConstraint.maxHeight}px.`,
      );
    }

    if (dimensionConstraint.square) {
      const squareTolerance = Math.max(1, Math.round(width * 0.02));
      if (Math.abs(width - height) > squareTolerance) {
        throw new BadRequestException(
          `La imagen para usage '${usage}' debe tener proporción 1:1 (cuadrada).`,
        );
      }
    }

    if (
      typeof dimensionConstraint.aspectRatioMin === 'number' &&
      typeof dimensionConstraint.aspectRatioMax === 'number'
    ) {
      const aspectRatio = width / height;
      if (
        aspectRatio < dimensionConstraint.aspectRatioMin ||
        aspectRatio > dimensionConstraint.aspectRatioMax
      ) {
        throw new BadRequestException(
          `La imagen para usage '${usage}' debe tener proporción entre ${dimensionConstraint.aspectRatioMin.toFixed(2)} y ${dimensionConstraint.aspectRatioMax.toFixed(2)}.`,
        );
      }
    }
  }

  private mimeToExt(mimeType: string): string {
    const mimeExtMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    };

    return mimeExtMap[mimeType] ?? 'bin';
  }

  private toResponseDto(asset: MediaAsset): MediaAssetResponseDto {
    return {
      id: asset.id,
      usage: asset.usage,
      themeVariant: asset.themeVariant,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      publicUrl: asset.publicUrl,
      createdAt: asset.createdAt,
    };
  }
}
