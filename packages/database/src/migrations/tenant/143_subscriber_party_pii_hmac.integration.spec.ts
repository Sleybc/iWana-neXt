import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { AddSubscriberPartyPiiHmac1430000000000 } from './143_subscriber_party_pii_hmac';

const SCHEMA = `tenant_mod05_143_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const TENANT_ID = randomUUID();
const EXPEDIENTE_ID = randomUUID();
const SUBSCRIBER_ID = randomUUID();
const PARTY_ID = randomUUID();
const CONTACT_ID = randomUUID();

describeWithDb('Migración 143 — C-DDL-1 en PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let migration: AddSubscriberPartyPiiHmac1430000000000;

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
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public');

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
    await runner.query(`
      CREATE TABLE expediente_records (id uuid PRIMARY KEY)
    `);
    await runner.query(`
      CREATE TABLE party (
        id uuid PRIMARY KEY,
        document_type varchar(20) NOT NULL,
        document_number varchar(500) NOT NULL,
        status varchar(20) NOT NULL,
        deleted_at timestamptz NULL
      )
    `);
    await runner.query(`
      CREATE UNIQUE INDEX idx_party_document_active
        ON party(document_type, document_number)
        WHERE deleted_at IS NULL AND status != 'MERGED'
    `);
    await runner.query(`
      CREATE TABLE party_contact (
        id uuid PRIMARY KEY,
        party_id uuid NOT NULL REFERENCES party(id),
        type varchar(20) NOT NULL,
        value varchar(255) NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        expediente_id uuid NULL,
        deleted_at timestamptz NULL,
        document_number_encrypted varchar(500) NULL,
        email_encrypted varchar(500) NULL,
        whatsapp varchar(50) NULL,
        first_name varchar(300) NULL,
        last_name varchar(300) NULL,
        business_name varchar(300) NULL,
        commercial_name varchar(300) NULL
      )
    `);
    await runner.query(
      `CREATE INDEX idx_subscribers_tenant_doc ON subscribers (tenant_id, document_number_encrypted)`,
    );
    await runner.query(
      `CREATE INDEX idx_subscribers_tenant_email ON subscribers (tenant_id, email_encrypted)`,
    );

    await runner.query(`INSERT INTO expediente_records (id) VALUES ($1)`, [EXPEDIENTE_ID]);
    await runner.query(
      `INSERT INTO party (id, document_type, document_number, status) VALUES ($1, 'CC', '123456789', 'ACTIVE')`,
      [PARTY_ID],
    );
    await runner.query(
      `INSERT INTO party_contact (id, party_id, type, value) VALUES ($1, $2, 'EMAIL', 'seed@example.test')`,
      [CONTACT_ID, PARTY_ID],
    );
    await runner.query(
      `INSERT INTO subscribers (id, tenant_id, expediente_id, document_number_encrypted, email_encrypted, whatsapp, first_name)
       VALUES ($1, $2, $3, 'cipher', 'cipher', '3001234567', 'Seed')`,
      [SUBSCRIBER_ID, TENANT_ID, EXPEDIENTE_ID],
    );
    migration = new AddSubscriberPartyPiiHmac1430000000000();
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        await runner.query('SET search_path TO public');
        await runner.release();
      }
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await dataSource.destroy();
      }
    } catch {
      // Only the uniquely named disposable tenant schema is cleaned up here.
    }
  });

  it('preserva filas y completa el ciclo up/down/up', async () => {
    await migration.up(runner);
    let columns = (await runner.query(
      `
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = $1 AND column_name IN (
         'document_number_hmac', 'value_encrypted', 'value_hmac',
         'whatsapp_encrypted', 'whatsapp_hmac'
       ) ORDER BY table_name, column_name
    `,
      [SCHEMA],
    )) as Array<{ table_name: string; column_name: string }>;
    expect(columns).toHaveLength(5);
    expect(await runner.query(`SELECT id FROM crm_conversion_failures`)).toEqual([]);
    const newIndexes = (await runner.query(
      `
      SELECT indexname FROM pg_indexes
       WHERE schemaname = $1 AND indexname IN (
         'uq_party_document_hmac_active', 'idx_subscribers_search_trgm',
         'uq_subscribers_expediente'
       ) ORDER BY indexname
    `,
      [SCHEMA],
    )) as Array<{ indexname: string }>;
    expect(newIndexes.map((row) => row.indexname)).toEqual([
      'idx_subscribers_search_trgm',
      'uq_party_document_hmac_active',
      'uq_subscribers_expediente',
    ]);
    expect(
      await runner.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname IN ('idx_subscribers_tenant_doc', 'idx_subscribers_tenant_email')`,
        [SCHEMA],
      ),
    ).toEqual([]);
    expect((await runner.query(`SELECT count(*)::int AS count FROM party`))[0].count).toBe(1);
    expect((await runner.query(`SELECT count(*)::int AS count FROM subscribers`))[0].count).toBe(1);

    await migration.down(runner);
    const afterDownColumns = (await runner.query(
      `
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND column_name IN (
         'document_number_hmac', 'value_encrypted', 'value_hmac',
         'whatsapp_encrypted', 'whatsapp_hmac'
       )
    `,
      [SCHEMA],
    )) as Array<{ column_name: string }>;
    expect(afterDownColumns).toEqual([]);
    expect(
      (
        await runner.query(`SELECT to_regclass($1) AS legacy_index`, [
          `${SCHEMA}.idx_party_document_active`,
        ])
      )[0].legacy_index,
    ).not.toBeNull();
    expect((await runner.query(`SELECT count(*)::int AS count FROM party_contact`))[0].count).toBe(
      1,
    );

    await migration.up(runner);
    const retryIndex = await runner.query(`SELECT to_regclass($1) AS index_name`, [
      `${SCHEMA}.uq_subscribers_expediente`,
    ]);
    expect(retryIndex[0].index_name).not.toBeNull();
  });

  it('aborta antes del DDL y reporta grupos cuando expediente_id está duplicado', async () => {
    await migration.down(runner);
    const duplicateId = randomUUID();
    await runner.query(
      `INSERT INTO subscribers (id, tenant_id, expediente_id, document_number_encrypted, email_encrypted)
       VALUES ($1, $2, $3, 'cipher-two', 'cipher-two')`,
      [duplicateId, TENANT_ID, EXPEDIENTE_ID],
    );

    await expect(migration.up(runner)).rejects.toThrow(
      new RegExp(`${EXPEDIENTE_ID} \\(2; subscribers=`),
    );
    expect(
      await runner.query(
        `
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'party'
         AND column_name = 'document_number_hmac'
    `,
        [SCHEMA],
      ),
    ).toEqual([]);
    const legacyIndexes = (await runner.query(
      `
      SELECT indexname FROM pg_indexes WHERE schemaname = $1
        AND indexname IN ('idx_party_document_active', 'idx_subscribers_tenant_doc', 'idx_subscribers_tenant_email')
    `,
      [SCHEMA],
    )) as Array<{ indexname: string }>;
    expect(legacyIndexes).toHaveLength(3);

    await runner.query(`DELETE FROM subscribers WHERE id = $1`, [duplicateId]);
    await migration.up(runner);
  });
});
