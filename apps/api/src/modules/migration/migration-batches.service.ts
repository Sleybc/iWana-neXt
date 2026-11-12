import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { ENCRYPTED_OBJECT_CONTENT_TYPE, STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  AuditAction,
  MIGRATION_IMPORT_LIMITS,
  MIGRATION_IMPORT_QUEUE,
  MIGRATION_IMPORT_SIMULATE_JOB,
  MigrationBatchCountsSchema,
  MigrationBatchRejectionsSchema,
  MigrationPromotionReportSchema,
  MigrationReconciliationReportSchema,
  type MigrationBatchCounts,
  type MigrationBatchReport,
  type MigrationBatchSummary,
  type MigrationPendingValue,
  type MigrationSimulateJob,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { MigrationCrypto } from './migration-crypto';
import {
  MIGRATION_AUDIT_ENTITY,
  MIGRATION_SIMULATE_ATTEMPTS,
  MIGRATION_SIMULATE_BACKOFF_MS,
  initialBatchCounts,
  migrationObjectKey,
  migrationObjectPrefix,
  migrationSimulateJobId,
} from './migration.constants';
import { SafeZipError, hasZipMagic, inspectZip } from './zip/safe-zip-reader';

export interface MigrationTenantScope {
  tenantId: string;
  schemaName: string;
}

export interface UploadedZip {
  originalname?: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/octet-stream',
]);

interface BatchRow {
  id: string;
  source: 'UISP_ZIP';
  status: MigrationBatchSummary['status'];
  counts: unknown;
  rejections: unknown;
  created_by: string;
  created_at: Date | string;
  purge_after: Date | string;
  purged_at: Date | string | null;
  promotion?: unknown;
  reconciliation?: unknown;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

const fallbackLogger = new Logger('MigrationBatchesService');

/** Registra (sin PII: solo lote y campo) que un jsonb del lote no cumple su esquema. */
function warnFallback(batchId: string, field: string): void {
  fallbackLogger.warn(
    `[migration] Lote ${batchId}: ${field} no cumple el esquema; se usa el valor por defecto.`,
  );
}

function parseCounts(value: unknown, batchId?: string): MigrationBatchCounts {
  const parsed = MigrationBatchCountsSchema.safeParse(value);
  if (!parsed.success && batchId) warnFallback(batchId, 'counts');
  return parsed.success ? parsed.data : initialBatchCounts(0);
}

function promotionProcessing(value: unknown): MigrationBatchSummary['promotionProcessing'] {
  if (value === null || value === undefined) return null;
  const parsed = MigrationPromotionReportSchema.safeParse(value);
  return parsed.success ? parsed.data.procesamiento : 'FALLIDO';
}

function toSummary(row: BatchRow): MigrationBatchSummary {
  const counts = parseCounts(row.counts, row.id);
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    processing: counts.procesamiento,
    promotionProcessing: promotionProcessing(row.promotion),
    filesReceived: counts.archivos.recibidos,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    purgeAfter: iso(row.purge_after),
    purgedAt: row.purged_at ? iso(row.purged_at) : null,
  };
}

function zipRejected(index: number, reason: string): BadRequestException {
  return new BadRequestException({
    code: 'MIGRATION_ZIP_REJECTED',
    message: 'Uno de los archivos no es un ZIP de cliente válido.',
    details: { fileIndex: index, reason },
  });
}

/**
 * Lotes de importación (ADR-110 D1, D9): recibe los ZIP, los cifra en storage, crea el lote
 * y encola la simulación en la misma transacción que audita. Consulta lotes e informes.
 */
@Injectable()
export class MigrationBatchesService {
  private readonly logger = new Logger(MigrationBatchesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectQueue(MIGRATION_IMPORT_QUEUE) private readonly queue: Queue,
    private readonly crypto: MigrationCrypto,
    private readonly auditService: AuditService,
  ) {}

