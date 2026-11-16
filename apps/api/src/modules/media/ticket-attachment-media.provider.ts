import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { MediaAsset, MediaUsage, summarizeErrorForLog } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  TicketAttachmentMediaPort,
  type TicketAttachmentAccepted,
  type TicketAttachmentFileInput,
  type TicketAttachmentInspection,
  type TicketAttachmentSignOptions,
  type TicketAttachmentStoreContext,
} from '../assurance/ports/ticket-attachment-media.port';
import { EVIDENCE_ANALYSIS_QUEUE, type EvidenceAnalysisJobData } from './evidence-asset.provider';
import {
  buildContentDisposition,
  inspectTicketAttachmentFile,
  ticketAttachmentExtension,
} from './ticket-attachment-file';

/** Vida del enlace firmado: corta, como los demás soportes privados (privacy, estrato). */
export const TICKET_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 300;

const TENANT_SCHEMA = /^tenant_[a-z0-9_]{1,56}$/u;

/**
 * Adjuntos de tickets en el módulo de medios (spec MOD09 adjuntos §2.1, §2.2; ADR-034).
 * Reutiliza la cuarentena de la evidencia de órdenes de trabajo: el activo entra `QUARANTINED`
 * y el worker `evidence-analysis` lo deja `AVAILABLE` o `REJECTED`. Solo se firma `AVAILABLE`.
 *
 * El objeto vive en `<schema>/ticket_attachment/<assetId>` (sin extensión: la clave se puede
 * reconstruir para compensar aunque la fila se haya revertido). Sin nombre del cliente en la
 * clave, los metadatos ni los logs.
 */
