import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { runBackfillInTenantSchema } from './backfill-party-pii';

const SCHEMA = `tenant_mod05_backfill_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
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
    // Esquema propio con la cadena tenant vigente: party, party_contact y subscribers conservan
    // las columnas en claro (document_number, value, whatsapp) que este backfill cifra.
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        TENANT_ID,
        'Party PII backfill synthetic',
        `party-pii-backfill-${TENANT_ID.slice(0, 8)}`,
        SCHEMA,
        'party-pii-backfill@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      SCHEMA,
      `party-pii-backfill-${SCHEMA}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    const firstPartyId = randomUUID();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${SCHEMA}"`);
      await runner.query(
        `INSERT INTO party (id, party_type, document_type, document_number, display_name, status)
         VALUES ($1, 'NATURAL', 'CC', '1.234-567', 'Titular sintético', 'ACTIVE'),
                ($2, 'NATURAL', 'CC', '1234567', 'Titular sintético', 'ACTIVE')`,
        [firstPartyId, randomUUID()],
      );
      await runner.query(
        `INSERT INTO party_contact (id, party_id, type, value)
         VALUES ($1, $2, 'EMAIL', 'Contact@Example.test')`,
        [randomUUID(), firstPartyId],
      );
      await runner.query(
        `INSERT INTO subscribers
          (id, tenant_id, person_type, customer_segment, vat_treatment, document_type,
           document_number_encrypted, first_name, last_name, stratum, address, created_by,
           whatsapp)
         VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'CC', 'synthetic-ciphertext',
           'Nombre sintético', 'Apellido sintético', 2, 'Dirección sintética', $3,
           '3001234567')`,
        [randomUUID(), TENANT_ID, randomUUID()],
      );
    } finally {
      await runner.release();
    }
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [TENANT_ID]);
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
