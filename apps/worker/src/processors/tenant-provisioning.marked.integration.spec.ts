/**
 * DT-4 (spec 2026-11-09-plat-ops-dt4 §4.3) — un tenant marcado para eliminación con un job
 * de aprovisionamiento pendiente no se reactiva y se purga al vencer la retención.
 *
 * Contra PostgreSQL real (base `test`). Ejecutar con:
 *   DB_NAME=test R0_3_REAL_DB=1 pnpm --filter @iwana/worker test:integration
 *
 * Usa un tenant sintético propio (`tenant_dt4_<hex>`); nunca toca otros tenants.
 * La purga real recorre los tenants marcados y vencidos de la base. Dos defensas:
 * el tenant propio se marca con `deleted_at` muy antiguo (3650 días) y la purga
 * corre con lote 1, de modo que solo toma el más antiguo; y antes se comprueba que
 * no haya ningún tenant ajeno vencido (si lo hay, el test se bloquea sin purgar).
 */
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import type { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Tenant, resolveMigrationDbCredentials } from '@iwana/db';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import { TenantSchemaPurgeProcessor } from './tenant-schema-purge.processor';
import type { TenantSeedService } from '../services/tenant-seed.service';

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

const DB_HOST = process.env.DB_HOST ?? 'localhost';
// Sin default: el procesador de aprovisionamiento usa 5432 por defecto y el test
// no puede apuntar a un servidor distinto del suyo.
const DB_PORT_RAW = process.env.DB_PORT;
const DB_PORT = Number.parseInt(DB_PORT_RAW ?? '', 10);
const DB_USER = process.env.DB_USER ?? 'iwana';
const DB_PASSWORD = process.env.DB_PASSWORD ?? '';
const DB_NAME = process.env.DB_NAME ?? 'dbiw';

