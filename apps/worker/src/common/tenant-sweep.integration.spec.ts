/**
 * Barridos multiempresa contra PostgreSQL real (bloque B(a), causa raíz de los fallidos de
 * octubre en `schedule-events-sweep` y `evidence-orphan-detection`).
 *
 * - Una empresa ACTIVE con el schema incompleto (sin `schedule_events` ni
 *   `execution_order_evidence`) no detiene el barrido de las demás, y el motivo que BullMQ
 *   guarda (`failedReason`, tras `@SanitizeFailedReason`) nombra esa empresa por su id.
 * - Una empresa retirada (`deleted_at`) no entra en el barrido aunque siga en `ACTIVE`.
 *
 * El barrido recorre todas las empresas de la base: solo corre con `DB_NAME=test`.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker exec jest \
 *     --config jest.integration.config.js tenant-sweep
 */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { ExpiredScheduleEventsProcessor } from '../processors/expired-schedule-events.processor';
import { EvidenceOrphanDetectionProcessor } from '../processors/evidence-orphan-detection.processor';
import { ephemeralSchemaName } from '../../../../packages/database/test/ephemeral-schema';

const { loadWorkspaceEnv } = require('../../../../packages/database/test/integration-db-probe');

loadWorkspaceEnv();

const available = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithInfra = available ? describe : describe.skip;

describeWithInfra('Barridos multiempresa — PostgreSQL real', () => {
  const sana = { id: randomUUID(), schema: ephemeralSchemaName('tenant_sweep_ok_') };
  const incompleta = { id: randomUUID(), schema: ephemeralSchemaName('tenant_sweep_ko_') };
  const retirada = { id: randomUUID(), schema: ephemeralSchemaName('tenant_sweep_del_') };
  const eventId = { sana: randomUUID(), retirada: randomUUID() };
  const evidenceId = { sana: randomUUID(), retirada: randomUUID() };
  let pool: Pool;
  let config: { get: <T>(key: string, fallback?: T) => T };

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'test') {
      throw new Error('[BLOCKED] El barrido recorre toda la base: solo corre con DB_NAME=test.');
    }
    const migrator = resolveMigrationDbCredentials();
    pool = new Pool({
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      user: migrator.username,
      password: migrator.password,
      database: 'test',
      // Una conexión la toma la reconciliación de evidencias; la otra, las lecturas de control.
      max: 2,
    });
    // Los procesadores abren su propio pool con estas credenciales (dueño de los schemas).
    const overrides: Record<string, unknown> = {
      DB_USER: migrator.username,
      DB_PASSWORD: migrator.password,
      DB_NAME: 'test',
      DB_PORT: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
    };
    config = {
      get: <T>(key: string, fallback?: T): T =>
        (overrides[key] ?? process.env[key] ?? fallback) as T,
    };

    for (const tenant of [sana, incompleta, retirada]) {
      await pool.query(`CREATE SCHEMA "${tenant.schema}"`);
      await pool.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, deleted_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'barrido@example.test', $5)`,
        [
          tenant.id,
          `Barrido ${tenant.schema}`,
          tenant.schema.replace(/_/gu, '-'),
          tenant.schema,
          tenant === retirada ? new Date() : null,
        ],
      );
    }
    // La sana y la retirada tienen el schema mínimo que leen los dos barridos; la incompleta,
    // ninguna tabla (como un schema a medio migrar).
    for (const tenant of [sana, retirada]) {
      const key = tenant === sana ? 'sana' : 'retirada';
      await pool.query(`
        CREATE TABLE "${tenant.schema}".schedule_events (
          id uuid PRIMARY KEY, status text NOT NULL, scheduled_end_at timestamptz NOT NULL,
          deleted_at timestamptz, updated_at timestamptz)`);
      await pool.query(
        `INSERT INTO "${tenant.schema}".schedule_events VALUES ($1, 'SCHEDULED', now() - interval '2 days', NULL, NULL)`,
        [eventId[key]],
      );
      await pool.query(`
        CREATE TABLE "${tenant.schema}".execution_order_evidence (
          id uuid PRIMARY KEY, media_asset_id uuid, execution_order_id uuid NOT NULL,
          asset_status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      // Asset inexistente en public.media_assets: la reconciliación lo deja EXPIRED.
      await pool.query(
        `INSERT INTO "${tenant.schema}".execution_order_evidence
           (id, media_asset_id, execution_order_id, asset_status)
         VALUES ($1, $2, $3, 'CLAIM_FAILED')`,
        [evidenceId[key], randomUUID(), randomUUID()],
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    for (const tenant of [sana, incompleta, retirada]) {
      await pool.query(`DROP SCHEMA IF EXISTS "${tenant.schema}" CASCADE`).catch(() => undefined);
      await pool
        .query('DELETE FROM public.tenants WHERE id = $1', [tenant.id])
        .catch(() => undefined);
    }
    await pool.end();
  });

  async function status(schema: string, table: string, column: string, id: string) {
    const rows = await pool.query<{ value: string }>(
      `SELECT ${column} AS value FROM "${schema}".${table} WHERE id = $1`,
      [id],
    );
    return rows.rows[0]?.value;
  }

  it('revisión de la agenda: el schema incompleto no frena a las demás, el motivo lo nombra y la retirada no entra', async () => {
    const processor = new ExpiredScheduleEventsProcessor(config as never, {} as never);
    try {
      const thrown = await processor.process({} as never).catch((error: unknown) => error);

      expect(await status(sana.schema, 'schedule_events', 'status', eventId.sana)).toBe('EXPIRED');
      expect(await status(retirada.schema, 'schedule_events', 'status', eventId.retirada)).toBe(
        'SCHEDULED',
      );
      expect(thrown).toBeInstanceOf(AggregateError);
      const reason = (thrown as Error).message;
      expect(reason).toContain(`tenant=${incompleta.id} (class=DatabaseError sqlstate=42P01)`);
      expect(reason).not.toContain(retirada.id);
      expect(reason).not.toContain(sana.id);
      expect(reason).not.toContain('schedule_events');
    } finally {
      await (processor as unknown as { pool: Pool }).pool.end();
    }
  }, 60_000);

  it('revisión de evidencias: el schema sin la tabla no frena a las demás, el motivo lo nombra y la retirada no entra', async () => {
    const processor = new EvidenceOrphanDetectionProcessor(config as never, {} as never, {
      deleteObject: jest.fn(),
    });
    const client = await pool.connect();
    try {
      const thrown = await (
        processor as unknown as {
          reconcileClaimFailed: (client: unknown, correlationId: string) => Promise<void>;
        }
      )
        .reconcileClaimFailed(client, randomUUID())
        .catch((error: unknown) => error);

      expect(
        await status(sana.schema, 'execution_order_evidence', 'asset_status', evidenceId.sana),
      ).toBe('EXPIRED');
      expect(
        await status(
          retirada.schema,
          'execution_order_evidence',
          'asset_status',
          evidenceId.retirada,
        ),
      ).toBe('CLAIM_FAILED');
      expect(thrown).toBeInstanceOf(AggregateError);
      const reason = (thrown as Error).message;
      expect(reason).toContain(`tenant=${incompleta.id} (class=DatabaseError sqlstate=42P01)`);
      expect(reason).not.toContain(retirada.id);
      expect(reason).not.toContain('execution_order_evidence');
    } finally {
      client.release();
      await (processor as unknown as { pool: Pool }).pool.end();
    }
  }, 60_000);
});
