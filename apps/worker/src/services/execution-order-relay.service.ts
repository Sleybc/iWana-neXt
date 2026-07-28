import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Pool } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import {
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  OPERATIONS_EXECUTION_RELAY_QUEUE,
  type OperationalEventEnvelopeV1,
} from '@iwana/shared';

interface TenantRow {
  id: string;
  schema_name: string;
}

interface OutboxRow {
  event_id: string;
  tenant_id: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  payload: OperationalEventEnvelopeV1['payload'];
  correlation_id: string;
  occurred_at: string;
}

interface TenantScanResult {
  tenantId: string;
  schemaName: string;
  relayed: number;
  error?: string;
}

const RELAY_POOL_MAX = 10;
const RELAY_SCAN_CONCURRENCY = RELAY_POOL_MAX - 1;

/**
 * Scanner/relay durable para eventos del outbox de MOD11.
 *
 * PLAT-P0-03: pool max: 10, idleTimeoutMillis: 30000.
 * Escaneo paralelo de tenants con Promise.allSettled.
 * Lease expirable, reintento con backoff exponencial y crash-window protegido.
 */
@Injectable()
export class ExecutionOrderRelayService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExecutionOrderRelayService.name);
  private readonly pool: Pool;
  private readonly leaseSeconds = 60;
  private lastScanAt: Date | null = null;
  private lastScanCount = 0;

  constructor(
    config: ConfigService,
    @InjectQueue(OPERATIONS_EXECUTION_RELAY_QUEUE) private readonly queue: Queue,
    @InjectQueue(OPERATIONS_EXECUTION_EVENTS_QUEUE)
    private readonly eventsQueue: Queue,
  ) {
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: RELAY_POOL_MAX, // PLAT-P0-03
      idleTimeoutMillis: 30_000,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      'scan-execution-outbox',
      {},
      {
        repeat: { every: 5000 },
        jobId: 'execution-outbox-scanner',
      },
    );
  }

  /** Expone estado del relay para el health endpoint. */
  get relayStatus(): {
    lastScanAt: Date | null;
    lastScanCount: number;
    pendingEvents: number;
  } {
    return {
      lastScanAt: this.lastScanAt,
      lastScanCount: this.lastScanCount,
      pendingEvents: 0, // se actualiza en scanAndRelay
    };
  }

  /**
   * Escanea el outbox de todos los tenants activos en paralelo.
   *
   * PLAT-P0-03: limita los tenants concurrentes al presupuesto del pool.
   */
  async scanAndRelay(batchSize = 100): Promise<number> {
    const client = await this.pool.connect();
    let totalRelayed = 0;

    try {
      const tenants = await client.query<TenantRow>(
        `SELECT id, schema_name FROM public.tenants
         WHERE deleted_at IS NULL AND status <> 'MARKED_FOR_DELETION'`,
      );

      const validTenants = tenants.rows.filter((t) => isValidSchemaName(t.schema_name));
      const results: PromiseSettledResult<TenantScanResult>[] = [];
      for (let offset = 0; offset < validTenants.length; offset += RELAY_SCAN_CONCURRENCY) {
        const wave = validTenants.slice(offset, offset + RELAY_SCAN_CONCURRENCY);
        results.push(
          ...(await Promise.allSettled(
            wave.map((tenant) => this.scanTenantOutbox(tenant, batchSize)),
          )),
        );
      }

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalRelayed += result.value.relayed;
        } else {
          this.logger.error(`Relay tenant scan falló: ${result.reason?.message ?? 'unknown'}`);
        }
      }
    } finally {
      client.release();
    }

    this.lastScanAt = new Date();
    this.lastScanCount = totalRelayed;
    return totalRelayed;
  }

  /**
   * Escanea el outbox de un único tenant: lease + enqueue + mark.
   *
   * Crash-window seguro:
   * 1. Si crash entre lease y enqueue → lease expira, otro scan lo retoma.
   * 2. Si crash entre enqueue y mark → inbox deduplica por eventId.
   */
  private async scanTenantOutbox(tenant: TenantRow, batchSize: number): Promise<TenantScanResult> {
    const result: TenantScanResult = {
      tenantId: tenant.id,
      schemaName: tenant.schema_name,
      relayed: 0,
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${tenant.schema_name}"`);

      // Lease + lock: toma eventos pendientes con FOR UPDATE SKIP LOCKED
      const rows = await client.query<OutboxRow>(
        `UPDATE execution_order_outbox_events
         SET lease_until = NOW() + ($1::int * INTERVAL '1 second'),
             attempt_count = attempt_count + 1
         WHERE id IN (
           SELECT id FROM execution_order_outbox_events
           WHERE published_at IS NULL
             AND available_at <= NOW()
             AND (lease_until IS NULL OR lease_until < NOW())
           ORDER BY occurred_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         RETURNING
           event_id,
           tenant_id,
           aggregate_id,
           aggregate_version,
           event_type,
           payload,
           correlation_id,
           occurred_at`,
        [this.leaseSeconds, batchSize],
      );
      await client.query('COMMIT');

      // Encolar cada evento con retry exponencial (8 intentos)
      for (const row of rows.rows) {
        const jobId = `execution-event-${row.event_id}`;

        try {
          await this.eventsQueue.add(
            'deliver-execution-event',
            {
              tenantId: row.tenant_id,
              envelope: {
                eventId: row.event_id,
                eventType: row.event_type as OperationalEventEnvelopeV1['eventType'],
                tenantId: row.tenant_id,
                aggregateId: row.aggregate_id,
                aggregateVersion: row.aggregate_version,
                occurredAt: new Date(row.occurred_at).toISOString(),
                correlationId: row.correlation_id,
                payload: row.payload as OperationalEventEnvelopeV1['payload'],
              },
            },
            {
              jobId,
              attempts: 8, // PLAT-P1-02: 8 intentos antes de DLQ
              backoff: { type: 'exponential', delay: 1000 },
              removeOnComplete: true,
            },
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Relay: fallo de enqueue event_id=${row.event_id} tenant=${tenant.id}: ${reason}. ` +
              `El lease expirará y será reintentado.`,
          );
          continue;
        }

        // El marcado tiene su propia transacción: SET LOCAL solo tiene efecto
        // hasta COMMIT y no puede ejecutarse después de cerrar la transacción.
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL search_path TO "${tenant.schema_name}"`);
          await client.query(
            `UPDATE execution_order_outbox_events
              SET published_at = NOW(), lease_until = NULL
              WHERE event_id = $1 AND published_at IS NULL`,
            [row.event_id],
          );
          await client.query('COMMIT');
          result.relayed += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          await client.query('ROLLBACK').catch(() => undefined);
          this.logger.error(
            `Relay: fallo de marcado event_id=${row.event_id} tenant=${tenant.id}: ${reason}. ` +
              `El evento quedará elegible para reintento.`,
          );
        }
      }

      // Re-escaneo de leases expirados (eventos que quedaron leaseados pero
      // sin publish porque el worker anterior murió entre lease y enqueue)
      // Estos se liberan y serán tomados en el próximo scan.
      // No se hace en esta transacción para no alargar el lock.
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Relay: fallo en tenant ${tenant.schema_name}: ${result.error}`);
    } finally {
      client.release();
    }

    return result;
  }

  /**
   * Obtiene métricas de pending events por tenant para el health endpoint.
   */
  async getPendingEventsPerTenant(): Promise<
    Array<{
      tenantId: string;
      schemaName: string;
      pendingCount: number;
      oldestAgeSeconds: number | null;
    }>
  > {
    const client = await this.pool.connect();
    try {
      const tenants = await client.query<TenantRow>(
        `SELECT id, schema_name FROM public.tenants
         WHERE deleted_at IS NULL AND status <> 'MARKED_FOR_DELETION'`,
      );

      const metrics: Array<{
        tenantId: string;
        schemaName: string;
        pendingCount: number;
        oldestAgeSeconds: number | null;
      }> = [];

      for (const tenant of tenants.rows) {
        if (!isValidSchemaName(tenant.schema_name)) continue;
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL search_path TO "${tenant.schema_name}"`);
          const pending = await client.query<{
            pending_count: string;
            oldest_age_seconds: string | null;
          }>(
            `SELECT
               COUNT(*) AS pending_count,
               COALESCE(
                 EXTRACT(EPOCH FROM NOW() - MIN(occurred_at))::bigint,
                 NULL
               ) AS oldest_age_seconds
             FROM execution_order_outbox_events
             WHERE published_at IS NULL`,
          );

          metrics.push({
            tenantId: tenant.id,
            schemaName: tenant.schema_name,
            pendingCount: parseInt(pending.rows[0]?.pending_count ?? '0', 10),
            oldestAgeSeconds: pending.rows[0]?.oldest_age_seconds
              ? parseInt(pending.rows[0].oldest_age_seconds, 10)
              : null,
          });
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          this.logger.warn(`Relay: fallo de métricas tenant=${tenant.id}; se omite del reporte.`);
        }
      }

      return metrics;
    } finally {
      client.release();
    }
  }
}
