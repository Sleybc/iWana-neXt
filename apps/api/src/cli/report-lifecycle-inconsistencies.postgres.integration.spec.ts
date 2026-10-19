import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { ContractStatus } from '../modules/crm/enums/contract-status.enum';
import { SubscriberStatus } from '@iwana/shared';
import { reportLifecycleInconsistenciesInTenant } from './report-lifecycle-inconsistencies';

const schemaName = `tenant_lifecycle_report_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('Reporte de inconsistencias de ciclo de vida — PostgreSQL real', () => {
  let dataSource: DataSource;

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
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".subscribers (
        id uuid PRIMARY KEY,
        status varchar(30) NOT NULL,
        activated_at timestamptz,
        deleted_at timestamptz
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".contracts (
        id uuid PRIMARY KEY,
        subscriber_id uuid NOT NULL,
        status varchar(30) NOT NULL,
        deleted_at timestamptz
      )
    `);
  }, 30_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.destroy();
  });

  it('CA-LC-11 informa inconsistencias reales sin escribir datos ni devolver PII', async () => {
    const activatedAt = new Date('2026-01-01T00:00:00.000Z');
    const ids = {
      allSuspendedButActive: randomUUID(),
      activeContractButSuspended: randomUUID(),
      consistentActive: randomUUID(),
      noLiveContracts: randomUUID(),
      notActivated: randomUUID(),
    };
    await dataSource.query(
      `INSERT INTO "${schemaName}".subscribers (id, status, activated_at) VALUES
        ($1, $2, $6), ($3, $4, $6), ($5, $7, $6), ($8, $9, $6), ($10, $11, NULL)`,
      [
        ids.allSuspendedButActive,
        SubscriberStatus.ACTIVE,
        ids.activeContractButSuspended,
        SubscriberStatus.SUSPENDED,
        ids.consistentActive,
        activatedAt,
        SubscriberStatus.ACTIVE,
        ids.noLiveContracts,
        SubscriberStatus.SUSPENDED,
        ids.notActivated,
        SubscriberStatus.PROSPECT,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".contracts (id, subscriber_id, status) VALUES
        ($1, $2, $3), ($4, $5, $6), ($7, $8, $9),
        ($10, $11, $12), ($13, $14, $15), ($16, $17, $18)`,
      [
        randomUUID(),
        ids.allSuspendedButActive,
        ContractStatus.SUSPENDED,
        randomUUID(),
        ids.allSuspendedButActive,
        ContractStatus.SUSPENDED,
        randomUUID(),
        ids.allSuspendedButActive,
        ContractStatus.DRAFT,
        randomUUID(),
        ids.activeContractButSuspended,
        ContractStatus.ACTIVE,
        randomUUID(),
        ids.consistentActive,
        ContractStatus.ACTIVE,
        randomUUID(),
        ids.noLiveContracts,
        ContractStatus.DRAFT,
      ],
    );

    const before = await dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "${schemaName}".subscribers) AS subscribers,
         (SELECT COUNT(*)::int FROM "${schemaName}".contracts) AS contracts`,
    );
    const report = await reportLifecycleInconsistenciesInTenant(dataSource, schemaName);
    const after = await dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "${schemaName}".subscribers) AS subscribers,
         (SELECT COUNT(*)::int FROM "${schemaName}".contracts) AS contracts`,
    );

    expect(report.subscribersScanned).toBe(5);
    expect(report.inconsistenciesFound).toBe(2);
    expect(report.inconsistencies).toEqual(
      expect.arrayContaining([
        {
          subscriberId: ids.allSuspendedButActive,
          currentStatus: SubscriberStatus.ACTIVE,
          derivedStatus: SubscriberStatus.SUSPENDED,
          contractsByStatus: {
            [ContractStatus.SUSPENDED]: 2,
            [ContractStatus.DRAFT]: 1,
          },
        },
        {
          subscriberId: ids.activeContractButSuspended,
          currentStatus: SubscriberStatus.SUSPENDED,
          derivedStatus: SubscriberStatus.ACTIVE,
          contractsByStatus: { [ContractStatus.ACTIVE]: 1 },
        },
      ]),
    );
    expect(after).toEqual(before);
    expect(JSON.stringify(report)).not.toMatch(/email|phone|name|address/i);
  });
});
