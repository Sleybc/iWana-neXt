import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { VatServicePoint1440000000000 } from './144_vat_service_point';

const SCHEMA = `tenant_mod05_vat_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

const ids = {
  residentialSubscriber: randomUUID(),
  nonResidentialSubscriber: randomUUID(),
  juridicalResidentialSubscriber: randomUUID(),
  residentialContract: randomUUID(),
  nonResidentialContract: randomUUID(),
  juridicalContract: randomUUID(),
  orphanContract: randomUUID(),
  planItem: randomUUID(),
  productItem: randomUUID(),
  serviceItem: randomUUID(),
  planDetail: randomUUID(),
};

describeWithDb('Migración 144 — IVA por punto de servicio en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new VatServicePoint1440000000000();

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
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
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
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    await runner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY,
        person_type varchar(20) NOT NULL,
        customer_segment varchar(30) NOT NULL,
        stratum integer NULL
      )
    `);
    await runner.query(`
      CREATE TABLE contracts (
        id uuid PRIMARY KEY,
        subscriber_id uuid NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE catalog_items (
        id uuid PRIMARY KEY,
        type varchar(20) NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE plan_details (
        id uuid PRIMARY KEY,
        item_id uuid NOT NULL
      )
    `);

    await runner.query(
      `INSERT INTO subscribers (id, person_type, customer_segment, stratum)
       VALUES ($1, 'NATURAL', 'RESIDENTIAL', 2),
              ($2, 'NATURAL', 'SOHO', 4),
              ($3, 'JURIDICA', 'RESIDENTIAL', NULL)`,
      [ids.residentialSubscriber, ids.nonResidentialSubscriber, ids.juridicalResidentialSubscriber],
    );
    await runner.query(
      `INSERT INTO contracts (id, subscriber_id)
       VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        ids.residentialContract,
        ids.residentialSubscriber,
        ids.nonResidentialContract,
        ids.nonResidentialSubscriber,
        ids.juridicalContract,
        ids.juridicalResidentialSubscriber,
        ids.orphanContract,
        randomUUID(),
      ],
    );
    await runner.query(
      `INSERT INTO catalog_items (id, type)
       VALUES ($1, 'PLAN'), ($2, 'PRODUCT'), ($3, 'SERVICE')`,
      [ids.planItem, ids.productItem, ids.serviceItem],
    );
    await runner.query(`INSERT INTO plan_details (id, item_id) VALUES ($1, $2)`, [
      ids.planDetail,
      ids.planItem,
    ]);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        try {
          if (runner.isTransactionActive) {
            await runner.rollbackTransaction();
          }
        } finally {
          await runner.release();
        }
      }
    } finally {
      if (dataSource?.isInitialized) {
        try {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await dataSource.destroy();
        }
      }
    }
  });

  it('reporta el preflight y conserva las reglas en el ciclo up/down/up', async () => {
    if (!runner) {
      throw new Error('QueryRunner de integración no inicializado.');
    }
    const activeRunner = runner;

    const expectRejectedWrite = async (write: () => Promise<unknown>): Promise<void> => {
      await activeRunner.query('SAVEPOINT expected_constraint_violation');
      try {
        await expect(write()).rejects.toThrow();
      } finally {
        await activeRunner.query('ROLLBACK TO SAVEPOINT expected_constraint_violation');
        await activeRunner.query('RELEASE SAVEPOINT expected_constraint_violation');
      }
    };

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await migration.up(runner);

      const residential = (await runner.query(
        `SELECT service_usage, installation_stratum, stratum_evidence_media_id, vat_snapshot
           FROM contracts WHERE id = $1`,
        [ids.residentialContract],
      )) as Array<{
        service_usage: string;
        installation_stratum: number;
        stratum_evidence_media_id: string | null;
        vat_snapshot: unknown;
      }>;
      expect(residential[0]).toEqual({
        service_usage: 'RESIDENTIAL',
        installation_stratum: 2,
        stratum_evidence_media_id: null,
        vat_snapshot: null,
      });

      for (const contractId of [
        ids.nonResidentialContract,
        ids.juridicalContract,
        ids.orphanContract,
      ]) {
        const row = (await runner.query(
          `SELECT service_usage, installation_stratum, stratum_evidence_media_id, vat_snapshot
             FROM contracts WHERE id = $1`,
          [contractId],
        )) as Array<{
          service_usage: string;
          installation_stratum: number | null;
          stratum_evidence_media_id: string | null;
          vat_snapshot: unknown;
        }>;
        expect(row[0]).toEqual({
          service_usage: 'NON_RESIDENTIAL',
          installation_stratum: null,
          stratum_evidence_media_id: null,
          vat_snapshot: null,
        });
      }

      const concepts = (await runner.query(
        `SELECT id, vat_concept FROM catalog_items ORDER BY id`,
      )) as Array<{ id: string; vat_concept: string | null }>;
      expect(concepts).toContainEqual({ id: ids.planItem, vat_concept: 'INTERNET_ACCESS' });
      expect(concepts).toContainEqual({ id: ids.productItem, vat_concept: null });
      expect(concepts).toContainEqual({ id: ids.serviceItem, vat_concept: null });

      const planNetwork = (await runner.query(
        `SELECT network_type FROM plan_details WHERE id = $1`,
        [ids.planDetail],
      )) as Array<{ network_type: string }>;
      expect(planNetwork).toEqual([{ network_type: 'FIXED' }]);

      const firstRunReport = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(firstRunReport).toContain(
        'RESIDENTIAL=1; estrato copiable=1; RESIDENTIAL sin estrato=0',
      );
      expect(firstRunReport).toContain('NON_RESIDENTIAL por otra regla=3; total=4');
      expect(firstRunReport).toContain(
        'Ítems sin concepto fiscal (requieren clasificación del operador): PRODUCT=1; SERVICE=1',
      );

      await expectRejectedWrite(() =>
        activeRunner.query(`UPDATE plan_details SET network_type = 'SATELLITE' WHERE id = $1`, [
          ids.planDetail,
        ]),
      );
      await expectRejectedWrite(() =>
        activeRunner.query(
          `UPDATE contracts SET service_usage = 'RESIDENTIAL', installation_stratum = NULL WHERE id = $1`,
          [ids.orphanContract],
        ),
      );

      await migration.down(runner);
      const removedColumns = await runner.query(
        `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND column_name IN (
            'service_usage', 'installation_stratum', 'stratum_evidence_media_id',
            'vat_snapshot', 'vat_concept', 'network_type'
          )
      `,
        [SCHEMA],
      );
      expect(removedColumns).toEqual([]);

      await migration.up(runner);
      const planAfterRetry = await runner.query(
        `SELECT vat_concept FROM catalog_items WHERE id = $1`,
        [ids.planItem],
      );
      expect(planAfterRetry).toEqual([{ vat_concept: 'INTERNET_ACCESS' }]);
      expect(logSpy).toHaveBeenCalledTimes(6);
    } finally {
      logSpy.mockRestore();
    }
  });
});