  /** Valida tamaño, tipo, firma y estructura de cada ZIP antes de tocar storage. */
  async validateUploads(files: UploadedZip[] | undefined): Promise<UploadedZip[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        code: 'MIGRATION_FILES_REQUIRED',
        message: 'Adjunta al menos un ZIP de cliente.',
      });
    }
    if (files.length > MIGRATION_IMPORT_LIMITS.maxZipsPerBatch) {
      throw new BadRequestException({
        code: 'MIGRATION_TOO_MANY_FILES',
        message: `Un lote admite hasta ${MIGRATION_IMPORT_LIMITS.maxZipsPerBatch} archivos.`,
      });
    }
    for (const [index, file] of files.entries()) {
      if (file.size <= 0 || file.size > MIGRATION_IMPORT_LIMITS.maxZipBytes) {
        throw new BadRequestException({
          code: 'MIGRATION_FILE_TOO_LARGE',
          message: 'El archivo está vacío o supera el tamaño permitido.',
          details: { fileIndex: index },
        });
      }
      const mime = (file.mimetype ?? '').toLowerCase();
      const name = (file.originalname ?? '').toLowerCase();
      if (!ALLOWED_ZIP_MIMES.has(mime) || !name.endsWith('.zip') || !hasZipMagic(file.buffer)) {
        throw new BadRequestException({
          code: 'MIGRATION_FILE_TYPE_NOT_ALLOWED',
          message: 'Solo se aceptan archivos ZIP exportados desde UISP.',
          details: { fileIndex: index },
        });
      }
      try {
        await inspectZip(file.buffer);
      } catch (error) {
        throw zipRejected(index, error instanceof SafeZipError ? error.code : 'ZIP_INVALIDO');
      }
    }
    return files;
  }

  async createBatch(
    scope: MigrationTenantScope,
    files: UploadedZip[] | undefined,
    actorId: string,
  ): Promise<MigrationBatchSummary> {
    const zips = await this.validateUploads(files);
    const batchId = randomUUID();
    const prefix = migrationObjectPrefix(scope.schemaName, batchId);
    const keys: string[] = [];
    try {
      for (const [index, file] of zips.entries()) {
        const key = migrationObjectKey(prefix, index);
        const encrypted = this.crypto.encryptObject(file.buffer);
        await this.storage.putObject(key, encrypted, {
          contentType: ENCRYPTED_OBJECT_CONTENT_TYPE,
          contentLength: encrypted.length,
        });
        keys.push(key);
      }

      const row = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
        const [inserted] = (await qr.query(
          `INSERT INTO migration_batches
             (id, tenant_id, source, status, counts, rejections, source_object_key, created_by)
           VALUES ($1, $2, 'UISP_ZIP', 'SIMULADO', $3::jsonb, '{}'::jsonb, $4, $5)
           RETURNING id, source, status, counts, rejections, created_by, created_at,
                     purge_after, purged_at`,
          [
            batchId,
            scope.tenantId,
            JSON.stringify(initialBatchCounts(zips.length)),
            prefix,
            actorId,
          ],
        )) as BatchRow[];
        await this.auditService.logWithin(
          {
            action: AuditAction.CREATE,
            entityType: MIGRATION_AUDIT_ENTITY,
            entityId: batchId,
            userId: actorId,
            tenantId: scope.tenantId,
            schemaName: scope.schemaName,
            newValue: {
              source: 'UISP_ZIP',
              files: zips.length,
              totalBytes: zips.reduce((sum, file) => sum + file.size, 0),
            },
          },
          qr.manager,
        );
        const payload: MigrationSimulateJob = {
          version: 1,
          tenantId: scope.tenantId,
          batchId,
        };
        try {
          // Se encola dentro de la transacción: si falla, se revierte el lote y su auditoría.
          // Si el job corre antes del commit, no encuentra el lote y reintenta (backoff).
          await this.queue.add(MIGRATION_IMPORT_SIMULATE_JOB, payload, {
            jobId: migrationSimulateJobId(batchId),
            attempts: MIGRATION_SIMULATE_ATTEMPTS,
            backoff: { type: 'exponential', delay: MIGRATION_SIMULATE_BACKOFF_MS },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          });
        } catch (error) {
          this.logger.error(
            `[migration] No se pudo encolar la simulación del lote ${batchId}: ${summarizeErrorForLog(error)}`,
          );
          throw new ServiceUnavailableException({
            code: 'MIGRATION_ENQUEUE_FAILED',
            message: 'No se pudo iniciar la simulación. Intenta de nuevo.',
          });
        }
        return inserted!;
      });
      return toSummary(row);
    } catch (error) {
      await Promise.all(
        keys.map((key) =>
          Promise.resolve()
            .then(() => this.storage.deleteObject(key))
            .catch(() => undefined),
        ),
      );
      throw error;
    }
  }

  async list(
    scope: MigrationTenantScope,
    page: number,
    limit: number,
  ): Promise<{ data: MigrationBatchSummary[]; total: number }> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id, source, status, counts, rejections, created_by, created_at, purge_after,
                purged_at, promotion
           FROM migration_batches
          WHERE tenant_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [scope.tenantId, limit, (page - 1) * limit],
      )) as BatchRow[];
      const [{ total }] = (await qr.query(
        `SELECT COUNT(*)::int AS total FROM migration_batches WHERE tenant_id = $1`,
        [scope.tenantId],
      )) as [{ total: number }];
      return { data: rows.map(toSummary), total };
    });
  }

  async getReport(scope: MigrationTenantScope, batchId: string): Promise<MigrationBatchReport> {
    const row = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id, source, status, counts, rejections, created_by, created_at, purge_after,
                purged_at, promotion, reconciliation
           FROM migration_batches WHERE id = $1 AND tenant_id = $2`,
        [batchId, scope.tenantId],
      )) as BatchRow[];
      return rows[0] ?? null;
    });
    if (!row) {
      throw new NotFoundException({
        code: 'MIGRATION_BATCH_NOT_FOUND',
        message: 'El lote no existe.',
      });
    }
    const rejections = MigrationBatchRejectionsSchema.safeParse(row.rejections);
    const promotion = MigrationPromotionReportSchema.safeParse(row.promotion);
    const reconciliation = MigrationReconciliationReportSchema.safeParse(row.reconciliation);
    if (!rejections.success) warnFallback(row.id, 'rejections');
    if (row.promotion !== null && !promotion.success) warnFallback(row.id, 'promotion');
    if (row.reconciliation !== null && !reconciliation.success) {
      warnFallback(row.id, 'reconciliation');
    }
    return {
      ...toSummary(row),
      counts: parseCounts(row.counts),
      rejections: rejections.success ? rejections.data : {},
      promotion: promotion.success ? promotion.data : null,
      reconciliation: reconciliation.success ? reconciliation.data : null,
    };
  }

  /** Valores del lote que siguen sin equivalencia con el catálogo vigente del tenant. */
  async pendingMappings(
    scope: MigrationTenantScope,
    batchId: string,
  ): Promise<MigrationPendingValue[]> {
    const report = await this.getReport(scope, batchId);
    const mapped = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT kind, external_value FROM migration_mappings
          WHERE tenant_id = $1 AND source_system = 'UISP'`,
        [scope.tenantId],
      )) as Array<{ kind: string; external_value: string }>;
      return new Set(rows.map((row) => `${row.kind}\u0000${row.external_value}`));
    });
    return report.counts.pendientesEquivalencia.filter(
      (value) => !mapped.has(`${value.kind}\u0000${value.externalValue}`),
    );
  }
}
