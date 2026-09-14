import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { OPERATIONS_EXECUTION_TOMBSTONE_QUEUE } from '@iwana/shared';
import { isValidSchemaName } from '@iwana/db';

/**
 * Fila de conteos que devuelve `purge_execution_order_retention_batch`
 * (una sola fila por llamada, BIGINT que pg entrega como string).
 *
 * Solo conteos agregados: nunca identificadores de filas, motivos ni actores
 * (dictamen B3 §3.4 — logs sin PII).
 */
interface PurgeRetentionCounts {
  idempotency_records_deleted: number;
  outbox_events_deleted: number;
  inbox_events_deleted: number;
  audit_intents_deleted: number;
  evidence_upload_intents_deleted: number;
  status_transitions_anonymized: number;
}

const EMPTY_PURGE_COUNTS: PurgeRetentionCounts = {
  idempotency_records_deleted: 0,
  outbox_events_deleted: 0,
  inbox_events_deleted: 0,
  audit_intents_deleted: 0,
  evidence_upload_intents_deleted: 0,
  status_transitions_anonymized: 0,
};

/**
 * Normaliza el resultado de la función de purga a conteos numéricos.
 * pg devuelve BIGINT como string; la función emite una sola fila.
 * Un resultado sin filas equivale a ceros, nunca a un fallo de la corrida.
 */
function toPurgeCounts(result: unknown): PurgeRetentionCounts {
  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  const source = (rows?.[0] ?? {}) as Record<string, unknown>;
  const asCount = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    idempotency_records_deleted: asCount(source['idempotency_records_deleted']),
    outbox_events_deleted: asCount(source['outbox_events_deleted']),
    inbox_events_deleted: asCount(source['inbox_events_deleted']),
    audit_intents_deleted: asCount(source['audit_intents_deleted']),
    evidence_upload_intents_deleted: asCount(source['evidence_upload_intents_deleted']),
    status_transitions_anonymized: asCount(source['status_transitions_anonymized']),
  };
}

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
      const totals: PurgeRetentionCounts = { ...EMPTY_PURGE_COUNTS };
      let tenantsProcessed = 0;
      for (const tenant of tenants.rows) {
        if (!isValidSchemaName(tenant.schema_name)) {
          this.logger.warn(
            `[execution-tombstone] Schema inválido omitido: "${tenant.schema_name}"`,
          );
          continue;
        }
        try {
          const counts = await this.processTenant(client, tenant.schema_name);
          tenantsProcessed += 1;
          totals.idempotency_records_deleted += counts.idempotency_records_deleted;
          totals.outbox_events_deleted += counts.outbox_events_deleted;
          totals.inbox_events_deleted += counts.inbox_events_deleted;
          totals.audit_intents_deleted += counts.audit_intents_deleted;
          totals.evidence_upload_intents_deleted += counts.evidence_upload_intents_deleted;
          totals.status_transitions_anonymized += counts.status_transitions_anonymized;
          this.logger.debug(
            `[execution-tombstone] schema=${tenant.schema_name}: ` +
              `idempotency_records_deleted=${counts.idempotency_records_deleted}, ` +
              `outbox_events_deleted=${counts.outbox_events_deleted}, ` +
              `inbox_events_deleted=${counts.inbox_events_deleted}, ` +
              `audit_intents_deleted=${counts.audit_intents_deleted}, ` +
              `evidence_upload_intents_deleted=${counts.evidence_upload_intents_deleted}, ` +
              `status_transitions_anonymized=${counts.status_transitions_anonymized}`,
          );
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : 'unknown error';
          tenantErrors.push(new Error(`schema=${tenant.schema_name}: ${reason}`));
        }
      }

      // La línea se emite SIEMPRE, incluso con todos los conteos en cero:
      // «no purgó nada» y «no corrió» deben distinguirse en los logs.
      this.logger.log(
        `[execution-tombstone] Purga completada: ${tenantsProcessed} tenant(s) procesados, ` +
          `idempotency_records_deleted=${totals.idempotency_records_deleted}, ` +
          `outbox_events_deleted=${totals.outbox_events_deleted}, ` +
          `inbox_events_deleted=${totals.inbox_events_deleted}, ` +
          `audit_intents_deleted=${totals.audit_intents_deleted}, ` +
          `evidence_upload_intents_deleted=${totals.evidence_upload_intents_deleted}, ` +
          `status_transitions_anonymized=${totals.status_transitions_anonymized}`,
      );

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

  private async processTenant(
    client: PoolClient,
    schemaName: string,
  ): Promise<PurgeRetentionCounts> {
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
      // El resultado se captura (una sola fila con seis conteos) en vez de
      // descartarse: desde la migración 134 uno de ellos es cumplimiento de
      // retención de dato personal y la corrida debe dejar rastro.
      const purge = await client.query(
        `SELECT * FROM "${schemaName}".purge_execution_order_retention_batch($1)`,
        [500],
      );
      await client.query('COMMIT');
      return toPurgeCounts(purge);
    } catch (error) {
      await client.query('ROLLBACK');
      const reason = error instanceof Error ? error.message : 'unknown error';
      // Sin PII: solo schema_name y el mensaje del error (códigos 42883/42P01).
      this.logger.error(`[execution-tombstone] Fallo procesando schema=${schemaName}: ${reason}`);
      throw error;
    }
  }
}
