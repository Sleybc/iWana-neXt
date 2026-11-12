import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  MIGRATION_IMPORT_PURGE_SWEEP_JOB,
  MIGRATION_IMPORT_PROMOTE_JOB,
  MIGRATION_IMPORT_PURGE_TENANT_JOB,
  MIGRATION_IMPORT_QUEUE,
  MIGRATION_IMPORT_SIMULATE_JOB,
  MigrationPromoteJobSchema,
  MigrationPurgeTenantJobSchema,
  MigrationSimulateJobSchema,
  type MigrationPurgeTenantJob,
} from '@iwana/shared';
import { SanitizeFailedReason } from '../../common/sanitize-failed-reason.decorator';
import {
  MIGRATION_PURGE_ATTEMPTS,
  MIGRATION_PURGE_BATCH_SIZE,
  MIGRATION_PURGE_CRON_PATTERN,
  MIGRATION_PURGE_REPEATABLE_JOB_ID,
  MIGRATION_PURGE_TIME_ZONE,
  MIGRATION_SIMULATE_ATTEMPTS,
} from './migration.constants';
import {
  MIGRATION_PROMOTE_ATTEMPTS,
  MigrationPromotionService,
} from './migration-promotion.service';
import { MigrationPurgeService } from './migration-purge.service';
import {
  MigrationPermanentError,
  MigrationSimulationService,
} from './migration-simulation.service';

/**
 * Consumidor de la importación (ADR-110 D9, D10). Vive en la API (como el alta masiva de
 * usuarios y el vencimiento de retención) porque valida contra CRM por puerto. El payload
 * trae solo identificadores; el tenant se resuelve en `public.tenants` y se pasa explícito.
 */
@Injectable()
@Processor(MIGRATION_IMPORT_QUEUE, { concurrency: 1 })
export class MigrationImportProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationImportProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(MIGRATION_IMPORT_QUEUE) private readonly queue: Queue,
    private readonly simulation: MigrationSimulationService,
    private readonly purge: MigrationPurgeService,
    private readonly promotion: MigrationPromotionService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      MIGRATION_IMPORT_PURGE_SWEEP_JOB,
      {},
      {
        repeat: { pattern: MIGRATION_PURGE_CRON_PATTERN, tz: MIGRATION_PURGE_TIME_ZONE },
        jobId: MIGRATION_PURGE_REPEATABLE_JOB_ID,
      },
    );
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case MIGRATION_IMPORT_SIMULATE_JOB:
        return this.processSimulation(job);
      case MIGRATION_IMPORT_PROMOTE_JOB:
        return this.processPromotion(job);
      case MIGRATION_IMPORT_PURGE_SWEEP_JOB:
        return this.enqueueTenants();
      case MIGRATION_IMPORT_PURGE_TENANT_JOB:
        return this.processPurge(job.data);
      default:
        this.logger.warn(`[migration] Job no reconocido omitido: ${job.name}`);
    }
  }

  private async processSimulation(job: Job<unknown>): Promise<void> {
    const parsed = MigrationSimulateJobSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Payload de simulación inválido.');
    const { tenantId, batchId } = parsed.data;
    const attempts = job.opts.attempts ?? MIGRATION_SIMULATE_ATTEMPTS;
    const lastAttempt = job.attemptsMade + 1 >= attempts;
    try {
      await this.simulation.simulate(tenantId, batchId);
    } catch (error) {
      const permanent = error instanceof MigrationPermanentError;
      if (permanent || lastAttempt) {
        await this.simulation.markFailed(tenantId, batchId).catch(() => undefined);
      }
      if (permanent) throw new UnrecoverableError(error.code);
      throw error;
    }
  }

  private async processPromotion(job: Job<unknown>): Promise<void> {
    const parsed = MigrationPromoteJobSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Payload de promoción inválido.');
    const { tenantId, batchId, actorId } = parsed.data;
    const attempts = job.opts.attempts ?? MIGRATION_PROMOTE_ATTEMPTS;
    const lastAttempt = job.attemptsMade + 1 >= attempts;
    try {
      await this.promotion.promote(tenantId, batchId, actorId);
    } catch (error) {
      const permanent = error instanceof MigrationPermanentError;
      if (permanent || lastAttempt) {
        await this.promotion.markFailed(tenantId, batchId).catch(() => undefined);
      }
      if (permanent) throw new UnrecoverableError(error.code);
      throw error;
    }
  }

  private async enqueueTenants(): Promise<void> {
    const tenants = (await this.dataSource.query(
      `SELECT id::text AS id FROM public.tenants
        WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name`,
    )) as Array<{ id: string }>;
    for (const tenant of tenants) {
      const payload: MigrationPurgeTenantJob = {
        version: 1,
        tenantId: tenant.id,
        runId: randomUUID(),
      };
      await this.queue.add(MIGRATION_IMPORT_PURGE_TENANT_JOB, payload, {
        jobId: `migration-purge-${tenant.id}-${new Date().toISOString().slice(0, 10)}`,
        attempts: MIGRATION_PURGE_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      });
    }
  }

  private async processPurge(data: unknown): Promise<void> {
    const parsed = MigrationPurgeTenantJobSchema.safeParse(data);
    if (!parsed.success) throw new UnrecoverableError('Payload de purga inválido.');
    let tenant;
    try {
      tenant = await this.simulation.resolveTenant(parsed.data.tenantId);
    } catch (error) {
      if (error instanceof MigrationPermanentError) throw new UnrecoverableError(error.code);
      throw error;
    }
    const purged = await this.purge.purgeTenant(tenant);
    if (purged === MIGRATION_PURGE_BATCH_SIZE) {
      // Quedan lotes vencidos: otra vuelta con jobId nuevo.
      await this.queue.add(
        MIGRATION_IMPORT_PURGE_TENANT_JOB,
        { ...parsed.data, runId: randomUUID() },
        {
          jobId: `migration-purge-${tenant.tenantId}-${Date.now()}`,
          attempts: MIGRATION_PURGE_ATTEMPTS,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      );
    }
  }
}
