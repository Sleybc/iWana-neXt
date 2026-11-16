import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';

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

  @SanitizeFailedReason()
  async process(job: Job<EvidenceAnalysisJobData>): Promise<void> {
    const data = job.data;
    if (!isValidJobData(data)) throw new Error('EVIDENCE_ANALYSIS_INVALID_JOB');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assetResult = await client.query<EvidenceAssetRow>(
        `SELECT usage, mime_type, size_bytes, checksum_sha256, object_key
         FROM public.media_assets
         WHERE id = $1 AND tenant_schema = $2
           AND usage = ANY($3::varchar[]) AND asset_status = 'QUARANTINED'
           AND deleted_at IS NULL
         FOR UPDATE`,
        [data.mediaAssetId, data.tenantSchema, QUARANTINED_USAGES],
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
           AND usage = $4 AND asset_status = 'QUARANTINED'
           AND deleted_at IS NULL
         RETURNING asset_status`,
        [data.mediaAssetId, data.tenantSchema, status, asset.usage],
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
      !isAllowedMime(asset.usage, asset.mime_type) ||
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
  usage: string;
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

/**
 * Usos con cuarentena: evidencia de órdenes de trabajo y adjuntos de tickets (spec MOD09
 * adjuntos §2.2, que reutiliza esta misma cuarentena).
 */
const QUARANTINED_USAGES = ['execution_evidence', 'ticket_attachment'];

/** Adjuntos de tickets: los tipos de la evidencia más MP4 (spec MOD09 adjuntos §2.1). */
const ALLOWED_TICKET_ATTACHMENT_MIMES = new Set([...ALLOWED_EVIDENCE_MIMES, 'video/mp4']);

function isAllowedMime(usage: string, mime: string): boolean {
  const allowed =
    usage === 'ticket_attachment' ? ALLOWED_TICKET_ATTACHMENT_MIMES : ALLOWED_EVIDENCE_MIMES;
  return allowed.has(mime.toLowerCase());
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
  if (declaredMime.toLowerCase() === 'video/mp4') return isMp4(buffer);
  const pattern = patterns[declaredMime.toLowerCase()];
  if (!pattern || buffer.length < pattern.offset + pattern.bytes.length) return false;

  const matches = pattern.bytes.every((byte, index) => buffer[pattern.offset + index] === byte);
  if (!matches) return false;

  if (declaredMime.toLowerCase() === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF';
  }

  return true;
}

/**
 * Copia del worker de `validateMagicBytes` de la API, exportada para la prueba de paridad (m3)
 * de `evidence-analysis.processor.spec.ts`. No se usa fuera de este archivo.
 */
export { validateMagicBytes as validateEvidenceMagicBytes };

/** Espejo de `apps/api/src/modules/media/magic-bytes.ts` (caja `ftyp` en el offset 4). */
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso7',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'mmp4',
  'MSNV',
]);
const NON_MP4_MAJOR_BRANDS = new Set([
  'qt  ',
  'heic',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
  'avif',
  'avis',
  'crx ',
]);

function isMp4(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.toString('latin1', 4, 8) !== 'ftyp') return false;
  const size = buffer.readUInt32BE(0);
  if (size < 16 || size > 1024 || size % 4 !== 0 || size > buffer.length) return false;
  const major = buffer.toString('latin1', 8, 12);
  if (MP4_BRANDS.has(major)) return true;
  if (NON_MP4_MAJOR_BRANDS.has(major)) return false;
  for (let offset = 16; offset + 4 <= size; offset += 4) {
    if (MP4_BRANDS.has(buffer.toString('latin1', offset, offset + 4))) return true;
  }
  return false;
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
