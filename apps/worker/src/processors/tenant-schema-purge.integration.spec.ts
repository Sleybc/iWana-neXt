/**
 * R7 (spec 2026-11-09-plat-ops-r7 §5.1) — la purga programada borra el esquema de un
 * tenant marcado y vencido con la configuración de producción del worker.
 *
 * Contra PostgreSQL real (base `test`). Ejecutar con:
 *   DB_NAME=test R0_3_REAL_DB=1 pnpm --filter @iwana/worker test:integration
 *
 * El procesador se construye con un `ConfigService` sobre `process.env`, igual que en
 * `worker-prod`: la prueba no sustituye credenciales. El esquema lo crea el migrator,
 * como el aprovisionamiento, de modo que su dueño es el de producción.
 *
 * Usa un tenant sintético propio (`tenant_r7_<hex>`) y nunca toca otros tenants. La
 * purga recorre los marcados y vencidos de toda la base: el propio se marca con
 * `deleted_at` muy antiguo, se purga con lote 1 y, si hay otro vencido, la prueba se
 * bloquea sin purgar.
 */
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import type { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { TenantSchemaPurgeProcessor } from './tenant-schema-purge.processor';
import { recordTestPurgeEvidence } from '../../test/tenant-purge-evidence-fixture';

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
const DB_PORT_RAW = process.env.DB_PORT;
const DB_PORT = Number.parseInt(DB_PORT_RAW ?? '', 10);
const DB_NAME = process.env.DB_NAME ?? 'dbiw';

describe('R7 — purga de tenants con el rol de producción (PostgreSQL real)', () => {
  const suffix = randomBytes(6).toString('hex');
  const schemaName = `tenant_r7_${suffix}`;
  const tenantSlug = `r7-${suffix}`;

  let migratorPool: Pool | undefined;
  let purge: TenantSchemaPurgeProcessor | undefined;
  let tenantId: string | undefined;
  let cleanEvidence: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    if (process.env.R0_3_REAL_DB !== '1') {
      throw new Error(
        '[BLOCKED] R7 requiere PostgreSQL real. Configure R0_3_REAL_DB=1 y DB_* antes de ejecutar.',
      );
    }
    if (DB_NAME !== 'test') {
      // La purga real es global: nunca contra la base de desarrollo.
      throw new Error(`[BLOCKED] R7 solo corre contra DB_NAME=test (recibido "${DB_NAME}").`);
    }
    if (!DB_PORT_RAW || !Number.isInteger(DB_PORT)) {
      throw new Error('[BLOCKED] R7 exige DB_PORT explícito.');
    }

    const migrator = resolveMigrationDbCredentials();
    migratorPool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: migrator.username,
      password: migrator.password,
      database: DB_NAME,
      max: 1,
    });

    // 1. Esquema creado por el migrator, como el aprovisionamiento, con una tabla de
    //    negocio y una de auditoría inmutable.
    await migratorPool.query(`CREATE SCHEMA "${schemaName}"`);
    await migratorPool.query(`CREATE TABLE "${schemaName}".r7_negocio (id int PRIMARY KEY)`);
    await migratorPool.query(`CREATE TABLE "${schemaName}".audit_logs (id int PRIMARY KEY)`);
    await migratorPool.query(
      `CREATE TRIGGER trg_r7_audit_immutable BEFORE DELETE OR UPDATE ON "${schemaName}".audit_logs
         FOR EACH ROW EXECUTE FUNCTION public.reject_audit_mutation()`,
    );

    // La fila la inserta el migrator: el reloj de retención (§3.3) no deja fechar la
    // marca en el pasado a ningún otro rol.
    const inserted = await migratorPool.query<{ id: string }>(
      `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email, deleted_at)
       VALUES ('R7 integracion', $1, $2, 'MARKED_FOR_DELETION', 'r7@invalid.test',
               now() - INTERVAL '3650 days')
       RETURNING id::text AS id`,
      [tenantSlug, schemaName],
    );
    tenantId = inserted.rows[0]?.id;
    if (!tenantId) throw new Error('[BLOCKED] No fue posible crear el tenant sintético.');
    cleanEvidence = await recordTestPurgeEvidence(tenantId);

    // 2. Misma configuración que worker-prod: ConfigService sobre process.env.
    purge = new TenantSchemaPurgeProcessor(new ConfigService());
  }, 60_000);

  afterAll(async () => {
    if (migratorPool) {
      await migratorPool
        .query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
        .catch(() => undefined);
      if (tenantId) {
        await migratorPool
          .query(`DELETE FROM public.tenants WHERE id = $1 AND schema_name = $2`, [
            tenantId,
            schemaName,
          ])
          .catch(() => undefined);
      }
    }
    await (purge as unknown as { pool?: Pool } | undefined)?.pool?.end().catch(() => undefined);
    await migratorPool?.end().catch(() => undefined);
    await cleanEvidence?.();
  });

  it('borra el esquema y la fila de un tenant marcado y vencido, y lo audita', async () => {
    if (!migratorPool || !purge || !tenantId) throw new Error('[BLOCKED] setup');

    const foreign = await migratorPool.query<{ n: number }>(
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

    // 3. Sin falso verde: la conexión de la purga no es superusuario ni miembro del
    //    migrator (dueño de los esquemas).
    const purgePool = (purge as unknown as { pool: Pool }).pool;
    const identity = await purgePool.query<{ superuser: boolean; migrator_member: boolean }>(
      `SELECT r.rolsuper AS superuser,
              pg_has_role(current_user, 'iwana_migrator', 'MEMBER') AS migrator_member
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(identity.rows[0]).toEqual({ superuser: false, migrator_member: false });

    // 4. La purga real, con lote 1.
    process.env.TENANT_PURGE_BATCH_SIZE = '1';
    try {
      await purge.process({ id: 'r7-purge' } as unknown as Job);
    } finally {
      delete process.env.TENANT_PURGE_BATCH_SIZE;
    }

    const schema = await migratorPool.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [
      schemaName,
    ]);
    expect(schema.rowCount).toBe(0);
    const row = await migratorPool.query(`SELECT 1 FROM public.tenants WHERE id = $1`, [tenantId]);
    expect(row.rowCount).toBe(0);
    const audit = await migratorPool.query<{ action: string }>(
      `SELECT action FROM public.platform_audit_logs
        WHERE entity_type = 'Tenant' AND entity_id = $1
          AND action IN ('TENANT_PURGE_STARTED', 'TENANT_PURGE_COMPLETED')`,
      [tenantId],
    );
    expect(audit.rows.map((r) => r.action).sort()).toEqual([
      'TENANT_PURGE_COMPLETED',
      'TENANT_PURGE_STARTED',
    ]);
  }, 120_000);
});
