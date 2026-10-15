import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { hmacPii } from '../common/crypto/pii-hash-key.util';
import { runPlaceholderBackfillInTenantSchema } from './backfill-placeholder-contacts';

const SCHEMA = `tenant_mod05_placeholder_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const HASH_KEY = Buffer.from(
  '1111111111111111111111111111111111111111111111111111111111111111',
  'hex',
);

describeWithDb('Backfill MOD05 placeholder contacts — PostgreSQL real', () => {
  let dataSource: DataSource;
  let placeholderEmailHmac: string;
  let placeholderPhoneHmac: string;
  let emailExpedienteId: string;
  let phoneExpedienteId: string;

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
    await dataSource.query(`
      CREATE TABLE "${SCHEMA}".subscribers (
        id uuid PRIMARY KEY,
        expediente_id uuid,
        party_id uuid,
        status varchar(30) NOT NULL,
        email_encrypted varchar(500),
        email_hmac varchar(64),
        phone_encrypted varchar(100),
        phone_hmac varchar(64)
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${SCHEMA}".party_contact (
        id uuid PRIMARY KEY,
        party_id uuid NOT NULL,
        value varchar(255),
        value_hmac varchar(64)
      )
    `);

    emailExpedienteId = randomUUID();
    phoneExpedienteId = randomUUID();
    const emailPartyId = randomUUID();
    const phonePartyId = randomUUID();
    placeholderEmailHmac = hmacPii(
      `expediente-${emailExpedienteId}@placeholder.iwana.co`,
      HASH_KEY,
    );
    placeholderPhoneHmac = hmacPii('0000000000', HASH_KEY);

    await dataSource.query(
      `INSERT INTO "${SCHEMA}".subscribers
        (id, expediente_id, party_id, status, email_encrypted, email_hmac, phone_encrypted, phone_hmac)
       VALUES
        ($1, $2, $3, 'ACTIVE', 'synthetic-email-ciphertext', $4, 'synthetic-phone-ciphertext', $5),
        ($6, $7, $8, 'ACTIVE', 'synthetic-email-ciphertext', $9, 'synthetic-real-phone-ciphertext', $10)`,
      [
        randomUUID(),
        emailExpedienteId,
        emailPartyId,
        placeholderEmailHmac,
        placeholderPhoneHmac,
        randomUUID(),
        phoneExpedienteId,
        phonePartyId,
        hmacPii(`expediente-${phoneExpedienteId}@placeholder.iwana.co`, HASH_KEY),
        hmacPii('3000000000', HASH_KEY),
      ],
    );
    await dataSource.query(
      `INSERT INTO "${SCHEMA}".party_contact (id, party_id, value, value_hmac) VALUES
        ($1, $2, NULL, $3), ($4, $5, '', $6), ($7, $8, '', NULL)`,
      [
        randomUUID(),
        emailPartyId,
        placeholderEmailHmac,
        randomUUID(),
        phonePartyId,
        placeholderPhoneHmac,
        randomUUID(),
        randomUUID(),
      ],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('dry-run no modifica; apply limpia placeholders y la segunda ejecución es idempotente', async () => {
    const dryRun = await runPlaceholderBackfillInTenantSchema(
      dataSource,
      SCHEMA,
      HASH_KEY,
      'dry-run',
    );
    expect(dryRun).toMatchObject({
      mode: 'dry-run',
      applied: false,
      totals: {
        subscribersSeen: 2,
        emailPlaceholders: 2,
        phonePlaceholders: 1,
        partyContactsPlaceholderByHmac: 2,
        emptyPartyContactValues: 2,
        activeWithoutContactAfterBackfill: 1,
      },
    });
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM "${SCHEMA}".subscribers WHERE email_encrypted IS NOT NULL`,
      ),
    ).toEqual([{ count: 2 }]);

    const applied = await runPlaceholderBackfillInTenantSchema(
      dataSource,
      SCHEMA,
      HASH_KEY,
      'apply',
    );
    expect(applied.applied).toBe(true);
    expect(applied.totals.activeWithoutContactAfterBackfill).toBe(1);
    expect(
      await dataSource.query(
        `SELECT email_encrypted, email_hmac, phone_encrypted, phone_hmac
           FROM "${SCHEMA}".subscribers WHERE expediente_id = $1`,
        [emailExpedienteId],
      ),
    ).toEqual([
      { email_encrypted: null, email_hmac: null, phone_encrypted: null, phone_hmac: null },
    ]);
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM "${SCHEMA}".party_contact WHERE value_hmac = ANY($1::varchar[])`,
        [[placeholderEmailHmac, placeholderPhoneHmac]],
      ),
    ).toEqual([{ count: 0 }]);
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM "${SCHEMA}".party_contact WHERE value = ''`,
      ),
    ).toEqual([{ count: 0 }]);

    const repeated = await runPlaceholderBackfillInTenantSchema(
      dataSource,
      SCHEMA,
      HASH_KEY,
      'apply',
    );
    expect(repeated.applied).toBe(true);
    expect(repeated.totals).toEqual({
      subscribersSeen: 2,
      emailPlaceholders: 0,
      phonePlaceholders: 0,
      partyContactsPlaceholderByHmac: 0,
      emptyPartyContactValues: 0,
      activeWithoutContactAfterBackfill: 1,
    });
  });
});
