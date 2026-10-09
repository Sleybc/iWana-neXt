import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import {
  InventoryConsumptionRequestedV2EnvelopeSchema,
  InventoryConsumptionRequestedV2Schema,
  InventoryDisposition,
} from '@iwana/shared';
import { randomUUID } from 'node:crypto';

interface TenantRow {
  id: string;
  schema_name: string;
}

interface PendingUsageRow {
  id: string;
  tenant_id: string;
  execution_order_id: string;
  aggregate_version: number;
  inventory_request_id: string | null;
  item_id: string;
  quantity: number | string;
  serial_number: string | null;
  technician_custody_id: string;
  action: string;
  final_disposition: string;
  subscriber_id: string | null;
  actor_user_id: string | null;
  request_attempts: number;
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error)) return 'INVENTORY_RESCAN_FAILURE';
  const knownTypes = new Set(['Error', 'QueryFailedError', 'TimeoutError', 'AbortError']);
  return knownTypes.has(error.name) ? error.name : 'INVENTORY_RESCAN_FAILURE';
}

/** Reemite solicitudes V2 antiguas sin mutar el resultado del ledger. */
@Injectable()
export class ExecutionOrderInventoryRescanService {
  private readonly logger = new Logger(ExecutionOrderInventoryRescanService.name);
  private readonly pool: Pool;
  private readonly thresholdMinutes: number;
  private readonly maxAttempts: number;
  private readonly batchSize = 100;

  constructor(config: ConfigService) {
    this.thresholdMinutes = this.configuredPositiveInteger(
      config,
      'INVENTORY_REQUEST_RESCAN_THRESHOLD_MINUTES',
      15,
    );
    this.maxAttempts = this.configuredPositiveInteger(
      config,
      'INVENTORY_REQUEST_RESCAN_MAX_ATTEMPTS',
      10,
    );
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }

  async scanPendingRequests(): Promise<number> {
    const lookup = await this.pool.connect();
    let tenants: TenantRow[];
    try {
      const result = await lookup.query<TenantRow>(
        `SELECT id, schema_name FROM public.tenants
         WHERE deleted_at IS NULL AND status <> 'MARKED_FOR_DELETION'`,
      );
      tenants = result.rows.filter((tenant) => isValidSchemaName(tenant.schema_name));
    } finally {
      lookup.release();
    }

    let emitted = 0;
    for (const tenant of tenants) {
      try {
        emitted += await this.rescanTenant(tenant);
      } catch (error) {
        this.logger.error(
          `[inventory-rescan] tenant_scan_failed tenant=${tenant.id} ` +
            `error_type=${safeErrorType(error)}`,
        );
      }
    }
    return emitted;
  }

  private async rescanTenant(tenant: TenantRow): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${tenant.schema_name}"`);

      const pending = await client.query<PendingUsageRow>(
        `SELECT usage.id,
                usage.tenant_id,
                usage.execution_order_id,
                orders.version AS aggregate_version,
                usage.inventory_request_id,
                usage.item_id,
                usage.quantity,
                usage.serial_number,
                usage.technician_custody_id,
                usage.action,
                usage.final_disposition,
                orders.subscriber_id,
                usage.actor_user_id,
                usage.request_attempts
          FROM execution_order_item_usage AS usage
           JOIN execution_orders AS orders
             ON orders.id = usage.execution_order_id
            AND orders.tenant_id = usage.tenant_id
          WHERE usage.tenant_id = $1
            AND usage.movement_status = 'PENDING'
            AND COALESCE(usage.last_requested_at, usage.created_at)
                  <= NOW() - ($2::int * INTERVAL '1 minute')
            AND usage.request_attempts < $3
          ORDER BY COALESCE(usage.last_requested_at, usage.created_at), usage.id
          FOR UPDATE OF usage SKIP LOCKED
          LIMIT $4`,
        [tenant.id, this.thresholdMinutes, this.maxAttempts, this.batchSize],
      );

