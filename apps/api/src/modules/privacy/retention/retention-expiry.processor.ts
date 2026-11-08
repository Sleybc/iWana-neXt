import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { SanitizeFailedReason } from '../../../common/sanitize-failed-reason.decorator';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isValidSchemaName, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  PrivacyRetentionExpiryTenantJobSchema,
  type PrivacyRetentionExpiryTenantJob,
} from '@iwana/shared';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { bogotaCivilDate } from '../ports/privacy-tenant-query';
import { RETENTION_EXPIRY_SYSTEM_ACTOR, RetentionExpiryService } from './retention-expiry.service';
import {
  RETENTION_EXPIRY_ATTEMPTS,
  RETENTION_EXPIRY_BACKOFF_MS,
  RETENTION_EXPIRY_CRON_PATTERN,
  RETENTION_EXPIRY_QUEUE,
  RETENTION_EXPIRY_REPEATABLE_JOB_ID,
  RETENTION_EXPIRY_SWEEP_JOB,
  RETENTION_EXPIRY_TENANT_JOB,
  RETENTION_EXPIRY_TIME_ZONE,
} from './retention-expiry.constants';

const TENANT_SWEEP_SQL = `
  SELECT id::text, slug, schema_name
  FROM public.tenants
  WHERE status = 'ACTIVE' AND deleted_at IS NULL
  ORDER BY schema_name
`;

interface ActiveTenantRow {
  id: string;
  slug: string;
  schema_name: string;
}

interface TenantResolution {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
}

function parseTenantJob(value: unknown): PrivacyRetentionExpiryTenantJob {
  const parsed = PrivacyRetentionExpiryTenantJobSchema.safeParse(value);
  if (!parsed.success) {
    throw new UnrecoverableError('El payload de vencimiento de retención no es válido.');
  }
  return parsed.data;
}

export function makeRetentionExpiryTenantJobId(tenantId: string, date: string): string {
  return `${RETENTION_EXPIRY_QUEUE}-${tenantId}-${date}`;
}

/**
 * Vencimiento de retención procesado en la API (H-EXP B2, ADR-105).
 *
 * El job no elige titular ni solicitud: el servicio selecciona candidatos y
 * revalida todos los deberes dentro de la transacción de cada uno. Quien
 * escriba en Redis solo puede adelantar una corrida. Concurrencia 1 y lotes
 * de 100 para no competir con las peticiones HTTP.
 */
@Injectable()
@Processor(RETENTION_EXPIRY_QUEUE, { concurrency: 1 })
export class RetentionExpiryProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionExpiryProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(RETENTION_EXPIRY_QUEUE) private readonly queue: Queue,
    private readonly expiryService: RetentionExpiryService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      RETENTION_EXPIRY_SWEEP_JOB,
      {},
      {
        repeat: {
          pattern: RETENTION_EXPIRY_CRON_PATTERN,
          tz: RETENTION_EXPIRY_TIME_ZONE,
        },
        jobId: RETENTION_EXPIRY_REPEATABLE_JOB_ID,
      },
    );
    this.logger.log('[retention-expiry] Job repetible registrado (04:00 America/Bogota).');
  }

  @SanitizeFailedReason()
  async process(job: Job<unknown>): Promise<void> {
    if (job.name === RETENTION_EXPIRY_SWEEP_JOB) {
      await this.enqueueActiveTenants();
      return;
    }
    if (job.name === RETENTION_EXPIRY_TENANT_JOB) {
      await this.processTenant(parseTenantJob(job.data));
      return;
    }
    this.logger.warn(`[retention-expiry] Job no reconocido omitido: ${job.name}`);
  }

  private async enqueueActiveTenants(): Promise<void> {
    const tenants = (await this.dataSource.query(TENANT_SWEEP_SQL)) as ActiveTenantRow[];
    const date = bogotaCivilDate(new Date());
    for (const tenant of tenants) {
      const payload: PrivacyRetentionExpiryTenantJob = {
        version: 1,
        tenantId: tenant.id,
        runId: randomUUID(),
      };
      await this.queue.add(RETENTION_EXPIRY_TENANT_JOB, payload, {
        jobId: makeRetentionExpiryTenantJobId(tenant.id, date),
        attempts: RETENTION_EXPIRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: RETENTION_EXPIRY_BACKOFF_MS },
        removeOnComplete: false,
      });
    }
  }

  private async resolveTenant(tenantId: string): Promise<TenantResolution> {
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id, slug, schema_name, status, deleted_at
         FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
      [tenantId],
    )) as Array<{
      id: string;
      slug: string;
      schema_name: string;
      status: string;
      deleted_at: Date | string | null;
    }>;
    const tenant = rows[0];
    if (!tenant || tenant.status !== 'ACTIVE' || tenant.deleted_at) {
      throw new UnrecoverableError('El tenant del job de vencimiento no está activo.');
    }
    if (!isValidSchemaName(tenant.schema_name)) {
      throw new UnrecoverableError('El tenant del job de vencimiento no está activo.');
    }
    return { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schema_name };
  }

  private async processTenant(payload: PrivacyRetentionExpiryTenantJob): Promise<void> {
    const tenant = await this.resolveTenant(payload.tenantId);
    const result = await runInTenantSchema(this.dataSource, tenant.schemaName, (queryRunner) =>
      TenantContext.run(
        { tenantId: tenant.tenantId, schemaName: tenant.schemaName, tenantSlug: tenant.tenantSlug },
        () =>
          this.expiryService.runTenantBatch(queryRunner.manager, {
            actorId: RETENTION_EXPIRY_SYSTEM_ACTOR,
            runId: payload.runId,
          }),
      ),
    );
    if (result.status === 'CONTINUE') {
      // El cursor quedó persistido con el runId: el siguiente lote retoma
      // donde quedó; el ledger vuelve no-op lo ya completado.
      await this.queue.add(RETENTION_EXPIRY_TENANT_JOB, payload, {
        jobId: `${makeRetentionExpiryTenantJobId(tenant.tenantId, bogotaCivilDate(new Date()))}:lote-${Date.now()}`,
        attempts: RETENTION_EXPIRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: RETENTION_EXPIRY_BACKOFF_MS },
        removeOnComplete: false,
      });
    }
  }
}
