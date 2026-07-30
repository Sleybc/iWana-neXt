import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';

export const EVIDENCE_ANALYSIS_QUEUE = 'evidence-analysis';

export interface EvidenceAnalysisJobData {
  tenantSchema: string;
  mediaAssetId: string;
  correlationId: string;
}

/** Análisis baseline determinista e idempotente de assets de evidencia. */
@Injectable()
@Processor(EVIDENCE_ANALYSIS_QUEUE)
export class EvidenceAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(EvidenceAnalysisProcessor.name);
  private readonly pool: Pool;

  constructor(
    config: ConfigService,
    @Optional() @Inject(STORAGE_PORT) private readonly storage?: Pick<StoragePort, 'getObject'>,
  ) {
    super();
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: 2,
    });
  }

  async process(job: Job<EvidenceAnalysisJobData>): Promise<void> {
    const data = job.data;
    if (!isValidJobData(data)) throw new Error('EVIDENCE_ANALYSIS_INVALID_JOB');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assetResult = await client.query<EvidenceAssetRow>(
        `SELECT mime_type, size_bytes, checksum_sha256, object_key
         FROM public.media_assets
         WHERE id = $1 AND tenant_schema = $2
           AND usage = 'execution_evidence' AND asset_status = 'QUARANTINED'
           AND deleted_at IS NULL
         FOR UPDATE`,
        [data.mediaAssetId, data.tenantSchema],
      );

      if (assetResult.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      const asset = assetResult.rows[0] as EvidenceAssetRow;
      const status = (await this.validateStoredObject(asset)) ? 'AVAILABLE' : 'REJECTED';
      const result = await client.query<{ asset_status: string }>(
        `UPDATE public.media_assets
         SET asset_status = $3
         WHERE id = $1 AND tenant_schema = $2
           AND usage = 'execution_evidence' AND asset_status = 'QUARANTINED'
           AND deleted_at IS NULL
         RETURNING asset_status`,
        [data.mediaAssetId, data.tenantSchema, status],
      );
      await client.query('COMMIT');
      if (result.rows.length > 0) {
        this.logger.log(
          `Análisis de evidencia completado [assetId=${data.mediaAssetId} status=${result.rows[0]?.asset_status ?? 'UNKNOWN'} correlationId=${data.correlationId}]`,
        );
      }
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async validateStoredObject(asset: EvidenceAssetRow): Promise<boolean> {
    if (
      !this.storage ||
      !isAllowedEvidenceMime(asset.mime_type) ||
      !Number.isInteger(asset.size_bytes) ||
      asset.size_bytes <= 0 ||
      typeof asset.checksum_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(asset.checksum_sha256) ||
      typeof asset.object_key !== 'string' ||
      asset.object_key.trim().length === 0
    ) {
      return false;
    }

    try {
      const bytes = await this.storage.getObject(asset.object_key);
      if (!Buffer.isBuffer(bytes) || bytes.length !== asset.size_bytes || bytes.length === 0) {
        return false;
      }

      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (checksum !== asset.checksum_sha256.toLowerCase()) {
        return false;
      }

      return validateMagicBytes(bytes, asset.mime_type);
    } catch {
      return false;
    }
  }
}

type EvidenceAssetRow = {
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  object_key: string;
};

const ALLOWED_EVIDENCE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function isAllowedEvidenceMime(mime: string): boolean {
  return ALLOWED_EVIDENCE_MIMES.has(mime.toLowerCase());
}

function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.length < 12) return false;

  const patterns: Record<string, { offset: number; bytes: number[] }> = {
    'image/jpeg': { offset: 0, bytes: [0xff, 0xd8, 0xff] },
    'image/png': { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
    'image/gif': { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
    'image/webp': { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    'application/pdf': { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  };
  const pattern = patterns[declaredMime.toLowerCase()];
  if (!pattern || buffer.length < pattern.offset + pattern.bytes.length) return false;

  const matches = pattern.bytes.every((byte, index) => buffer[pattern.offset + index] === byte);
  if (!matches) return false;

  if (declaredMime.toLowerCase() === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF';
  }

  return true;
}

function isValidJobData(value: EvidenceAnalysisJobData): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    /^[a-z][a-z0-9_]{0,62}$/i.test(value.tenantSchema) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.mediaAssetId,
    ) &&
    typeof value.correlationId === 'string' &&
    value.correlationId.length > 0
  );
}
