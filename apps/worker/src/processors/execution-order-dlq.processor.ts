import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import { OPERATIONS_EXECUTION_DLQ, type OperationalEventEnvelopeV1 } from '@iwana/shared';

interface DlqJob {
  tenantId: string;
  envelope: OperationalEventEnvelopeV1;
  diagnostic: {
    failedAt: string;
    attemptsMade: number;
    jobId?: string;
    errorMessage: string;
    errorName: string;
  };
}

/**
 * Procesador de Dead Letter Queue para eventos de MOD11.
 *
 * PLAT-P1-02: Almacena el evento fallido con su diagnóstico completo
 * en el outbox como last_error para trazabilidad del operador.
 */
@Injectable()
@Processor(OPERATIONS_EXECUTION_DLQ)
export class ExecutionOrderDlqProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionOrderDlqProcessor.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    super();
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  async process(job: Job<DlqJob>): Promise<void> {
    const { tenantId, envelope, diagnostic } = job.data;

    this.logger.error(
      `[execution-dlq] Evento muerto event_id=${envelope.eventId} ` +
        `type=${envelope.eventType} tenant=${tenantId} ` +
        `attempts=${diagnostic.attemptsMade} error=${diagnostic.errorMessage}`,
    );

    const client = await this.pool.connect();
    try {
      const tenant = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants
         WHERE id = $1 AND deleted_at IS NULL`,
        [tenantId],
      );

      const schemaName = tenant.rows[0]?.schema_name;
      if (!schemaName || !isValidSchemaName(schemaName)) {
        this.logger.error(`[execution-dlq] No se pudo resolver schema para tenant=${tenantId}`);
        return;
      }

      await client.query(`SET LOCAL search_path TO "${schemaName}"`);

      // Actualizar el outbox con el último error para visibilidad del operador
      const updated = await client.query(
        `UPDATE execution_order_outbox_events
         SET last_error = $3
         WHERE event_id = $1 AND tenant_id = $2`,
        [
          envelope.eventId,
          tenantId,
          JSON.stringify({
            failedAt: diagnostic.failedAt,
            attemptsMade: diagnostic.attemptsMade,
            errorName: diagnostic.errorName,
            errorMessage: String(diagnostic.errorMessage).slice(0, 4000),
            dlqJobId: job.id,
          }),
        ],
      );

      if ((updated.rowCount ?? 0) === 0) {
        this.logger.warn(
          `[execution-dlq] Outbox event ${envelope.eventId} no encontrado en tenant ${tenantId}`,
        );
      }

      // Registrar también en el inbox como error terminal
      await client.query(
        `INSERT INTO execution_order_inbox_events
           (tenant_id, consumer, event_id, aggregate_id, aggregate_version,
            processed_at, last_error)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (tenant_id, consumer, event_id)
         DO UPDATE SET last_error = $6, processed_at = NULL`,
        [
          tenantId,
          'mod11-dlq-terminal',
          envelope.eventId,
          envelope.aggregateId,
          envelope.aggregateVersion,
          `DLQ: ${diagnostic.errorName} — ${String(diagnostic.errorMessage).slice(0, 500)}`,
        ],
      );

      this.logger.log(
        `[execution-dlq] Evento ${envelope.eventId} registrado en DLQ para intervención operativa`,
      );
    } catch (error) {
      this.logger.error(
        `[execution-dlq] Fallo al procesar DLQ para ${envelope.eventId}: ` +
          `${error instanceof Error ? error.message : 'unknown'}`,
      );
      // No relanzar: este es el último eslabón; si falla la DLQ misma,
      // el job queda en BullMQ para inspección manual.
    } finally {
      client.release();
    }
  }
}
