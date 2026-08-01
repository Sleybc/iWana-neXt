import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { OPERATIONS_EXECUTION_TOMBSTONE_QUEUE } from '@iwana/shared';
import { isValidSchemaName } from '@iwana/db';

@Injectable()
@Processor(OPERATIONS_EXECUTION_TOMBSTONE_QUEUE)
export class ExecutionOrderTombstoneProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExecutionOrderTombstoneProcessor.name);
  private readonly pool: Pool;

  constructor(
    config: ConfigService,
    @InjectQueue(OPERATIONS_EXECUTION_TOMBSTONE_QUEUE) private readonly queue: Queue,
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

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      'compact-execution-tombstones',
      {},
      { repeat: { pattern: '0 4 * * *' }, jobId: 'execution-tombstone-daily' },
    );
  }

  async process(_job: Job): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Solo tenants ACTIVE: son los únicos cuyo schema pasó por el runner de
      // migraciones tenant (getActiveTenants), que crea las tablas del módulo y
      // la función purge_execution_order_retention_batch. Estados intermedios
      // (PROVISIONING, SUSPENDED, INACTIVE, ...) pueden tener schema sin migrar.
      const tenants = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name`,
      );

      const tenantErrors: Error[] = [];
      for (const tenant of tenants.rows) {
        if (!isValidSchemaName(tenant.schema_name)) {
          this.logger.warn(
            `[execution-tombstone] Schema inválido omitido: "${tenant.schema_name}"`,
          );
          continue;
        }
        try {
          await this.processTenant(client, tenant.schema_name);
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : 'unknown error';
          tenantErrors.push(new Error(`schema=${tenant.schema_name}: ${reason}`));
        }
      }

      if (tenantErrors.length > 0) {
        throw new AggregateError(
          tenantErrors,
          `Fallaron ${tenantErrors.length} tenant(s) durante el tombstone de órdenes de ejecución`,
        );
      }
    } finally {
      client.release();
    }
  }

  private async processTenant(client: PoolClient, schemaName: string): Promise<void> {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);
      await client.query(`UPDATE execution_order_idempotency_records
        SET resource_ref = NULL, result_code = NULL, result_status = 'EXPIRED', tombstoned_at = NOW()
        WHERE expires_at <= NOW() AND tombstoned_at IS NULL
          AND result_status IN ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED')`);
      // El tombstone conserva el registro mínimo para no reejecutar a ciegas;
      // la purga por lotes elimina después los registros ya fuera de retención.
      // La función se califica con el schema para no depender solo del search_path.
      await client.query(
        `SELECT * FROM "${schemaName}".purge_execution_order_retention_batch($1)`,
        [500],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      const reason = error instanceof Error ? error.message : 'unknown error';
      // Sin PII: solo schema_name y el mensaje del error (códigos 42883/42P01).
      this.logger.error(`[execution-tombstone] Fallo procesando schema=${schemaName}: ${reason}`);
      throw error;
    }
  }
}
