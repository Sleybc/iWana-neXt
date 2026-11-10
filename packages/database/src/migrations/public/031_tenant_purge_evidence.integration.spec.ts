import { randomBytes, randomUUID } from 'crypto';
import { Pool } from 'pg';
import { DataSource, type QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TenantPurgeEvidence1784419219000 } from './031_tenant_purge_evidence';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const database = process.env['DB_NAME'] ?? '';
const host = process.env['DB_HOST'] ?? 'localhost';
const port = Number(process.env['DB_PORT']);
const hash = 'a'.repeat(64);

if (dbAvailable && (database !== 'test' || !Number.isInteger(port) || port < 1)) {
  throw new Error('Integración 031 exige DB_NAME=test y DB_PORT explícito.');
}

const RECORD = 'SELECT public.iwana_record_tenant_purge_evidence($1, $2, $3, $4, $5)';
const REVOKE = 'SELECT public.iwana_revoke_tenant_purge_evidence($1, $2, $3)';
const PURGE = 'SELECT public.iwana_purge_tenant_schema($1, 30) AS outcome';

describeWithDb('Migración 031 — constancia obligatoria para purgar (PostgreSQL real)', () => {
  let bootstrap: Pool;
  let migrator: Pool;
  let app: Pool;
  let purger: Pool;
  let dataSource: DataSource;
  const created: { id: string; schemaName: string }[] = [];

  beforeAll(async () => {
    const bootstrapUser = process.env['DB_BOOTSTRAP_USER'];
    const bootstrapPassword = process.env['DB_BOOTSTRAP_PASSWORD'];
    if (!bootstrapUser || !bootstrapPassword || !process.env['DB_PURGER_USER']) {
      throw new Error('Integración 031 exige roles reales DB_BOOTSTRAP_* y DB_PURGER_*.');
    }
    const migratorCredentials = resolveMigrationDbCredentials();
    const connection = { host, port, database };
    bootstrap = new Pool({ ...connection, user: bootstrapUser, password: bootstrapPassword });
    migrator = new Pool({
      ...connection,
      user: migratorCredentials.username,
      password: migratorCredentials.password,
    });
    app = new Pool({
      ...connection,
      user: process.env['DB_USER'],
      password: process.env['DB_PASSWORD'],
    });
    purger = new Pool({
      ...connection,
      user: process.env['DB_PURGER_USER'],
      password: process.env['DB_PURGER_PASSWORD'],
    });
    dataSource = new DataSource({ type: 'postgres', ...connection, ...migratorCredentials });
    await dataSource.initialize();
  });

  afterEach(async () => {
    for (const { id, schemaName } of created.splice(0)) {
      await bootstrap.query('DELETE FROM public.tenant_purge_evidence WHERE tenant_id = $1', [id]);
      await migrator.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await migrator.query('DELETE FROM public.tenants WHERE id = $1 AND schema_name = $2', [
        id,
        schemaName,
      ]);
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await Promise.all([bootstrap?.end(), migrator?.end(), app?.end(), purger?.end()]);
  });

  async function createMarkedTenant() {
    const schemaName = `tenant_d2_${randomBytes(6).toString('hex')}`;
    const id = randomUUID();
    created.push({ id, schemaName });
    await migrator.query(`CREATE SCHEMA "${schemaName}"`);
    await migrator.query(`CREATE TABLE "${schemaName}".must_survive (id integer)`);
    const { rows } = await migrator.query<{ deleted_at: string }>(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, deleted_at)
       VALUES ($1, 'D2 prueba', $2, $3, 'MARKED_FOR_DELETION', 'd2@invalid.test',
               pg_catalog.now() - interval '50 days') RETURNING deleted_at::text`,
      [id, schemaName.replaceAll('_', '-'), schemaName],
    );
    const deletedAt = rows[0]?.deleted_at;
    if (!deletedAt) throw new Error('La baja sintética no devolvió su fecha.');
    return { id, schemaName, deletedAt, reference: randomUUID() };
  }

  async function candidates(): Promise<string[]> {
    const { rows } = await purger.query<{ id: string }>(
      'SELECT id FROM public.iwana_list_purge_candidates(30, 100) AS id',
    );
    return rows.map(({ id }) => id);
  }

  async function assertEvidenceRequired(tenant: { id: string; schemaName: string }) {
    expect(await candidates()).not.toContain(tenant.id);
    await expect(purger.query(PURGE, [tenant.id])).rejects.toMatchObject({
      code: 'P0001',
      message: 'TENANT_PURGE_EVIDENCE_REQUIRED',
    });
    expect(
      (
        await migrator.query('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1', [
          tenant.schemaName,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (await migrator.query('SELECT 1 FROM public.tenants WHERE id = $1', [tenant.id])).rowCount,
    ).toBe(1);
    const audit = await migrator.query(
      `SELECT 1 FROM public.platform_audit_logs WHERE entity_id = $1
        AND action IN ('TENANT_PURGE_STARTED', 'TENANT_PURGE_COMPLETED')`,
      [tenant.id],
    );
    expect(audit.rowCount).toBe(0);
  }

  it('excluye una baja sin constancia y bloquea la invocación directa sin tocar esquema ni fila', async () => {
    await assertEvidenceRequired(await createMarkedTenant());
  });

  it.each(['DATA_RETURN_DELIVERED', 'ISP_WRITTEN_INSTRUCTION'])(
    'acepta %s, purga y preserva la referencia y constancia',
    async (kind) => {
      const { id, schemaName, deletedAt, reference } = await createMarkedTenant();
      await bootstrap.query(RECORD, [id, deletedAt, kind, reference, hash.toUpperCase()]);
      expect(await candidates()).toContain(id);
      expect((await purger.query(PURGE, [id])).rows).toEqual([{ outcome: 'PURGED' }]);
      expect(
        (await migrator.query('SELECT 1 FROM public.tenants WHERE id = $1', [id])).rowCount,
      ).toBe(0);
      expect(
        (
          await migrator.query('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1', [
            schemaName,
          ])
        ).rowCount,
      ).toBe(0);
      const evidence = await bootstrap.query(
        `SELECT kind, evidence_reference, evidence_sha256, revoked_at
           FROM public.tenant_purge_evidence WHERE tenant_id = $1 AND deleted_at = $2`,
        [id, deletedAt],
      );
      expect(evidence.rows).toEqual([
        { kind, evidence_reference: reference, evidence_sha256: hash, revoked_at: null },
      ]);
      const audit = await migrator.query(
        `SELECT action, new_value->>'evidenceReference' AS reference FROM public.platform_audit_logs
          WHERE entity_id = $1 ORDER BY action`,
        [id],
      );
      expect(audit.rows).toEqual([
        { action: 'TENANT_PURGE_COMPLETED', reference },
        { action: 'TENANT_PURGE_EVIDENCE_RECORDED', reference },
        { action: 'TENANT_PURGE_STARTED', reference },
      ]);
    },
  );

  it('excluye la constancia de una baja anterior después de reactivar y volver a marcar', async () => {
    const tenant = await createMarkedTenant();
    const { id, deletedAt, reference } = tenant;
    await bootstrap.query(RECORD, [id, deletedAt, 'ISP_WRITTEN_INSTRUCTION', reference, hash]);
    await migrator.query(
      `UPDATE public.tenants SET status = 'ACTIVE', deleted_at = NULL WHERE id = $1`,
      [id],
    );
    await migrator.query(
      `UPDATE public.tenants SET status = 'MARKED_FOR_DELETION',
         deleted_at = pg_catalog.now() - interval '45 days' WHERE id = $1`,
      [id],
    );
    await expect(
      bootstrap.query(RECORD, [id, deletedAt, 'ISP_WRITTEN_INSTRUCTION', randomUUID(), hash]),
    ).rejects.toMatchObject({ message: 'TENANT_PURGE_EVIDENCE_INVALID_TARGET' });
    await assertEvidenceRequired(tenant);
  });

  it('rechaza registro y revocación con el lock de R7 ocupado (55P03) y repite al liberarlo', async () => {
    const { id, deletedAt, reference } = await createMarkedTenant();
    await bootstrap.query(RECORD, [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, hash]);
    const holder = await bootstrap.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT pg_catalog.pg_advisory_xact_lock(43, pg_catalog.hashtext($1::text))',
        [id],
      );
      await expect(bootstrap.query(REVOKE, [id, deletedAt, reference])).rejects.toMatchObject({
        code: '55P03',
        message: 'TENANT_PURGE_EVIDENCE_BUSY',
      });
      await expect(
        bootstrap.query(RECORD, [id, deletedAt, 'ISP_WRITTEN_INSTRUCTION', randomUUID(), hash]),
      ).rejects.toMatchObject({ code: '55P03', message: 'TENANT_PURGE_EVIDENCE_BUSY' });
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
    }
    await expect(bootstrap.query(REVOKE, [id, deletedAt, reference])).resolves.toBeDefined();
    expect(await candidates()).not.toContain(id);
  });

  it('serializa la revocación con la purga y rechaza una instantánea antigua', async () => {
    const tenant = await createMarkedTenant();
    const { id, deletedAt, reference } = tenant;
    await bootstrap.query(RECORD, [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, hash]);
    const oldSnapshot = await purger.connect();
    const revocation = await bootstrap.connect();
    try {
      await oldSnapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const listed = await oldSnapshot.query(
        'SELECT id FROM public.iwana_list_purge_candidates(30, 100) id',
      );
      expect(listed.rows).toContainEqual({ id });
      await revocation.query('BEGIN');
      await revocation.query(REVOKE, [id, deletedAt, reference]);
      expect((await purger.query(PURGE, [id])).rows).toEqual([{ outcome: 'SKIPPED_LOCKED' }]);
      await revocation.query('COMMIT');
      await expect(oldSnapshot.query(PURGE, [id])).rejects.toMatchObject({
        message: 'TENANT_PURGE_EVIDENCE_ISOLATION',
      });
    } finally {
      await oldSnapshot.query('ROLLBACK');
      await revocation.query('ROLLBACK');
      oldSnapshot.release();
      revocation.release();
    }
    await assertEvidenceRequired(tenant);
    const audit = await migrator.query(
      `SELECT new_value->>'evidenceReference' AS reference FROM public.platform_audit_logs
        WHERE entity_id = $1 AND action = 'TENANT_PURGE_EVIDENCE_REVOKED'`,
      [id],
    );
    expect(audit.rows).toEqual([{ reference }]);
  });

  it('deniega la operación DBA y escrituras directas a los roles de ejecución', async () => {
    const { id, deletedAt, reference } = await createMarkedTenant();
    const args = [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, hash];
    for (const role of [app, purger, migrator]) {
      await expect(role.query(RECORD, args)).rejects.toMatchObject({ code: '42501' });
      await expect(role.query(REVOKE, [id, deletedAt, reference])).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        role.query(
          `INSERT INTO public.tenant_purge_evidence
          (tenant_id, deleted_at, kind, evidence_reference, evidence_sha256) VALUES ($1, $2, $3, $4, $5)`,
          args,
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }
    await bootstrap.query(RECORD, args);
    expect(
      (
        await migrator.query(
          'UPDATE public.tenant_purge_evidence SET revoked_at = now() WHERE tenant_id = $1',
          [id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await migrator.query('DELETE FROM public.tenant_purge_evidence WHERE tenant_id = $1', [id]))
        .rowCount,
    ).toBe(0);
    await expect(migrator.query('TRUNCATE public.tenant_purge_evidence')).rejects.toMatchObject({
      code: '42501',
      message: 'TENANT_PURGE_EVIDENCE_TRUNCATE_FORBIDDEN',
    });
    expect(await candidates()).toContain(id);
  });

  it('rechaza tipo y huella inválidos y evita duplicar una constancia activa', async () => {
    const { id, deletedAt, reference } = await createMarkedTenant();
    await expect(
      bootstrap.query(RECORD, [id, deletedAt, 'OTRO', reference, hash]),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      bootstrap.query(RECORD, [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, 'xyz']),
    ).rejects.toMatchObject({ code: '22023' });
    await bootstrap.query(RECORD, [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, hash]);
    await expect(
      bootstrap.query(RECORD, [id, deletedAt, 'ISP_WRITTEN_INSTRUCTION', randomUUID(), hash]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('down protege constancias existentes; con tabla vacía restaura la guarda 030 y es reaplicable', async () => {
    const { id, deletedAt, reference } = await createMarkedTenant();
    await bootstrap.query(RECORD, [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, hash]);
    const queryRunner = dataSource.createQueryRunner();
    const migration = new TenantPurgeEvidence1784419219000();
    try {
      await queryRunner.startTransaction();
      await expect(migration.down(queryRunner)).rejects.toMatchObject({
        message: 'TENANT_PURGE_EVIDENCE_ROLLBACK_REQUIRES_ARCHIVE',
      });
      await queryRunner.rollbackTransaction();
      await bootstrap.query('DELETE FROM public.tenant_purge_evidence WHERE tenant_id = $1', [id]);
      await queryRunner.startTransaction();
      const ddl = `SELECT pg_get_functiondef('public.iwana_purge_tenant_schema(uuid, integer)'::regprocedure) AS body`;
      const [initial] = (await queryRunner.query(ddl)) as [{ body: string }];
      await migration.down(queryRunner);
      const [reverted] = (await queryRunner.query(ddl)) as [{ body: string }];
      expect(reverted.body).toContain("'pg_catalog.pg_collation'::regclass");
      expect(reverted.body).not.toContain('TENANT_PURGE_EVIDENCE_REQUIRED');
      await migration.up(queryRunner);
      expect(await queryRunner.query(ddl)).toEqual([initial]);
    } finally {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });

  it('down ve la evidencia aunque el nuevo dueño de la tabla carezca de política SELECT', async () => {
    const { id, deletedAt, reference } = await createMarkedTenant();
    await bootstrap.query(RECORD, [id, deletedAt, 'DATA_RETURN_DELIVERED', reference, hash]);
    const session = await bootstrap.connect();
    try {
      await session.query('BEGIN');
      await session.query('GRANT CREATE ON SCHEMA public TO iwana_app');
      await session.query('ALTER TABLE public.tenant_purge_evidence OWNER TO iwana_app');
      await session.query('SET LOCAL ROLE iwana_app');
      expect((await session.query('SELECT 1 FROM public.tenant_purge_evidence')).rowCount).toBe(0);
      const runner = {
        isTransactionActive: true,
        query: (sql: string) => session.query(sql),
      } as unknown as QueryRunner;
      await expect(new TenantPurgeEvidence1784419219000().down(runner)).rejects.toMatchObject({
        message: 'TENANT_PURGE_EVIDENCE_ROLLBACK_REQUIRES_ARCHIVE',
      });
    } finally {
      await session.query('ROLLBACK');
      session.release();
    }
    const evidence = await bootstrap.query(
      'SELECT 1 FROM public.tenant_purge_evidence WHERE tenant_id = $1',
      [id],
    );
    expect(evidence.rowCount).toBe(1);
  });
});
