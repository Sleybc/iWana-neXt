/**
 * MOD09 adjuntos en tickets, hallazgo S-1 (spec 2026-11-16 §2.4): el activo de un adjunto
 * retirado por la supresión del titular (o por la reversión de una importación) pierde su
 * objeto físico en la fase 4 del worker `evidence-orphan-detection`, y queda `DELETED`.
 *
 * Contra PostgreSQL real (base `test`, migraciones públicas hasta la 032). Ejecutar con:
 *   NODE_ENV=test DB_NAME=test IWANA_DB_INTEGRATION_AVAILABLE=true \
 *     pnpm exec jest --config jest.integration.config.js --runInBand evidence-orphan-detection
 *
 * El almacenamiento es un doble que registra las claves: lo que se prueba es la selección
 * real en `public.media_assets` y el cambio de estado. La fila sintética se borra al final:
 * un residuo `ticket_attachment` impide el `down()` de la 032 en su propia integración.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { EvidenceOrphanDetectionProcessor } from './evidence-orphan-detection.processor';

// `process.loadEnvFile` escribe en el `process.env` real, no en el del sandbox de Jest:
// se lee el archivo con `parseEnv` y se completan solo las variables ausentes.
for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (!existsSync(envPath)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envPath, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  break;
}

const DB_NAME = process.env.DB_NAME ?? '';
const TENANT_SCHEMA = 'tenant_test';

describe('S-1 — purga del objeto de un adjunto de ticket retirado (PostgreSQL real)', () => {
  const retiredId = randomUUID();
  const liveId = randomUUID();
  let pool: Pool | undefined;

  beforeAll(async () => {
    // En CI, el job de integración del worker anuncia PostgreSQL real con `R0_3_REAL_DB=1`.
    if (process.env.IWANA_DB_INTEGRATION_AVAILABLE !== 'true' && process.env.R0_3_REAL_DB !== '1') {
      throw new Error(
        '[BLOCKED] Requiere PostgreSQL real (IWANA_DB_INTEGRATION_AVAILABLE=true o R0_3_REAL_DB=1).',
      );
    }
    if (DB_NAME !== 'test') {
      throw new Error(`[BLOCKED] Solo corre contra DB_NAME=test (recibido "${DB_NAME}").`);
    }
    const migrator = resolveMigrationDbCredentials();
    pool = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
      user: migrator.username,
      password: migrator.password,
      database: DB_NAME,
      max: 2,
    });
    for (const [id, deletedAt] of [
      [retiredId, 'now()'],
      [liveId, 'NULL'],
    ] as const) {
      await pool.query(
        `INSERT INTO public.media_assets
           (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes,
            object_key, asset_status, deleted_at)
         VALUES ($1, $2, 'ticket_attachment', $3, 'application/pdf', 'pdf', 4,
                 $4, 'AVAILABLE', ${deletedAt})`,
        [id, TENANT_SCHEMA, `${id}.pdf`, `${TENANT_SCHEMA}/ticket_attachment/${id}`],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await pool
      ?.query(`DELETE FROM public.media_assets WHERE id = ANY($1::uuid[])`, [[retiredId, liveId]])
      .catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  it('borra el objeto del retirado, lo marca DELETED y no toca el vigente', async () => {
    if (!pool) throw new Error('[BLOCKED] setup');
    const deleteObject = jest.fn(async (_key: string) => undefined);
    const processor = new EvidenceOrphanDetectionProcessor(
      new ConfigService(),
      { add: jest.fn() } as unknown as Queue,
      { deleteObject },
    );
    const client: PoolClient = await pool.connect();
    try {
      await (
        processor as unknown as {
          purgeRetiredTicketAttachments: (client: PoolClient, id: string) => Promise<void>;
        }
      ).purgeRetiredTicketAttachments(client, 'corr-s1');
    } finally {
      client.release();
      await (processor as unknown as { pool: Pool }).pool.end().catch(() => undefined);
    }

    expect(deleteObject).toHaveBeenCalledWith(`${TENANT_SCHEMA}/ticket_attachment/${retiredId}`);
    expect(deleteObject).not.toHaveBeenCalledWith(`${TENANT_SCHEMA}/ticket_attachment/${liveId}`);
    const rows = await pool.query<{ id: string; asset_status: string }>(
      `SELECT id::text AS id, asset_status FROM public.media_assets WHERE id = ANY($1::uuid[])`,
      [[retiredId, liveId]],
    );
    const status = new Map(rows.rows.map((row) => [row.id, row.asset_status]));
    expect(status.get(retiredId)).toBe('DELETED');
    expect(status.get(liveId)).toBe('AVAILABLE');

    // Idempotente: una segunda corrida ya no lo selecciona.
    deleteObject.mockClear();
    const again = await pool.connect();
    try {
      await (
        processor as unknown as {
          purgeRetiredTicketAttachments: (client: PoolClient, id: string) => Promise<void>;
        }
      ).purgeRetiredTicketAttachments(again, 'corr-s1-bis');
    } finally {
      again.release();
    }
    expect(deleteObject).not.toHaveBeenCalledWith(
      `${TENANT_SCHEMA}/ticket_attachment/${retiredId}`,
    );
  }, 60_000);
});
