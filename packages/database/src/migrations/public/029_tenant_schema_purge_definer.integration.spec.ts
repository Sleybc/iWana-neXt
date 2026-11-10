import { randomBytes, randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';

import { resolveMigrationDbCredentials } from '../../db-credentials';

/**
 * Migración pública 029 (R7, ADR-108) contra PostgreSQL real.
 *
 * Cubre la spec 2026-11-09-plat-ops-r7 §5.2 (un caso por motivo de rechazo de la
 * función de purga, concurrencia y carrera con la reactivación) y §5.3 (privilegios de
 * `iwana_purger` e `iwana_app`, y reloj de retención honesto en `public.tenants`).
 *
 * Usa tres conexiones con los roles reales del job: migrator (`DB_MIGRATOR_*`),
 * aplicación (`DB_USER`) y purga (`DB_PURGER_*`). Solo corre contra la base `test`:
 * crea tenants y esquemas sintéticos propios (`tenant_r7x_<hex>…`) y los borra al
 * final. Nunca toca `tenant_iwana`: el caso protegido usa una fila sintética sin
 * esquema y se bloquea si la base ya tiene ese tenant.
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

const DB_NAME = process.env['DB_NAME'] ?? '';
if (dbAvailable && DB_NAME !== 'test') {
  throw new Error(`Integración 029: solo corre contra DB_NAME=test (recibido "${DB_NAME}").`);
}

const suffix = randomBytes(4).toString('hex');
let sequence = 0;
function nextSchemaName(): string {
  sequence += 1;
  return `tenant_r7x_${suffix}_${sequence}`;
}

function pool(user: string, password: string, max = 2): Pool {
  return new Pool({
    host: process.env['DB_HOST'] ?? 'localhost',
    port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
    user,
    password,
    database: DB_NAME,
    max,
  });
}

interface PgError {
  code?: string;
  message?: string;
}

async function errorOf(promise: Promise<unknown>): Promise<PgError> {
  try {
    await promise;
  } catch (error: unknown) {
    return error as PgError;
  }
  throw new Error('Se esperaba un error de PostgreSQL y la sentencia terminó bien.');
}

describeWithDb(
  'Migración pública 029 — purga definer y reloj de retención (PostgreSQL real)',
  () => {
    let migrator: Pool;
    let app: Pool;
    let purger: Pool;
    let bootstrap: Pool;
    const createdSchemas: string[] = [];
    const createdIds: string[] = [];

    async function createTenant(options: {
      status: string;
      deletedDaysAgo?: number | null;
      withSchema?: boolean;
      schemaName?: string;
    }): Promise<{ id: string; schemaName: string }> {
      const schemaName = options.schemaName ?? nextSchemaName();
      if (options.withSchema ?? true) {
        await migrator.query(`CREATE SCHEMA "${schemaName}"`);
        await migrator.query(`CREATE TABLE "${schemaName}".r7_negocio (id int PRIMARY KEY)`);
        createdSchemas.push(schemaName);
      }
      const deleted =
        options.deletedDaysAgo === undefined || options.deletedDaysAgo === null
          ? null
          : options.deletedDaysAgo;
      const { rows } = await migrator.query<{ id: string }>(
        `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email, deleted_at)
       VALUES ('R7 029', $1, $2, $3, 'r7-029@invalid.test',
               CASE WHEN $4::int IS NULL THEN NULL ELSE now() - make_interval(days => $4::int) END)
       RETURNING id::text AS id`,
        [schemaName.replace(/_/g, '-'), schemaName, options.status, deleted],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('No fue posible crear el tenant sintético.');
      createdIds.push(id);
      return { id, schemaName };
    }

    async function purge(client: Pool | PoolClient, id: string, retention: number | null = 30) {
      const { rows } = await client.query<{ outcome: string }>(
        'SELECT public.iwana_purge_tenant_schema($1::uuid, $2::int) AS outcome',
        [id, retention],
      );
      return rows[0]?.outcome;
    }

    async function recordEvidence(id: string): Promise<void> {
      await bootstrap.query(
        `SELECT public.iwana_record_tenant_purge_evidence(
           $1, (SELECT deleted_at FROM public.tenants WHERE id = $1), 'ISP_WRITTEN_INSTRUCTION', $2, $3
         )`,
        [id, randomUUID(), 'b'.repeat(64)],
      );
    }

    async function schemaExists(name: string): Promise<boolean> {
      const { rowCount } = await migrator.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [
        name,
      ]);
      return rowCount === 1;
    }

    async function tenantRow(id: string) {
      const { rows } = await migrator.query<{ status: string; deleted_at: Date | null }>(
        'SELECT status, deleted_at FROM public.tenants WHERE id = $1',
        [id],
      );
      return rows[0];
    }

    beforeAll(() => {
      const purgerUser = process.env['DB_PURGER_USER'];
      const bootstrapUser = process.env['DB_BOOTSTRAP_USER'];
      const bootstrapPassword = process.env['DB_BOOTSTRAP_PASSWORD'];
      if (!bootstrapUser || !bootstrapPassword) {
        throw new Error(
          '[BLOCKED] Integración 029 exige DB_BOOTSTRAP_* para constancias sintéticas.',
        );
      }
      if (!purgerUser) {
        throw new Error(
          '[BLOCKED] Integración 029 exige DB_PURGER_USER/DB_PURGER_PASSWORD (rol iwana_purger, ADR-108).',
        );
      }
      const credentials = resolveMigrationDbCredentials();
      migrator = pool(credentials.username, credentials.password);
      app = pool(process.env['DB_USER'] ?? '', process.env['DB_PASSWORD'] ?? '');
      purger = pool(purgerUser, process.env['DB_PURGER_PASSWORD'] ?? '', 3);
      bootstrap = pool(bootstrapUser, bootstrapPassword);
    });

    afterAll(async () => {
      for (const schema of [...createdSchemas].reverse()) {
        await migrator.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      }
      if (createdIds.length > 0) {
        await bootstrap.query(
          'DELETE FROM public.tenant_purge_evidence WHERE tenant_id = ANY($1::uuid[])',
          [createdIds],
        );
        await migrator
          .query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [createdIds])
          .catch(() => undefined);
      }
      await Promise.all([migrator?.end(), app?.end(), purger?.end(), bootstrap?.end()]);
    });

    describe('§5.2 función de purga', () => {
      it('rechaza un tenant no marcado y no toca nada', async () => {
        const t = await createTenant({ status: 'ACTIVE' });
        const error = await errorOf(purge(purger, t.id));
        expect(error).toMatchObject({ code: 'P0001', message: 'TENANT_PURGE_NOT_MARKED' });
        expect(await schemaExists(t.schemaName)).toBe(true);
        expect(await tenantRow(t.id)).toBeDefined();
      });

      it('impone el piso de 30 días aunque el worker pida menos', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 29 });
        const error = await errorOf(purge(purger, t.id, 1));
        expect(error.message).toBe('TENANT_PURGE_RETENTION_NOT_MET');
        expect(await schemaExists(t.schemaName)).toBe(true);
      });

      it('una retención grande la alarga; nula o negativa resuelve a 30', async () => {
        const long = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 31 });
        await recordEvidence(long.id);
        expect((await errorOf(purge(purger, long.id, 1000))).message).toBe(
          'TENANT_PURGE_RETENTION_NOT_MET',
        );
        expect(await purge(purger, long.id, null)).toBe('PURGED');

        const negative = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 31 });
        await recordEvidence(negative.id);
        expect(await purge(purger, negative.id, -5)).toBe('PURGED');
        expect(await schemaExists(negative.schemaName)).toBe(false);
      });

      it('protege tenant_iwana y lo excluye de los candidatos', async () => {
        const existing = await migrator.query(
          `SELECT 1 FROM public.tenants WHERE schema_name = 'tenant_iwana'`,
        );
        if (existing.rowCount !== 0) {
          throw new Error(
            '[BLOCKED] La base de pruebas ya tiene tenant_iwana; este caso no lo toca.',
          );
        }
        const t = await createTenant({
          status: 'MARKED_FOR_DELETION',
          deletedDaysAgo: 3650,
          withSchema: false,
          schemaName: 'tenant_iwana',
        });
        await recordEvidence(t.id);
        const candidates = await purger.query<{ id: string }>(
          'SELECT id::text AS id FROM public.iwana_list_purge_candidates(30, 100) AS id',
        );
        expect(candidates.rows.map((r) => r.id)).not.toContain(t.id);
        expect((await errorOf(purge(purger, t.id))).message).toBe('TENANT_PURGE_PROTECTED_SCHEMA');
        await migrator.query('DELETE FROM public.tenants WHERE id = $1', [t.id]);
      });

      it('rechaza un esquema cuyo dueño no es el migrator', async () => {
        const schemaName = nextSchemaName();
        // En la base `test`, iwana_app conserva CREATE (H-1) para las suites.
        await app.query(`CREATE SCHEMA "${schemaName}"`);
        createdSchemas.push(schemaName);
        const t = await createTenant({
          status: 'MARKED_FOR_DELETION',
          deletedDaysAgo: 3650,
          withSchema: false,
          schemaName,
        });
        expect((await errorOf(purge(purger, t.id))).message).toBe('TENANT_PURGE_UNEXPECTED_OWNER');
        expect(await schemaExists(schemaName)).toBe(true);
      });

      it('rechaza un nombre de esquema inválido', async () => {
        const t = await createTenant({
          status: 'MARKED_FOR_DELETION',
          deletedDaysAgo: 3650,
          withSchema: false,
          schemaName: `Tenant_R7_${suffix}`,
        });
        expect((await errorOf(purge(purger, t.id))).message).toBe(
          'TENANT_PURGE_INVALID_SCHEMA_NAME',
        );
      });

      it('aborta sin borrar nada si otro esquema depende del que se purga', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        const external = `r7ext_${suffix}`;
        await migrator.query(`CREATE SCHEMA "${external}"`);
        createdSchemas.unshift(external); // se borra después del tenant (orden inverso)
        await migrator.query(
          `CREATE VIEW "${external}".v AS SELECT id FROM "${t.schemaName}".r7_negocio`,
        );
        expect((await errorOf(purge(purger, t.id))).message).toBe(
          'TENANT_PURGE_EXTERNAL_DEPENDENCY',
        );
        expect(await schemaExists(t.schemaName)).toBe(true);
        expect(await tenantRow(t.id)).toBeDefined();
        await migrator.query(`DROP SCHEMA "${external}" CASCADE`);
      });

      it('P2-2: conserva una columna de public que usa la collation del tenant', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        const table = `public.r7_collation_${suffix}`;
        await migrator.query(`CREATE COLLATION "${t.schemaName}".r7_sort FROM pg_catalog."C"`);
        await migrator.query(
          `CREATE TABLE ${table} (id int, label text COLLATE "${t.schemaName}".r7_sort)`,
        );
        try {
          await migrator.query(`INSERT INTO ${table} VALUES (1, 'dato sintético')`);
          expect((await errorOf(purge(purger, t.id))).message).toBe(
            'TENANT_PURGE_EXTERNAL_DEPENDENCY',
          );
          expect(await schemaExists(t.schemaName)).toBe(true);
          expect(await tenantRow(t.id)).toBeDefined();
          expect((await migrator.query(`SELECT label FROM ${table}`)).rows).toEqual([
            { label: 'dato sintético' },
          ]);
          const audit = await migrator.query(
            `SELECT 1 FROM public.platform_audit_logs
              WHERE entity_id = $1 AND action IN ('TENANT_PURGE_STARTED', 'TENANT_PURGE_COMPLETED')`,
            [t.id],
          );
          expect(audit.rowCount).toBe(0);
        } finally {
          await migrator.query(`DROP TABLE ${table}`);
        }
      });

      it('P2-2: conserva la extensión de public que tiene un miembro en el tenant', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        await recordEvidence(t.id);
        const member = `"${t.schemaName}".r7_extension_member()`;
        await migrator.query('CREATE EXTENSION hstore WITH SCHEMA public');
        try {
          await migrator.query(`CREATE FUNCTION ${member} RETURNS int LANGUAGE sql AS 'SELECT 1'`);
          await migrator.query(`ALTER EXTENSION hstore ADD FUNCTION ${member}`);

          expect((await errorOf(purge(purger, t.id))).message).toBe(
            'TENANT_PURGE_EXTERNAL_DEPENDENCY',
          );
          expect(await tenantRow(t.id)).toBeDefined();
          const { rows } = await migrator.query(`
            SELECT to_regtype('public.hstore') IS NOT NULL AS extension_preserved,
                   ${member} AS member_result
          `);
          expect(rows).toEqual([{ extension_preserved: true, member_result: 1 }]);
        } finally {
          await migrator.query('DROP EXTENSION IF EXISTS hstore');
        }
      });

      it('P2-2: permite la purga si la collation solo se usa dentro del tenant', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        await recordEvidence(t.id);
        await migrator.query(`CREATE COLLATION "${t.schemaName}".r7_sort FROM pg_catalog."C"`);
        await migrator.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA "${t.schemaName}" GRANT SELECT ON TABLES TO iwana_app`,
        );
        await migrator.query(
          `ALTER TABLE "${t.schemaName}".r7_negocio
             ADD COLUMN label text COLLATE "${t.schemaName}".r7_sort`,
        );

        expect(await purge(purger, t.id)).toBe('PURGED');
        expect(await schemaExists(t.schemaName)).toBe(false);
        expect(await tenantRow(t.id)).toBeUndefined();
      });

      it('purga una fila elegible sin esquema y audita con el actor de la sesión', async () => {
        const t = await createTenant({
          status: 'MARKED_FOR_DELETION',
          deletedDaysAgo: 3650,
          withSchema: false,
        });
        await recordEvidence(t.id);
        expect(await purge(purger, t.id)).toBe('PURGED');
        expect(await tenantRow(t.id)).toBeUndefined();
        const audit = await migrator.query<{ action: string; actor: string }>(
          `SELECT action, new_value->>'actor' AS actor FROM public.platform_audit_logs
          WHERE entity_type = 'Tenant' AND entity_id = $1 ORDER BY action`,
          [t.id],
        );
        expect(audit.rows).toEqual([
          { action: 'TENANT_PURGE_COMPLETED', actor: process.env['DB_PURGER_USER'] },
          { action: 'TENANT_PURGE_EVIDENCE_RECORDED', actor: process.env['DB_BOOTSTRAP_USER'] },
          { action: 'TENANT_PURGE_STARTED', actor: process.env['DB_PURGER_USER'] },
        ]);
      });

      it('devuelve SKIPPED_GONE para una fila inexistente', async () => {
        expect(await purge(purger, '00000000-0000-4000-8000-000000000000')).toBe('SKIPPED_GONE');
      });

      it('dos purgas concurrentes del mismo tenant: una purga, la otra se omite', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        await recordEvidence(t.id);
        const first = await purger.connect();
        const second = await purger.connect();
        try {
          await first.query('BEGIN');
          expect(await purge(first, t.id)).toBe('PURGED');
          expect(await purge(second, t.id)).toBe('SKIPPED_LOCKED');
          await first.query('COMMIT');
          expect(await purge(second, t.id)).toBe('SKIPPED_GONE');
        } finally {
          first.release();
          second.release();
        }
        const completed = await migrator.query(
          `SELECT 1 FROM public.platform_audit_logs
          WHERE entity_id = $1 AND action = 'TENANT_PURGE_COMPLETED'`,
          [t.id],
        );
        expect(completed.rowCount).toBe(1);
      });

      it('con la fila bloqueada por una reactivación, la purga se omite y el esquema queda', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        const reactivation = await app.connect();
        try {
          await reactivation.query('BEGIN');
          await reactivation.query(
            `UPDATE public.tenants SET status = 'ACTIVE', deleted_at = NULL WHERE id = $1`,
            [t.id],
          );
          expect(await purge(purger, t.id)).toBe('SKIPPED_LOCKED');
          await reactivation.query('COMMIT');
        } finally {
          reactivation.release();
        }
        expect(await schemaExists(t.schemaName)).toBe(true);
        expect((await tenantRow(t.id))?.status).toBe('ACTIVE');
      });

      it('con la purga en curso, la reactivación espera y nunca queda ACTIVE sin esquema', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        await recordEvidence(t.id);
        const purging = await purger.connect();
        const reactivation = await app.connect();
        try {
          await purging.query('BEGIN');
          expect(await purge(purging, t.id)).toBe('PURGED');
          await reactivation.query(`SET lock_timeout = '300ms'`);
          const blocked = await errorOf(
            reactivation.query(
              `UPDATE public.tenants SET status = 'ACTIVE', deleted_at = NULL WHERE id = $1`,
              [t.id],
            ),
          );
          expect(blocked.code).toBe('55P03');
          await purging.query('COMMIT');
        } finally {
          await reactivation.query('RESET lock_timeout').catch(() => undefined);
          purging.release();
          reactivation.release();
        }
        expect(await tenantRow(t.id)).toBeUndefined();
        expect(await schemaExists(t.schemaName)).toBe(false);
      });
    });

    describe('§5.3 privilegios', () => {
      it('iwana_app no puede ejecutar las funciones de purga', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        expect((await errorOf(purge(app, t.id))).code).toBe('42501');
        expect(
          (await errorOf(app.query('SELECT * FROM public.iwana_list_purge_candidates(30, 1)')))
            .code,
        ).toBe('42501');
        expect(await schemaExists(t.schemaName)).toBe(true);
      });

      it('iwana_purger no tiene privilegios fuera de las dos funciones', async () => {
        const t = await createTenant({ status: 'ACTIVE' });
        const denied = [
          `DROP SCHEMA "${t.schemaName}" CASCADE`,
          'SELECT id FROM public.tenants LIMIT 1',
          `UPDATE public.tenants SET status = 'ACTIVE' WHERE id = '${t.id}'`,
          `DELETE FROM public.tenants WHERE id = '${t.id}'`,
          `INSERT INTO public.platform_audit_logs (action, entity_type, entity_id) VALUES ('X', 'Tenant', 'x')`,
          `SELECT id FROM "${t.schemaName}".r7_negocio`,
          'CREATE TEMP TABLE r7_shadow (id int)',
          `CREATE SCHEMA r7_purger_${suffix}`,
        ];
        for (const sql of denied) {
          const error = await errorOf(purger.query(sql));
          expect({ sql, code: error.code }).toEqual({ sql, code: '42501' });
        }
        expect(await schemaExists(t.schemaName)).toBe(true);
      });

      it('iwana_purger sin atributos elevados y sin membresías entre roles de aplicación', async () => {
        const role = await migrator.query<Record<string, boolean>>(
          `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolinherit
           FROM pg_roles WHERE rolname = $1`,
          [process.env['DB_PURGER_USER']],
        );
        expect(role.rows[0]).toEqual({
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolbypassrls: false,
          rolinherit: false,
        });
        const members = await migrator.query(
          `SELECT 1 FROM pg_auth_members a
           JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
          WHERE r.rolname IN ('iwana_app', 'iwana_migrator', 'iwana_purger')
            AND m.rolname IN ('iwana_app', 'iwana_migrator', 'iwana_purger')`,
        );
        expect(members.rowCount).toBe(0);
      });

      it('iwana_app no puede asumir el rol del migrator', async () => {
        expect((await errorOf(app.query('SET ROLE iwana_migrator'))).code).toBe('42501');
      });
    });

    describe('§5.3 reloj de retención honesto', () => {
      async function clockAudit(id: string) {
        const { rows } = await migrator.query<{ action: string; actor: string }>(
          `SELECT action, new_value->>'actor' AS actor FROM public.platform_audit_logs
          WHERE entity_id = $1 AND action LIKE 'TENANT_DELETION_CLOCK_%' ORDER BY created_at`,
          [id],
        );
        return rows;
      }

      function ageSeconds(date: Date | null | undefined): number {
        if (!date) throw new Error('deleted_at nulo');
        return Math.abs(Date.now() - date.getTime()) / 1000;
      }

      it('iwana_app no puede fechar la marca en el pasado al marcar', async () => {
        const t = await createTenant({ status: 'ACTIVE' });
        await app.query(
          `UPDATE public.tenants
            SET status = 'MARKED_FOR_DELETION', deleted_at = now() - INTERVAL '400 days'
          WHERE id = $1`,
          [t.id],
        );
        expect(ageSeconds((await tenantRow(t.id))?.deleted_at)).toBeLessThan(120);
        expect(await clockAudit(t.id)).toEqual([
          { action: 'TENANT_DELETION_CLOCK_COERCED', actor: process.env['DB_USER'] },
        ]);
      });

      it('marcar una fila que conservaba un deleted_at antiguo reinicia el reloj', async () => {
        const t = await createTenant({ status: 'INACTIVE', deletedDaysAgo: 400 });
        await app.query(`UPDATE public.tenants SET status = 'MARKED_FOR_DELETION' WHERE id = $1`, [
          t.id,
        ]);
        expect(ageSeconds((await tenantRow(t.id))?.deleted_at)).toBeLessThan(120);
        // La fecha antigua que viajaba en la fila es una marca en el pasado: coerción.
        expect((await clockAudit(t.id)).map((r) => r.action)).toEqual([
          'TENANT_DELETION_CLOCK_COERCED',
        ]);
      });

      it('un alta de iwana_app con deleted_at en el pasado queda en now()', async () => {
        const schemaName = nextSchemaName();
        const { rows } = await app.query<{ id: string }>(
          `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email, deleted_at)
         VALUES ('R7 029 app', $1, $2, 'MARKED_FOR_DELETION', 'r7-029@invalid.test',
                 now() - INTERVAL '400 days')
         RETURNING id::text AS id`,
          [schemaName.replace(/_/g, '-'), schemaName],
        );
        const id = rows[0]!.id;
        createdIds.push(id);
        expect(ageSeconds((await tenantRow(id))?.deleted_at)).toBeLessThan(120);
      });

      it('volver a guardar el mismo instante con precisión de milisegundos no reinicia el reloj', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 10 });
        const before = (await tenantRow(t.id))?.deleted_at;
        // Date de JS: milisegundos; PostgreSQL guarda microsegundos.
        await app.query('UPDATE public.tenants SET deleted_at = $2 WHERE id = $1', [t.id, before]);
        const after = (await tenantRow(t.id))?.deleted_at;
        expect(after?.getTime()).toBe(before?.getTime());
        expect(await clockAudit(t.id)).toEqual([]);
      });

      it('la reactivación (deleted_at a NULL) sigue permitida', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 10 });
        await app.query(
          `UPDATE public.tenants SET status = 'ACTIVE', deleted_at = NULL WHERE id = $1`,
          [t.id],
        );
        expect(await tenantRow(t.id)).toEqual({ status: 'ACTIVE', deleted_at: null });
      });

      it('iwana_app no puede cambiar schema_name ni id', async () => {
        const t = await createTenant({ status: 'MARKED_FOR_DELETION', deletedDaysAgo: 3650 });
        const victim = await createTenant({ status: 'ACTIVE' });
        expect(
          (
            await errorOf(
              app.query('UPDATE public.tenants SET schema_name = $2 WHERE id = $1', [
                t.id,
                `${victim.schemaName}_x`,
              ]),
            )
          ).message,
        ).toBe('TENANT_IDENTITY_IMMUTABLE');
        expect(
          (
            await errorOf(
              app.query('UPDATE public.tenants SET id = gen_random_uuid() WHERE id = $1', [t.id]),
            )
          ).message,
        ).toBe('TENANT_IDENTITY_IMMUTABLE');
      });

      it('iwana_app no puede recrear la fila de otro tenant apuntando a su esquema', async () => {
        const victim = await createTenant({ status: 'ACTIVE' });
        const client = await app.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM public.tenants WHERE id = $1', [victim.id]);
          const error = await errorOf(
            client.query(
              `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email, deleted_at)
             VALUES ('R7 victima', $1, $2, 'MARKED_FOR_DELETION', 'r7@invalid.test',
                     now() - INTERVAL '400 days')`,
              [`${victim.schemaName.replace(/_/g, '-')}-x`, victim.schemaName],
            ),
          );
          expect(error.message).toBe('TENANT_SCHEMA_ALREADY_EXISTS');
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
        expect((await tenantRow(victim.id))?.status).toBe('ACTIVE');
      });
    });
  },
);
