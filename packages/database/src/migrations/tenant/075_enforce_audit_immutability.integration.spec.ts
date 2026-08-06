import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { EnforceAuditImmutability0750000000000 } from './075_enforce_audit_immutability';

/**
 * H-4 (SEC-P1) — ejercicio runtime del trigger `reject_audit_mutation` sobre
 * PostgreSQL real. Complementa la evidencia estática de
 * `075_enforce_audit_immutability.spec.ts`.
 *
 * `pnpm --filter @iwana/db test:integration`. Sin DB alcanzable,
 * `test/integration-db-probe.js` deja `IWANA_DB_INTEGRATION_AVAILABLE !== 'true'`
 * y esta suite hace `describe.skip` con warning (no verde silencioso).
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const suffix = randomBytes(8).toString('hex');
const SCHEMA = `it_075_audit_imm_${suffix}`;

/** SQLSTATE de `USING ERRCODE = 'insufficient_privilege'` en 075/014. */
const INSUFFICIENT_PRIVILEGE = '42501';

if (!dbAvailable) {
  console.warn(
    '[075-integration] describe.skip activo — sin PostgreSQL real; el trigger de inmutabilidad de audit_logs no se valida contra un schema.',
  );
}

describeWithDb('075 enforce audit immutability — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  const tenantId = randomUUID();
  const rowId = randomUUID();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);

    // DDL mínimo: columnas que toca INSERT/UPDATE de redacción sintética.
    await runner.query(`
      CREATE TABLE audit_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        user_agent VARCHAR(512),
        request_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_audit_logs PRIMARY KEY (id)
      )
    `);

    const migration = new EnforceAuditImmutability0750000000000();
    await migration.up(runner);

    // Fixture sintético — sin PII real; valores ya redactados o placeholders.
    await runner.query(
      `INSERT INTO audit_logs
         (id, tenant_id, action, entity_type, entity_id, old_value, new_value)
       VALUES
         ($1, $2, 'UPDATE', 'subscriber', 'synthetic-entity-001',
          $3::jsonb, $4::jsonb)`,
      [
        rowId,
        tenantId,
        JSON.stringify({ fullName: '[REDACTADO]' }),
        JSON.stringify({ fullName: 'valor-sintetico-pre-redaccion' }),
      ],
    );
  });

  afterAll(async () => {
    if (runner) {
      await runner.release();
    }

    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('075 up instala el trigger BEFORE UPDATE OR DELETE sobre audit_logs', async () => {
    const rows = (await runner.query(
      `SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = current_schema()
         AND c.relname = 'audit_logs'
         AND NOT t.tgisinternal
         AND t.tgname = 'trg_audit_logs_immutable'`,
    )) as Array<{ tgname: string; definition: string }>;

    expect(rows).toHaveLength(1);
    // pg_get_triggerdef normaliza el orden a DELETE OR UPDATE.
    expect(rows[0]?.definition).toMatch(/BEFORE (?:UPDATE OR DELETE|DELETE OR UPDATE)/i);
    expect(rows[0]?.definition).toMatch(/reject_audit_mutation/i);
  });

  it('rechaza UPDATE sobre audit_logs sin iwana.audit_maintenance', async () => {
    await expect(
      runner.query(`UPDATE audit_logs SET new_value = $1::jsonb WHERE id = $2`, [
        JSON.stringify({ fullName: '[REDACTADO]' }),
        rowId,
      ]),
    ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });

    const rows = (await runner.query(
      `SELECT new_value->>'fullName' AS name FROM audit_logs WHERE id = $1`,
      [rowId],
    )) as Array<{ name: string }>;
    expect(rows[0]?.name).toBe('valor-sintetico-pre-redaccion');
  });

  it('rechaza DELETE sobre audit_logs sin iwana.audit_maintenance', async () => {
    await expect(
      runner.query(`DELETE FROM audit_logs WHERE id = $1`, [rowId]),
    ).rejects.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
    });

    const rows = (await runner.query(
      `SELECT EXISTS (SELECT 1 FROM audit_logs WHERE id = $1) AS present`,
      [rowId],
    )) as Array<{ present: boolean }>;
    expect(rows[0]?.present).toBe(true);
  });

  it('permite UPDATE de mantenimiento con SET LOCAL iwana.audit_maintenance = on', async () => {
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL iwana.audit_maintenance = 'on'`);
      await runner.query(`UPDATE audit_logs SET new_value = $1::jsonb WHERE id = $2`, [
        JSON.stringify({ fullName: '[REDACTADO]' }),
        rowId,
      ]);
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      throw error;
    }

    const rows = (await runner.query(
      `SELECT new_value->>'fullName' AS name FROM audit_logs WHERE id = $1`,
      [rowId],
    )) as Array<{ name: string }>;
    expect(rows[0]?.name).toBe('[REDACTADO]');
  });
});
