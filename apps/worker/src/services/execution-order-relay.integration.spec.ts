/**
 * R0.3 — verificación de infraestructura contra PostgreSQL real.
 *
 * Ejecutar con: R0_3_REAL_DB=1 pnpm --filter @iwana/worker test --
 * execution-order-relay.integration.spec.ts --runInBand
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
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
  let relay: ExecutionOrderRelayService | undefined;
  let tenantId: string | undefined;
  const schemaName = 'tenant_r03_relay';
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
    // El schema es exclusivo de esta prueba; se limpia para que un intento
    // fallido anterior no deje tablas con ownership distinto.
    await database.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
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

    // DDL exacto de 090_execution_order_contract_reliability y
    // 093_extend_visit_request_status_and_outbox_occurred_at, aplicado contra
    // PostgreSQL real para no depender de un tenant preexistente incompleto.
    await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await database.query(`
      CREATE TABLE "${schemaName}".execution_order_outbox_events (
        id UUID NOT NULL DEFAULT gen_random_uuid(), event_id UUID NOT NULL,
        tenant_id UUID NOT NULL, aggregate_id UUID NOT NULL,
        aggregate_version INTEGER NOT NULL, event_type VARCHAR(120) NOT NULL,
        payload JSONB NOT NULL, correlation_id UUID NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ,
        published_at TIMESTAMPTZ, last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_outbox_events PRIMARY KEY (id)
      )
    `);
    await database.query(
      `CREATE UNIQUE INDEX uq_execution_order_outbox_event
       ON "${schemaName}".execution_order_outbox_events (tenant_id, event_id)`,
    );
    await database.query(
      `CREATE INDEX idx_execution_order_outbox_pending
       ON "${schemaName}".execution_order_outbox_events (published_at, available_at, lease_until)
       WHERE published_at IS NULL`,
    );
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
    if (database) {
      await database.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
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
});
