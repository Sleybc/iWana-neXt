import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { runBackfillInTenantSchema } from './backfill-party-pii';

const SCHEMA = `tenant_mod05_backfill_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const HASH_KEY = Buffer.from(
  '1111111111111111111111111111111111111111111111111111111111111111',
  'hex',
);
const ACTIVE_KEY = Buffer.from(
  '2222222222222222222222222222222222222222222222222222222222222222',
  'hex',
);

describeWithDb('Backfill Party PII — dry-run PostgreSQL real', () => {
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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${SCHEMA}"`);
      await runner.query(`
        CREATE TABLE party (
          id uuid PRIMARY KEY, document_type varchar(20) NOT NULL,
          document_number varchar(500) NOT NULL, document_number_hmac varchar(64),
          status varchar(20) NOT NULL, deleted_at timestamptz
        )
      `);
      await runner.query(`
        CREATE TABLE party_contact (
          id uuid PRIMARY KEY, type varchar(20) NOT NULL, value varchar(255) NOT NULL,
          value_encrypted varchar(500), value_hmac varchar(64)
        )
      `);
      await runner.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY, whatsapp varchar(50),
          whatsapp_encrypted varchar(500), whatsapp_hmac varchar(64)
        )
      `);

      await runner.query(
        `INSERT INTO party (id, document_type, document_number, status) VALUES
          ($1, 'CC', '1.234-567', 'ACTIVE'), ($2, 'CC', '1234567', 'ACTIVE')`,
        [randomUUID(), randomUUID()],
      );
      await runner.query(
        `INSERT INTO party_contact (id, type, value) VALUES ($1, 'EMAIL', 'Contact@Example.test')`,
        [randomUUID()],
      );
      await runner.query(`INSERT INTO subscribers (id, whatsapp) VALUES ($1, '3001234567')`, [
        randomUUID(),
      ]);
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('reporta candidatos y no modifica datos en --dry-run', async () => {
    const report = await runBackfillInTenantSchema(
      dataSource,
      SCHEMA,
      { activeEncryptionKey: ACTIVE_KEY, previousEncryptionKey: null, hashKey: HASH_KEY },
      'dry-run',
    );

    expect(report.mode).toBe('dry-run');
    expect(report.applied).toBe(false);
    expect(report.blockedReason).toBe('merge-candidates');
    expect(report.mergeCandidates).toHaveLength(1);
    expect(report.mergeCandidates[0]).toMatchObject({ documentType: 'CC', count: 2 });
    expect(report.totals.partiesWouldSetHmac).toBe(2);
    expect(report.totals.partiesWouldEncrypt).toBe(2);
    expect(report.totals.contactsWouldSetHmac).toBe(1);
    expect(report.totals.whatsappWouldSetHmac).toBe(1);

    const partyState = await dataSource.query(`
      SELECT document_number, document_number_hmac FROM "${SCHEMA}".party ORDER BY document_number
    `);
    expect(partyState).toEqual([
      { document_number: '1.234-567', document_number_hmac: null },
      { document_number: '1234567', document_number_hmac: null },
    ]);
    expect(
      (
        await dataSource.query(`SELECT value_encrypted, value_hmac FROM "${SCHEMA}".party_contact`)
      )[0],
    ).toEqual({
      value_encrypted: null,
      value_hmac: null,
    });
    expect(
      (
        await dataSource.query(
          `SELECT whatsapp_encrypted, whatsapp_hmac FROM "${SCHEMA}".subscribers`,
        )
      )[0],
    ).toEqual({
      whatsapp_encrypted: null,
      whatsapp_hmac: null,
    });
  });
});
