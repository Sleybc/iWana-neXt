/**
 * R0.3 — verificación de infraestructura contra PostgreSQL real.
 *
 * Ejecutar con: R0_3_REAL_DB=1 pnpm --filter @iwana/worker test --
 * execution-order-relay.integration.spec.ts --runInBand
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ExecutionOrderContractReliability0900000000000 } from '../../../../packages/database/src/migrations/tenant/090_execution_order_contract_reliability';
import { ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000 } from '../../../../packages/database/src/migrations/tenant/093_extend_visit_request_status_and_outbox_occurred_at';
import { ExecutionOrderRelayService } from './execution-order-relay.service';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

function loadWorkspaceEnv(): void {
  if (process.env.DB_HOST && process.env.DB_PASSWORD) return;
  for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (!existsSync(envPath)) continue;
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      const separator = line.indexOf('=');
      if (!line || line.startsWith('#') || separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadWorkspaceEnv();

describe('R0.3 relay outbox (PostgreSQL real)', () => {
  let database: Pool | undefined;
  let migrationDataSource: DataSource | undefined;
  let relay: ExecutionOrderRelayService | undefined;
  let tenantId: string | undefined;
  const schemaName = `tenant_r03_relay_${process.pid}_${Date.now()}`;
  const eventId = '00000000-0000-4000-8000-0000000000f3';
  const aggregateId = '00000000-0000-4000-8000-0000000000f4';
  const correlationId = '00000000-0000-4000-8000-0000000000f5';

  beforeAll(async () => {
    if (process.env.R0_3_REAL_DB !== '1') {
      throw new Error(
        '[BLOCKED] R0.3 requiere PostgreSQL real. Configure R0_3_REAL_DB=1 y DB_* antes de ejecutar.',
      );
    }

    database = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5433', 10),
      user: process.env.DB_USER ?? 'iwana',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'dbiw',
      max: 2,
    });
    await database.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantRows = (
      await database.query<{ id: string }>(
        `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email)
       VALUES ('R0.3 relay integration', $1, $2, 'ACTIVE', 'r03-relay@invalid.test')
       ON CONFLICT (schema_name) DO UPDATE SET status = 'ACTIVE'
       RETURNING id::text AS id`,
        [`r03-relay-${process.pid}`, schemaName],
      )
    ).rows;
    tenantId = tenantRows[0]?.id;
    if (!tenantId) throw new Error('[BLOCKED] No fue posible crear el tenant de integración.');

    // Prerequisitos mínimos del esquema anterior, y luego las migraciones
    // oficiales que crean/evolucionan el outbox (090 y 093).
    await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await database.query(`
      CREATE TABLE "${schemaName}".execution_orders (
        id UUID NOT NULL, tenant_id UUID NOT NULL, schedule_event_id UUID NOT NULL
      )
    `);
    await database.query(`CREATE TYPE "${schemaName}".visit_request_status AS ENUM ('CREATED')`);
    migrationDataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5433', 10),
      username: process.env.DB_USER ?? 'iwana',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'dbiw',
      synchronize: false,
      extra: { max: 1, options: `-c search_path="${schemaName}"` },
    });
    await migrationDataSource.initialize();
    const migrationRunner = migrationDataSource.createQueryRunner();
    await migrationRunner.connect();
    await migrationRunner.query(`SET search_path TO "${schemaName}"`);
    await new ExecutionOrderContractReliability0900000000000().up(migrationRunner);
    await new ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000().up(migrationRunner);
    await migrationRunner.release();
    await migrationDataSource.destroy();
    migrationDataSource = undefined;
    await database.query(
      `INSERT INTO "${schemaName}".execution_order_outbox_events
       (event_id, tenant_id, aggregate_id, aggregate_version, event_type, payload, correlation_id)
       VALUES ($1, $2, $3, 1, 'ExecutionOrderStartedV1', $4::jsonb, $5)`,
      [
        eventId,
        tenantId,
        aggregateId,
        JSON.stringify({ executionOrderId: aggregateId }),
        correlationId,
      ],
    );

    const config = {
      get: <T>(key: string, fallback: T): T => {
        const values: Record<string, unknown> = {
          DB_HOST: process.env.DB_HOST ?? 'localhost',
          DB_PORT: Number.parseInt(process.env.DB_PORT ?? '5433', 10),
          DB_USER: process.env.DB_USER ?? 'iwana',
          DB_PASSWORD: process.env.DB_PASSWORD ?? '',
          DB_NAME: process.env.DB_NAME ?? 'dbiw',
        };
        return (values[key] as T | undefined) ?? fallback;
      },
    } as unknown as ConfigService;
    const realQueue = { add: async (): Promise<void> => undefined } as unknown as Queue;
    relay = new ExecutionOrderRelayService(config, realQueue, realQueue);
  });

  afterAll(async () => {
    if (migrationDataSource?.isInitialized)
      await migrationDataSource.destroy().catch(() => undefined);
    if (database) {
      // Limpieza explícita de los objetos creados por 090/093; no usa DROP
      // CASCADE para no poder borrar recursos ajenos aunque el setup falle.
      for (const table of [
        'execution_order_outbox_events',
        'execution_order_inbox_events',
        'execution_order_idempotency_records',
        'execution_order_audit_intents',
      ]) {
        await database
          .query(`DROP TABLE IF EXISTS "${schemaName}"."${table}"`)
          .catch(() => undefined);
      }
      for (const index of [
        'uq_execution_orders_tenant_schedule_event',
        'idx_execution_order_outbox_pending',
        'uq_execution_order_outbox_event',
      ]) {
        await database
          .query(`DROP INDEX IF EXISTS "${schemaName}"."${index}"`)
          .catch(() => undefined);
      }
      await database
        .query(`ALTER TABLE "${schemaName}".execution_orders DROP COLUMN IF EXISTS version`)
        .catch(() => undefined);
      await database
        .query(`DROP TABLE IF EXISTS "${schemaName}".execution_orders`)
        .catch(() => undefined);
      await database
        .query(`DROP TYPE IF EXISTS "${schemaName}".visit_request_status`)
        .catch(() => undefined);
      await database.query(`DROP SCHEMA IF EXISTS "${schemaName}"`).catch(() => undefined);
      await database
        .query(`DELETE FROM public.tenants WHERE schema_name = $1`, [schemaName])
        .catch(() => undefined);
      await database.end().catch(() => undefined);
    }
    if (relay) await (relay as unknown as { pool: Pool }).pool.end().catch(() => undefined);
  });

  it('marca published_at dentro del ciclo del relay', async () => {
    if (!relay || !database) throw new Error('[BLOCKED] El setup PostgreSQL no terminó.');
    await relay.scanAndRelay(10);
    const result = await database.query<{ published_at: Date | null }>(
      `SELECT published_at FROM "${schemaName}".execution_order_outbox_events WHERE event_id = $1`,
      [eventId],
    );
    expect(result.rows[0]?.published_at).not.toBeNull();
  });

  it('revierte el marcado de published_at si la transacción no confirma', async () => {
    if (!database) throw new Error('[BLOCKED] El setup PostgreSQL no terminó.');
    await database.query(
      `UPDATE "${schemaName}".execution_order_outbox_events
       SET published_at = NULL, lease_until = NULL WHERE event_id = $1`,
      [eventId],
    );
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);
      await client.query(
        `UPDATE execution_order_outbox_events SET published_at = NOW() WHERE event_id = $1`,
        [eventId],
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const result = await database.query<{ published_at: Date | null }>(
      `SELECT published_at FROM "${schemaName}".execution_order_outbox_events WHERE event_id = $1`,
      [eventId],
    );
    expect(result.rows[0]?.published_at).toBeNull();
  });
});
