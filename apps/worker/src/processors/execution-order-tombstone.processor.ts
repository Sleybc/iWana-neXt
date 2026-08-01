import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { OPERATIONS_EXECUTION_TOMBSTONE_QUEUE } from '@iwana/shared';
import { isValidSchemaName } from '@iwana/db';

@Injectable()
@Processor(OPERATIONS_EXECUTION_TOMBSTONE_QUEUE)
export class ExecutionOrderTombstoneProcessor extends WorkerHost implements OnApplicationBootstrap {
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
      const tenants = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants WHERE deleted_at IS NULL AND status <> 'MARKED_FOR_DELETION'`,
      );
      for (const tenant of tenants.rows) {
        if (!isValidSchemaName(tenant.schema_name)) continue;
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL search_path TO "${tenant.schema_name}"`);
          await client.query(`UPDATE execution_order_idempotency_records
            SET resource_ref = NULL, result_code = NULL, result_status = 'EXPIRED', tombstoned_at = NOW()
            WHERE expires_at <= NOW() AND tombstoned_at IS NULL
              AND result_status IN ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED')`);
          // El tombstone conserva el registro mínimo para no reejecutar a ciegas;
          // la purga por lotes elimina después los registros ya fuera de retención.
          await client.query('SELECT * FROM purge_execution_order_retention_batch($1)', [500]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }
  }
}
