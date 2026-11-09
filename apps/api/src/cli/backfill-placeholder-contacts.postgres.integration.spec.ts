import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { hmacPii } from '../common/crypto/pii-hash-key.util';
import { runPlaceholderBackfillInTenantSchema } from './backfill-placeholder-contacts';

const SCHEMA = `tenant_mod05_placeholder_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
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
    // Esquema propio con la cadena tenant vigente (incluida la 148, que deja email_encrypted,
    // phone_encrypted y party_contact.value anulables, requisito del modo apply).
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        TENANT_ID,
        'Placeholder backfill synthetic',
        `placeholder-backfill-${TENANT_ID.slice(0, 8)}`,
        SCHEMA,
        'placeholder-backfill@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      SCHEMA,
      `placeholder-backfill-${SCHEMA}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    emailExpedienteId = randomUUID();
    phoneExpedienteId = randomUUID();
    const emailPartyId = randomUUID();
    const phonePartyId = randomUUID();
    placeholderEmailHmac = hmacPii(
      `expediente-${emailExpedienteId}@placeholder.iwana.co`,
      HASH_KEY,
    );
    placeholderPhoneHmac = hmacPii('0000000000', HASH_KEY);
    const emptyContactPartyId = randomUUID();
    const actorId = randomUUID();

    // La cadena exige los expedientes (FK de subscribers.expediente_id) y las partes (FK de
    // party_contact.party_id) que el DDL anterior no modelaba.
    await dataSource.query(
      `INSERT INTO "${SCHEMA}".expediente_records (id, tenant_id, full_name, created_by) VALUES
        ($1, $3, 'Prospecto sintético', $4), ($2, $3, 'Prospecto sintético', $4)`,
      [emailExpedienteId, phoneExpedienteId, TENANT_ID, actorId],
    );
    await dataSource.query(
      `INSERT INTO "${SCHEMA}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'synthetic-document-1', 'Titular sintético'),
              ($2, 'NATURAL', 'CC', 'synthetic-document-2', 'Titular sintético'),
              ($3, 'NATURAL', 'CC', 'synthetic-document-3', 'Titular sintético')`,
      [emailPartyId, phonePartyId, emptyContactPartyId],
    );
    await dataSource.query(
      `INSERT INTO "${SCHEMA}".subscribers
        (id, tenant_id, expediente_id, party_id, status, person_type, customer_segment,
         vat_treatment, vat_responsibility, document_type, document_number_encrypted,
         first_name, last_name, stratum, address, created_by,
         email_encrypted, email_hmac, phone_encrypted, phone_hmac)
       VALUES
        ($1, $11, $2, $3, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $12,
         'synthetic-email-ciphertext', $4, 'synthetic-phone-ciphertext', $5),
        ($6, $11, $7, $8, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'RESPONSABLE', 'CC',
         'synthetic-document-ciphertext', 'Nombre sintético', 'Apellido sintético', 2,
         'Dirección sintética', $12,
         'synthetic-email-ciphertext', $9, 'synthetic-real-phone-ciphertext', $10)`,
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
        TENANT_ID,
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${SCHEMA}".party_contact (id, party_id, type, value, value_hmac) VALUES
        ($1, $2, 'EMAIL', NULL, $3), ($4, $5, 'PHONE', '', $6), ($7, $8, 'EMAIL', '', NULL)`,
      [
        randomUUID(),
        emailPartyId,
        placeholderEmailHmac,
        randomUUID(),
        phonePartyId,
        placeholderPhoneHmac,
        randomUUID(),
        emptyContactPartyId,
      ],
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [TENANT_ID]);
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
