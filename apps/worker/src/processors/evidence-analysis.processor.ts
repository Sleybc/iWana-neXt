import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { Pool } from 'pg';

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

  constructor(config: ConfigService) {
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
      const result = await client.query<{ asset_status: string }>(
        `UPDATE public.media_assets
         SET asset_status = CASE
           WHEN mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'image/heic', 'image/heif')
             AND size_bytes > 0
             AND checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
             AND object_key <> ''
             AND deleted_at IS NULL
           THEN 'AVAILABLE' ELSE 'REJECTED' END
         WHERE id = $1 AND tenant_schema = $2
           AND usage = 'execution_evidence' AND asset_status = 'QUARANTINED'
           AND deleted_at IS NULL
         RETURNING asset_status`,
        [data.mediaAssetId, data.tenantSchema],
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