@Injectable()
export class TicketAttachmentMediaProvider extends TicketAttachmentMediaPort {
  private readonly logger = new Logger(TicketAttachmentMediaProvider.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly config: ConfigService,
    @InjectQueue(EVIDENCE_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
  ) {
    super();
  }

  inspect(file: TicketAttachmentFileInput): TicketAttachmentInspection {
    return inspectTicketAttachmentFile(file);
  }

  async store(
    ctx: TicketAttachmentStoreContext,
    file: TicketAttachmentFileInput,
    accepted: TicketAttachmentAccepted,
  ): Promise<{ mediaAssetId: string }> {
    assertTenantSchema(ctx.tenantSchema);
    this.assertPrivateStorage();
    // Nunca se confía en una inspección ajena: se repite sobre los mismos bytes.
    const check = inspectTicketAttachmentFile(file);
    if (!check.ok || check.contentType !== accepted.contentType) {
      throw new Error('TICKET_ATTACHMENT_INSPECTION_MISMATCH');
    }

    const id = randomUUID();
    const objectKey = ticketAttachmentObjectKey(ctx.tenantSchema, id);
    const ext = ticketAttachmentExtension(check.contentType);
    await ctx.manager.getRepository(MediaAsset).insert({
      id,
      tenantSchema: ctx.tenantSchema,
      usage: MediaUsage.TICKET_ATTACHMENT,
      themeVariant: null,
      // Nombre opaco: el del cliente vive en Soporte (`ticket_comment_attachments.filename`).
      originalFilename: `${id}.${ext}`,
      mimeType: check.contentType,
      ext,
      sizeBytes: check.sizeBytes,
      objectKey,
      publicUrl: null,
      uploadedByUserId: ctx.actorId,
      assetStatus: ctx.initialStatus,
      claimRef: null,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
    } as Partial<MediaAsset>);

    await this.storage.putObject(objectKey, file.buffer, {
      contentType: check.contentType,
      contentLength: check.sizeBytes,
      metadata: {
        tenantSchema: ctx.tenantSchema,
        usage: MediaUsage.TICKET_ATTACHMENT,
        assetId: id,
      },
    });
    return { mediaAssetId: id };
  }

  async startAnalysis(tenantSchema: string, mediaAssetIds: string[]): Promise<void> {
    assertTenantSchema(tenantSchema);
    for (const mediaAssetId of new Set(mediaAssetIds)) {
      try {
        await this.analysisQueue.add(
          'analyze-evidence-asset',
          {
            tenantSchema,
            mediaAssetId,
            correlationId: mediaAssetId,
          } satisfies EvidenceAnalysisJobData,
          {
            jobId: `ticket-attachment-analysis-${mediaAssetId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
      } catch (error: unknown) {
        // El comentario ya quedó guardado: el adjunto sigue «En revisión» (nunca se sirve).
        this.logger.error(
          `No se pudo encolar el análisis del adjunto [assetId=${mediaAssetId}]: ${summarizeErrorForLog(error)}`,
        );
      }
    }
  }

  async removeObjects(tenantSchema: string, mediaAssetIds: string[]): Promise<number> {
    assertTenantSchema(tenantSchema);
    const ids = [...new Set(mediaAssetIds)];
    if (ids.length === 0) return 0;
    const live = (await this.dataSource.query(
      `SELECT id::text AS id FROM public.media_assets
        WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND deleted_at IS NULL`,
      [ids, tenantSchema],
    )) as Array<{ id: string }>;
    const keep = new Set(live.map((row) => row.id));
    let failed = 0;
    for (const id of ids) {
      if (keep.has(id)) continue;
      try {
        await this.storage.deleteObject(ticketAttachmentObjectKey(tenantSchema, id));
      } catch (error: unknown) {
        failed += 1;
        this.logger.error(
          `No se pudo borrar el objeto del adjunto [assetId=${id}]: ${summarizeErrorForLog(error)}`,
        );
      }
    }
    return failed;
  }

  async readStatuses(tenantSchema: string, mediaAssetIds: string[]): Promise<Map<string, string>> {
    assertTenantSchema(tenantSchema);
    const ids = [...new Set(mediaAssetIds)];
    const result = new Map<string, string>();
    if (ids.length === 0) return result;
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id, asset_status FROM public.media_assets
        WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 AND deleted_at IS NULL`,
      [ids, tenantSchema, MediaUsage.TICKET_ATTACHMENT],
    )) as Array<{ id: string; asset_status: string }>;
    for (const row of rows) result.set(row.id, row.asset_status);
    return result;
  }

  async signDownload(
    tenantSchema: string,
    mediaAssetId: string,
    options: TicketAttachmentSignOptions,
  ): Promise<{ url: string; expiresAt: Date } | null> {
    assertTenantSchema(tenantSchema);
    const rows = (await this.dataSource.query(
      `SELECT object_key, mime_type FROM public.media_assets
        WHERE id = $1 AND tenant_schema = $2 AND usage = $3
          AND asset_status = 'AVAILABLE' AND deleted_at IS NULL`,
      [mediaAssetId, tenantSchema, MediaUsage.TICKET_ATTACHMENT],
    )) as Array<{ object_key: string; mime_type: string }>;
    const asset = rows[0];
    if (!asset || asset.mime_type !== options.contentType) return null;
    this.assertPrivateStorage();
    const url = await this.storage.getSignedUrl(
      asset.object_key,
      TICKET_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
      {
        responseContentType: options.contentType,
        responseContentDisposition: buildContentDisposition(options.filename, options.disposition),
      },
    );
    return {
      url,
      expiresAt: new Date(Date.now() + TICKET_ATTACHMENT_SIGNED_URL_TTL_SECONDS * 1000),
    };
  }

  async retire(
    manager: EntityManager,
    tenantSchema: string,
    mediaAssetIds: string[],
  ): Promise<number> {
    assertTenantSchema(tenantSchema);
    const ids = [...new Set(mediaAssetIds)];
    if (ids.length === 0) return 0;
    const rows = (await manager.query(
      `UPDATE public.media_assets SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 AND deleted_at IS NULL
        RETURNING id`,
      [ids, tenantSchema, MediaUsage.TICKET_ATTACHMENT],
    )) as unknown;
    const list = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    return Array.isArray(list) ? list.length : 0;
  }

  /**
   * Misma política que los soportes privados de `MediaService`: sin driver local (sirve sin
   * firma), sin bucket público y sin base pública en producción o staging. Falla cerrado.
   */
  private assertPrivateStorage(): void {
    const driver = this.config.get<string>('STORAGE_DRIVER', 'local');
    const bucketPublic = this.config.get<boolean | string>('S3_BUCKET_PUBLIC', false);
    const publicBaseUrl = this.config.get<string>('S3_PUBLIC_BASE_URL');
    const runtimeEnv = this.config.get<string>('NODE_ENV');
    const deployed = runtimeEnv === 'production' || runtimeEnv === 'staging';
    const hasPublicBaseUrl = typeof publicBaseUrl === 'string' && publicBaseUrl.trim().length > 0;
    if (
      driver !== 'minio' ||
      bucketPublic === true ||
      bucketPublic === 'true' ||
      (deployed && hasPublicBaseUrl)
    ) {
      throw new ServiceUnavailableException({
        code: 'TICKET_ATTACHMENT_STORAGE_MUST_BE_PRIVATE',
        message: 'Los adjuntos requieren almacenamiento privado sin URL permanente.',
      });
    }
  }
}

export function ticketAttachmentObjectKey(tenantSchema: string, mediaAssetId: string): string {
  return `${tenantSchema}/${MediaUsage.TICKET_ATTACHMENT}/${mediaAssetId}`;
}

function assertTenantSchema(tenantSchema: string): void {
  if (!TENANT_SCHEMA.test(tenantSchema)) {
    throw new Error('TICKET_ATTACHMENT_INVALID_TENANT_SCHEMA');
  }
}