describe('DT-4 — aprovisionamiento de un tenant marcado (PostgreSQL real)', () => {
  const suffix = randomBytes(6).toString('hex');
  const schemaName = `tenant_dt4_${suffix}`;
  const tenantSlug = `dt4-${suffix}`;

  let database: Pool | undefined;
  let cleanupPool: Pool | undefined;
  let dataSource: DataSource | undefined;
  let provisioning: TenantProvisioningProcessor | undefined;
  let purge: TenantSchemaPurgeProcessor | undefined;
  let tenantId: string | undefined;
  let originalDeletedAt: string | undefined;
  const seedCalls: string[] = [];
  // W1 (§8.2): segundo tenant propio, este sí se aprovisiona de verdad.
  const w1Schema = `tenant_dt4w_${suffix}`;
  const w1Slug = `dt4w-${suffix}`;
  let w1TenantId: string | undefined;
  let w1Processor: TenantProvisioningProcessor | undefined;

  beforeAll(async () => {
    if (process.env.R0_3_REAL_DB !== '1') {
      throw new Error(
        '[BLOCKED] DT-4 requiere PostgreSQL real. Configure R0_3_REAL_DB=1 y DB_* antes de ejecutar.',
      );
    }
    if (DB_NAME !== 'test') {
      // La purga real es global: nunca contra la base de desarrollo.
      throw new Error(`[BLOCKED] DT-4 solo corre contra DB_NAME=test (recibido "${DB_NAME}").`);
    }
    if (!DB_PORT_RAW || !Number.isInteger(DB_PORT)) {
      throw new Error(
        '[BLOCKED] DT-4 exige DB_PORT explícito (el procesador y el test deben compartir servidor).',
      );
    }
    // El procesador de aprovisionamiento lee DB_HOST/DB_PORT/DB_NAME de process.env
    // (constructor y migraciones): se fijan desde las constantes del test para que
    // ambos apunten al mismo servidor y a la misma base.
    process.env.DB_HOST = DB_HOST;
    process.env.DB_PORT = String(DB_PORT);
    process.env.DB_NAME = DB_NAME;

    database = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      max: 2,
    });
    const migrator = resolveMigrationDbCredentials();
    cleanupPool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: migrator.username,
      password: migrator.password,
      database: DB_NAME,
      max: 1,
    });

    // 1. Tenant en PROVISIONING (job encolado) y luego marcado para eliminación
    //    con la retención ya vencida.
    const inserted = await database.query<{ id: string }>(
      `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email)
       VALUES ('DT-4 integracion', $1, $2, 'PROVISIONING', 'dt4@invalid.test')
       RETURNING id::text AS id`,
      [tenantSlug, schemaName],
    );
    tenantId = inserted.rows[0]?.id;
    if (!tenantId) throw new Error('[BLOCKED] No fue posible crear el tenant sintético.');

    // R7 (§3.3): el reloj de retención solo deja fechar la marca en el pasado a
    // miembros del migrator; por eso la marca la hace cleanupPool.
    const marked = await cleanupPool.query<{ deleted_at: string }>(
      `UPDATE public.tenants
          SET status = 'MARKED_FOR_DELETION', deleted_at = now() - INTERVAL '3650 days'
        WHERE id = $1
        RETURNING deleted_at::text AS deleted_at`,
      [tenantId],
    );
    originalDeletedAt = marked.rows[0]?.deleted_at;

    dataSource = new DataSource({
      type: 'postgres',
      host: DB_HOST,
      port: DB_PORT,
      username: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      entities: [Tenant],
      synchronize: false,
      extra: { max: 2 },
    });
    await dataSource.initialize();

    // Doble del seed: si el procesador llega a sembrar, el job ya violó DT-4.
    const failingSeed = {
      seedInitialAdmin: async (): Promise<never> => {
        seedCalls.push('seedInitialAdmin');
        throw new Error('DT-4: el seed no debe ejecutarse para un tenant marcado');
      },
      seedTaxPresets: async (): Promise<never> => {
        seedCalls.push('seedTaxPresets');
        throw new Error('DT-4: el seed no debe ejecutarse para un tenant marcado');
      },
    } as unknown as TenantSeedService;
    provisioning = new TenantProvisioningProcessor(dataSource, failingSeed);

    const config = {
      get: <T>(key: string, fallback: T): T => {
        const values: Record<string, unknown> = {
          DB_HOST,
          DB_PORT,
          DB_USER,
          DB_PASSWORD,
          DB_NAME,
          DB_PURGER_USER: process.env.DB_PURGER_USER,
          DB_PURGER_PASSWORD: process.env.DB_PURGER_PASSWORD,
          TENANT_PURGE_RETENTION_DAYS: 30,
          TENANT_PURGE_BATCH_SIZE: 1,
        };
        return (values[key] as T | undefined) ?? fallback;
      },
    } as unknown as ConfigService;
    purge = new TenantSchemaPurgeProcessor(config);
  }, 60_000);

  afterAll(async () => {
    if (cleanupPool) {
      // Solo el esquema y la fila propios; nunca otros tenants.
      await cleanupPool
        .query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
        .catch(() => undefined);
    }
    if (database && tenantId) {
      await database
        .query(`DELETE FROM public.tenants WHERE id = $1 AND schema_name = $2`, [
          tenantId,
          schemaName,
        ])
        .catch(() => undefined);
    }
    if (cleanupPool) {
      await cleanupPool.query(`DROP SCHEMA IF EXISTS "${w1Schema}" CASCADE`).catch(() => undefined);
    }
    if (database && w1TenantId) {
      await database
        .query(`DELETE FROM public.tenants WHERE id = $1 AND schema_name = $2`, [
          w1TenantId,
          w1Schema,
        ])
        .catch(() => undefined);
    }
    const internals = [
      (provisioning as unknown as { pgPool?: Pool } | undefined)?.pgPool,
      (w1Processor as unknown as { pgPool?: Pool } | undefined)?.pgPool,
      (purge as unknown as { pool?: Pool } | undefined)?.pool,
    ];
    for (const pool of internals) await pool?.end().catch(() => undefined);
    if (dataSource?.isInitialized) await dataSource.destroy().catch(() => undefined);
    await cleanupPool?.end().catch(() => undefined);
    await database?.end().catch(() => undefined);
  });

  it('no reactiva el tenant marcado y la purga lo elimina al vencer la retención', async () => {
    if (!database || !provisioning || !purge || !tenantId) throw new Error('[BLOCKED] setup');

    // 2. El job pendiente se procesa con el procesador real.
    const job = {
      id: `provision-${tenantId}`,
      data: { tenantId, schemaName, tenantSlug, adminEmail: 'dt4-admin@invalid.test' },
    } as unknown as Job<ProvisioningJobPayload>;
    const failure = await provisioning.process(job).then(
      () => undefined,
      (error: unknown) => error,
    );

    // 3. Estado y retención intactos, sin esquema creado y sin seed (se afirma
    //    antes que el error para que un rojo muestre qué le hizo el job al tenant).
    const after = await database.query<{ status: string; deleted_at: string | null }>(
      `SELECT status, deleted_at::text AS deleted_at FROM public.tenants WHERE id = $1`,
      [tenantId],
    );
    expect(after.rows[0]?.status).toBe('MARKED_FOR_DELETION');
    expect(after.rows[0]?.deleted_at).toBe(originalDeletedAt);
    const schema = await database.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    expect(schema.rowCount).toBe(0);
    expect(seedCalls).toEqual([]);
    // El job termina como error visible y no reintentable (decisión G0).
    expect(failure).toMatchObject({
      name: 'UnrecoverableError',
      message: expect.stringContaining('TENANT_NOT_PROVISIONABLE'),
    });

    // 4. La purga real lo elimina. Es global: se bloquea si hay tenants ajenos
    //    marcados y vencidos en la base, para no purgarlos.
    const foreign = await database.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.tenants
        WHERE status = 'MARKED_FOR_DELETION'
          AND deleted_at IS NOT NULL
          AND deleted_at <= NOW() - INTERVAL '30 days'
          AND id <> $1`,
      [tenantId],
    );
    if ((foreign.rows[0]?.n ?? 0) > 0) {
      throw new Error(
        `[BLOCKED] Hay ${foreign.rows[0]?.n} tenants ajenos marcados y vencidos en la base: ` +
          'la purga global los borraría. Revise la base de pruebas antes de reejecutar.',
      );
    }

    // R7 / ADR-108: la purga corre con el rol de purga (pool propio del procesador),
    // que no toca tablas: solo ejecuta las funciones definer de la migración 029.
    const purgePool = (purge as unknown as { pool: Pool }).pool;
    const privileges = await purgePool.query<{
      user: string;
      can_purge: boolean;
      can_delete: boolean;
    }>(
      `SELECT current_user AS user,
              has_function_privilege('public.iwana_purge_tenant_schema(uuid, integer)', 'EXECUTE') AS can_purge,
              has_table_privilege('public.tenants', 'DELETE') AS can_delete`,
    );
    expect(privileges.rows[0]).toEqual({
      user: process.env.DB_PURGER_USER,
      can_purge: true,
      can_delete: false,
    });

    await purge.process({ id: 'dt4-purge' } as unknown as Job);

    const gone = await database.query(`SELECT 1 FROM public.tenants WHERE id = $1`, [tenantId]);
    expect(gone.rowCount).toBe(0);
    const audit = await database.query<{ action: string }>(
      `SELECT action FROM public.platform_audit_logs
        WHERE entity_type = 'Tenant' AND entity_id = $1
          AND action IN ('TENANT_PURGE_STARTED', 'TENANT_PURGE_COMPLETED')`,
      [tenantId],
    );
    expect(audit.rows.map((row) => row.action).sort()).toEqual([
      'TENANT_PURGE_COMPLETED',
      'TENANT_PURGE_STARTED',
    ]);
  }, 180_000);

  // DT-4 v1.1 §8.2 W1 contra PostgreSQL real: un reintento colado (segundo job del
  // mismo tenant) no repite DDL, migraciones ni seed.
  it('W1: dos process() seguidos de un tenant PROVISIONING aprovisionan una sola vez', async () => {
    if (!database || !dataSource) throw new Error('[BLOCKED] setup');

    const inserted = await database.query<{ id: string }>(
      `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email)
       VALUES ('DT-4 W1 integracion', $1, $2, 'PROVISIONING', 'dt4w@invalid.test')
       RETURNING id::text AS id`,
      [w1Slug, w1Schema],
    );
    w1TenantId = inserted.rows[0]?.id;
    if (!w1TenantId) throw new Error('[BLOCKED] No fue posible crear el tenant W1.');

    // Doble del seed que cuenta: el primer job siembra, el segundo no debe.
    const w1SeedCalls: string[] = [];
    const countingSeed = {
      seedInitialAdmin: async (): Promise<{ created: boolean }> => {
        w1SeedCalls.push('seedInitialAdmin');
        return { created: true };
      },
      seedTaxPresets: async (): Promise<void> => {
        w1SeedCalls.push('seedTaxPresets');
      },
    } as unknown as TenantSeedService;
    w1Processor = new TenantProvisioningProcessor(dataSource, countingSeed);
    // CREATE SCHEMA es la única sentencia que pide un cliente dedicado al pool DDL
    // con `await pool.connect()` (sin argumentos); `pool.query` también llama a
    // connect, pero con callback, así que se filtran por aridad.
    const ddlPool = (w1Processor as unknown as { pgPool: Pool }).pgPool;
    const connectSpy = jest.spyOn(ddlPool, 'connect');

    const job = {
      id: `provision-${w1TenantId}`,
      data: {
        tenantId: w1TenantId,
        schemaName: w1Schema,
        tenantSlug: w1Slug,
        adminEmail: 'dt4w-admin@invalid.test',
      },
    } as unknown as Job<ProvisioningJobPayload>;

    await w1Processor.process(job);
    const afterFirst = await database.query<{ status: string }>(
      `SELECT status FROM public.tenants WHERE id = $1`,
      [w1TenantId],
    );
    expect(afterFirst.rows[0]?.status).toBe('ACTIVE');
    const migrationsAfterFirst = await cleanupPoolCount(w1Schema);

    await w1Processor.process(job);

    const dedicatedClients = (connectSpy.mock.calls as unknown[][]).filter(
      (call) => call.length === 0,
    );
    expect(dedicatedClients).toHaveLength(1);
    expect(w1SeedCalls).toEqual(['seedInitialAdmin', 'seedTaxPresets']);
    expect(await cleanupPoolCount(w1Schema)).toBe(migrationsAfterFirst);
    const afterSecond = await database.query<{ status: string }>(
      `SELECT status FROM public.tenants WHERE id = $1`,
      [w1TenantId],
    );
    expect(afterSecond.rows[0]?.status).toBe('ACTIVE');
    connectSpy.mockRestore();
  }, 180_000);

  async function cleanupPoolCount(schema: string): Promise<number> {
    if (!cleanupPool) throw new Error('[BLOCKED] setup');
    const rows = await cleanupPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${schema}"."typeorm_migrations"`,
    );
    return rows.rows[0]?.n ?? 0;
  }
});
