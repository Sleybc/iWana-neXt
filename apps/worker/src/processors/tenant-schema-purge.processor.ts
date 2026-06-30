import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import { TENANT_SCHEMA_PURGE_QUEUE } from '@iwana/shared';

interface TenantPurgeRow {
  id: string;
  schema_name: string;
  deleted_at: string;
}

/**
 * Processor BullMQ para purga fisica diferida de tenants eliminados.
 *
 * Solo procesa tenants en MARKED_FOR_DELETION cuya ventana de retencion vencio.
 * Valida schemaName antes de ejecutar DDL y usa advisory lock por schema para evitar
 * purgas concurrentes si el worker se escala horizontalmente.
 */
@Injectable()
@Processor(TENANT_SCHEMA_PURGE_QUEUE)
export class TenantSchemaPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantSchemaPurgeProcessor.name);
  private static readonly PURGE_LOCK_NAMESPACE = 43;

  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    super();
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: this.config.get<number>('DB_PORT', 5432),
      user: this.config.get<string>('DB_USER', 'iwana'),
      password: this.config.get<string>('DB_PASSWORD', ''),
      database: this.config.get<string>('DB_NAME', 'iwana'),
      max: 2,
      idleTimeoutMillis: 30000,
    });
  }

  async process(_job: Job): Promise<void> {
    const retentionDays = this.getRetentionDays();
    const batchSize = this.getBatchSize();
    const client = await this.pool.connect();

    try {
      const { rows: tenants } = await client.query<TenantPurgeRow>(
        `
          SELECT id, schema_name, deleted_at
          FROM public.tenants
          WHERE status = 'MARKED_FOR_DELETION'
            AND deleted_at IS NOT NULL
            AND deleted_at <= NOW() - ($1::int * INTERVAL '1 day')
          ORDER BY deleted_at ASC
          LIMIT $2
        `,
        [retentionDays, batchSize],
      );

      this.logger.log(
        `[tenant-purge] Tenants elegibles: ${tenants.length} (retencion=${retentionDays} dias)`,
      );

      for (const tenant of tenants) {
        await this.purgeTenant(client, tenant, retentionDays);
      }
    } finally {
      client.release();
    }
  }

  private async purgeTenant(
    client: {
      query: (
        query: string,
        values?: unknown[],
      ) => Promise<{ rows?: Array<{ locked?: boolean }>; rowCount?: number }>;
    },
    tenant: TenantPurgeRow,
    retentionDays: number,
  ): Promise<void> {
    if (!isValidSchemaName(tenant.schema_name)) {
      throw new UnrecoverableError(
        `[tenant-purge] schema_name invalido detectado: "${tenant.schema_name}". Purga abortada.`,
      );
    }

    const lockResource = this.hashSchemaName(tenant.schema_name);
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [
      TenantSchemaPurgeProcessor.PURGE_LOCK_NAMESPACE,
      lockResource,
    ]);
    const locked = lockResult.rows?.[0]?.locked === true;

    if (!locked) {
      this.logger.warn(
        `[tenant-purge] Schema ${tenant.schema_name} omitido: lock de purga ocupado.`,
      );
      return;
    }

    try {
      await client.query('BEGIN');
      await this.insertAuditEvent(client, 'TENANT_PURGE_STARTED', tenant, retentionDays);
      await client.query(`DROP SCHEMA IF EXISTS "${tenant.schema_name}" CASCADE`);
      await client.query(
        `DELETE FROM public.tenants WHERE id = $1 AND status = 'MARKED_FOR_DELETION'`,
        [tenant.id],
      );
      await this.insertAuditEvent(client, 'TENANT_PURGE_COMPLETED', tenant, retentionDays);
      await client.query('COMMIT');
      this.logger.log(
        `[tenant-purge] Tenant purgado: id=${tenant.id} schema=${tenant.schema_name}`,
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        TenantSchemaPurgeProcessor.PURGE_LOCK_NAMESPACE,
        lockResource,
      ]);
    }
  }

  private async insertAuditEvent(
    client: { query: (query: string, values?: unknown[]) => Promise<unknown> },
    action: 'TENANT_PURGE_STARTED' | 'TENANT_PURGE_COMPLETED',
    tenant: TenantPurgeRow,
    retentionDays: number,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO public.platform_audit_logs
          (user_id, action, entity_type, entity_id, old_value, new_value, request_id)
        VALUES
          (NULL, $1, 'Tenant', $2, $3::jsonb, $4::jsonb, 'worker:tenant-schema-purge')
      `,
      [
        action,
        tenant.id,
        JSON.stringify({ status: 'MARKED_FOR_DELETION', schemaName: tenant.schema_name }),
        JSON.stringify({ purgedBy: 'worker', retentionDays }),
      ],
    );
  }

  private getRetentionDays(): number {
    const configured = Number(this.config.get<number | string>('TENANT_PURGE_RETENTION_DAYS', 30));
    return Number.isFinite(configured) && configured >= 1 ? configured : 30;
  }

  private getBatchSize(): number {
    const configured = Number(this.config.get<number | string>('TENANT_PURGE_BATCH_SIZE', 20));
    return Number.isFinite(configured) && configured >= 1 ? configured : 20;
  }

  private hashSchemaName(schemaName: string): number {
    let hash = 2166136261;
    for (let index = 0; index < schemaName.length; index += 1) {
      hash ^= schemaName.charCodeAt(index);
      hash = (hash * 16777619) >>> 0;
    }
    return hash | 0;
  }
}