      let emitted = 0;
      let irrecoverable = 0;
      for (const [index, row] of pending.rows.entries()) {
        const savepoint = `inventory_request_${index}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        const eventId = randomUUID();
        const candidatePayload = {
          executionOrderId: row.execution_order_id,
          eventId,
          intentId: row.inventory_request_id,
          inventoryRequestId: row.inventory_request_id,
          itemId: row.item_id,
          quantity: Number(row.quantity),
          ...(row.serial_number ? { serial: row.serial_number } : {}),
          technicianCustodyId: row.technician_custody_id,
          action: row.action,
          finalDisposition: row.final_disposition,
          subscriberId:
            row.final_disposition === InventoryDisposition.INSTALLED_AT_CUSTOMER
              ? row.subscriber_id
              : null,
          actorUserId: row.actor_user_id,
        };
        const payloadResult = InventoryConsumptionRequestedV2Schema.safeParse(candidatePayload);
        const envelopeResult = payloadResult.success
          ? InventoryConsumptionRequestedV2EnvelopeSchema.safeParse({
              eventId,
              eventType: 'InventoryConsumptionRequestedV2',
              tenantId: tenant.id,
              aggregateId: row.execution_order_id,
              aggregateVersion: row.aggregate_version,
              occurredAt: new Date().toISOString(),
              correlationId: row.inventory_request_id,
              payload: payloadResult.data,
            })
          : { success: false as const };

        const invalidCode =
          row.inventory_request_id === null
            ? 'MISSING_REQUEST_ID'
            : row.actor_user_id === null
              ? 'MISSING_ACTOR'
              : !payloadResult.success || !envelopeResult.success
                ? 'INVALID_PAYLOAD'
                : null;
        if (invalidCode) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(
            `UPDATE execution_order_item_usage
                SET request_attempts = $3,
                    last_requested_at = NOW()
              WHERE id = $1 AND tenant_id = $2 AND movement_status = 'PENDING'`,
            [row.id, tenant.id, this.maxAttempts],
          );
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          irrecoverable += 1;
          this.logger.warn(
            `[inventory-rescan] irrecoverable reason_code=${invalidCode} ` +
              `event=${eventId} tenant=${tenant.id} ot=${row.execution_order_id} ` +
              `inventory_request=${row.inventory_request_id ?? 'null'}`,
          );
          continue;
        }

        if (!payloadResult.success || !envelopeResult.success) {
          throw new Error('Validación de recuperación inconsistente.');
        }

        const envelope = envelopeResult.data;

        await client.query(
          `UPDATE execution_order_item_usage
              SET request_attempts = request_attempts + 1,
                  last_requested_at = NOW()
            WHERE id = $1 AND tenant_id = $2 AND movement_status = 'PENDING'`,
          [row.id, tenant.id],
        );
        await client.query(
          `INSERT INTO execution_order_outbox_events
             (event_id, tenant_id, aggregate_id, aggregate_version, event_type,
              payload, correlation_id, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
          [
            envelope.eventId,
            tenant.id,
            envelope.aggregateId,
            envelope.aggregateVersion,
            envelope.eventType,
            JSON.stringify(envelope.payload),
            envelope.correlationId,
          ],
        );
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        emitted += 1;
      }

      const stuck = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM execution_order_item_usage
          WHERE tenant_id = $2
            AND movement_status = 'PENDING'
            AND request_attempts >= $1`,
        [this.maxAttempts, tenant.id],
      );
      await client.query('COMMIT');

      const stuckCount = Number.parseInt(stuck.rows[0]?.count ?? '0', 10);
      if (stuckCount > 0) {
        this.logger.warn(
          `[inventory-rescan] metric=prolonged_pending tenant=${tenant.id} value=${stuckCount}`,
        );
      }
      if (irrecoverable > 0) {
        this.logger.warn(
          `[inventory-rescan] metric=irrecoverable tenant=${tenant.id} value=${irrecoverable}`,
        );
      }
      return emitted;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private configuredPositiveInteger(config: ConfigService, name: string, fallback: number): number {
    const raw = config.get<string | number>(name);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} debe ser un entero positivo.`);
    }
    return value;
  }
}
