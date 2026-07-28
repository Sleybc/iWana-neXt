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

const enabled = process.env.R0_3_REAL_DB === '1';

(enabled ? describe : describe.skip)('R0.3 relay outbox (PostgreSQL real)', () => {
  let database: Pool;
  let relay: ExecutionOrderRelayService;
  let tenantId: string;
  const schemaName = 'tenant_iwana';
  const eventId = '00000000-0000-4000-8000-0000000000f3';
  const aggregateId = '00000000-0000-4000-8000-0000000000f4';
  const correlationId = '00000000-0000-4000-8000-0000000000f5';

  beforeAll(async () => {
    database = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5433', 10),
      user: process.env.DB_USER ?? 'iwana',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'dbiw',
      max: 2,
    });
    const tenants = await database.query<{ id: string }>(
      `SELECT id::text AS id FROM public.tenants WHERE schema_name = $1 LIMIT 1`,
      [schemaName],
    );
    if (!tenants.rows[0]) throw new Error(`No existe el schema de prueba ${schemaName}.`);
    tenantId = tenants.rows[0].id;
    await database.query(
      `INSERT INTO "${schemaName}".execution_order_outbox_events
       (event_id, tenant_id, aggregate_id, aggregate_version, event_type, payload, correlation_id)
       VALUES ($1, $2, $3, 1, 'ExecutionOrderStartedV1', $4::jsonb, $5)
       ON CONFLICT (tenant_id, event_id) DO UPDATE
       SET published_at = NULL, lease_until = NULL, available_at = NOW()`,
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
    await database.query(
      `DELETE FROM "${schemaName}".execution_order_outbox_events WHERE event_id = $1`,
      [eventId],
    );
    await database.end();
    await (relay as unknown as { pool: Pool }).pool.end();
  });

  it('marca published_at dentro del ciclo del relay', async () => {
    await relay.scanAndRelay(10);
    const result = await database.query<{ published_at: Date | null }>(
      `SELECT published_at FROM "${schemaName}".execution_order_outbox_events WHERE event_id = $1`,
      [eventId],
    );
    expect(result.rows[0]?.published_at).not.toBeNull();
  });
});
