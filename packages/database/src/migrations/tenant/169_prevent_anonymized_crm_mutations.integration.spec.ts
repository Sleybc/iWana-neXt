import { randomBytes } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { PreventAnonymizedCrmMutations1690000000000 } from './169_prevent_anonymized_crm_mutations';

const schema = `tenant_privacy_169_${randomBytes(4).toString('hex')}`;
const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = databaseAvailable ? describe : describe.skip;
const safeDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (databaseAvailable && !safeDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 169: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

async function expectPrivacyConflict(operation: () => Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  if (!caught) throw new Error('La mutación debió fallar con el bloqueo de privacidad.');
  const driverError = (caught as { driverError?: { code?: string; hint?: string } }).driverError;
  expect(driverError?.code).toBe('55000');
  expect(driverError?.hint).toBe('PRIVACY_TITULAR_ANONYMIZED');
}

describeWithDb('Migración 169 — bloquear mutaciones sobre titulares anonimizados', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new PreventAnonymizedCrmMutations1690000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    const bootstrap = dataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      await bootstrap.query(`SET search_path TO "${schema}"`);
      await bootstrap.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY,
          anonymized_at timestamptz,
          label text NOT NULL
        )
      `);
      await bootstrap.query(`
        CREATE TABLE expediente_records (
          id uuid PRIMARY KEY,
          anonymized_at timestamptz,
          label text NOT NULL
        )
      `);
      await bootstrap.query(`
        CREATE TABLE contracts (
          id uuid PRIMARY KEY,
          subscriber_id uuid NOT NULL REFERENCES subscribers(id),
          status text NOT NULL,
          status_reason_code text,
          status_changed_at timestamptz,
          updated_at timestamptz NOT NULL,
          alias text NOT NULL
        )
      `);
    } finally {
      await bootstrap.release();
    }
    runner = dataSource.createQueryRunner();
    await runner.query(`SET search_path TO "${schema}"`);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('bloquea UPDATE/DELETE, permite solo archive y soporta up → down → up sin pérdida de datos', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const subscriberId = '00000000-0000-4000-8000-000000000169';
    const expedienteId = '00000000-0000-4000-8000-000000000269';
    const archiveContractId = '00000000-0000-4000-8000-000000000369';
    const unsafeArchiveContractId = '00000000-0000-4000-8000-000000000469';
    await runner.query(`INSERT INTO subscribers (id, label) VALUES ($1, 'before')`, [subscriberId]);
    await runner.query(`INSERT INTO expediente_records (id, label) VALUES ($1, 'before')`, [
      expedienteId,
    ]);
    await runner.query(
      `INSERT INTO contracts (id, subscriber_id, status, updated_at, alias)
       VALUES ($1, $2, 'TERMINATED', '2026-01-01T00:00:00Z', 'kept'),
              ($3, $2, 'TERMINATED', '2026-01-01T00:00:00Z', 'protected')`,
      [archiveContractId, subscriberId, unsafeArchiveContractId],
    );

    await migration.up(runner);
    await runner.query(`UPDATE subscribers SET anonymized_at = now() WHERE id = $1`, [
      subscriberId,
    ]);
    await runner.query(`UPDATE expediente_records SET anonymized_at = now() WHERE id = $1`, [
      expedienteId,
    ]);

    await expectPrivacyConflict(() =>
      runner!.query(`UPDATE subscribers SET label = 'changed' WHERE id = $1`, [subscriberId]),
    );
    await expectPrivacyConflict(() =>
      runner!.query(`DELETE FROM subscribers WHERE id = $1`, [subscriberId]),
    );
    await expectPrivacyConflict(() =>
      runner!.query(`UPDATE expediente_records SET label = 'changed' WHERE id = $1`, [
        expedienteId,
      ]),
    );
    await expectPrivacyConflict(() =>
      runner!.query(`DELETE FROM expediente_records WHERE id = $1`, [expedienteId]),
    );
    await expectPrivacyConflict(() =>
      runner!.query(`UPDATE contracts SET alias = 'changed' WHERE id = $1`, [archiveContractId]),
    );
    await expectPrivacyConflict(() =>
      runner!.query(`DELETE FROM contracts WHERE id = $1`, [archiveContractId]),
    );

    await runner.query(
      `UPDATE contracts
          SET status = 'ARCHIVED', status_reason_code = 'PRIVACY_CLOSED',
              status_changed_at = '2026-11-01T12:00:00Z', updated_at = '2026-11-01T12:00:00Z'
        WHERE id = $1`,
      [archiveContractId],
    );
    const archived = (await runner.query(
      `SELECT status, status_reason_code, status_changed_at, updated_at, alias
         FROM contracts WHERE id = $1`,
      [archiveContractId],
    )) as Array<{
      status: string;
      status_reason_code: string;
      status_changed_at: Date;
      updated_at: Date;
      alias: string;
    }>;
    expect(archived[0]).toMatchObject({
      status: 'ARCHIVED',
      status_reason_code: 'PRIVACY_CLOSED',
      alias: 'kept',
    });
    await expectPrivacyConflict(() =>
      runner!.query(
        `UPDATE contracts
            SET status = 'ARCHIVED', alias = 'changed'
          WHERE id = $1`,
        [unsafeArchiveContractId],
      ),
    );

    const settingName = ['iwana', 'titular_erasure'].join('.');
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config($1, 'on', true)`, [settingName]);
      await runner.query(`UPDATE subscribers SET label = 'erased' WHERE id = $1`, [subscriberId]);
      await runner.query(`UPDATE expediente_records SET label = 'erased' WHERE id = $1`, [
        expedienteId,
      ]);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }

    await migration.down(runner);
    const preserved = (await runner.query(
      `SELECT (SELECT COUNT(*)::int FROM subscribers) AS subscribers,
              (SELECT COUNT(*)::int FROM expediente_records) AS expedientes,
              (SELECT COUNT(*)::int FROM contracts) AS contracts`,
    )) as Array<{ subscribers: number; expedientes: number; contracts: number }>;
    expect(preserved[0]).toEqual({ subscribers: 1, expedientes: 1, contracts: 2 });

    await migration.up(runner);
    await expectPrivacyConflict(() =>
      runner!.query(`UPDATE subscribers SET label = 'changed-after-reinstall' WHERE id = $1`, [
        subscriberId,
      ]),
    );
    const labels = (await runner.query(`SELECT label FROM subscribers WHERE id = $1`, [
      subscriberId,
    ])) as Array<{ label: string }>;
    expect(labels[0]?.label).toBe('erased');
  });
});
