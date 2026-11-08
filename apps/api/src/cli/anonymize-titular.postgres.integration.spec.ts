import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema } from '@iwana/db';
import { decryptAes256Gcm, encryptAes256Gcm } from '../common/crypto/aes-gcm.util';
import { hmacPii } from '../common/crypto/pii-hash-key.util';
import { TypeOrmReencryptDbAdapter } from '../common/crypto/reencrypt-aes.db-adapter';
import {
  anonymizeTitularInTenantSchema,
  listFindingRequestIds,
  runRolledBackInTenantSchema,
  toVerificationOutput,
  verifyAnonymizedTenant,
} from './anonymize-titular';
import { MfaToPiiMode, runMfaToPii } from './reencrypt-aes.pii';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const HASH_KEY = Buffer.from('26'.repeat(32), 'hex');
const ENCRYPTION_KEY = Buffer.from('37'.repeat(32), 'hex');
const RETIRED_ENCRYPTION_KEY = Buffer.from('48'.repeat(32), 'hex');
const MFA_SOURCE_KEY = Buffer.from('59'.repeat(32), 'hex');
const KEYS = {
  hashKey: HASH_KEY,
  activeEncryptionKey: ENCRYPTION_KEY,
  previousEncryptionKey: null,
};

interface Fixture {
  schema: string;
  requestId: string;
  partyId: string;
  expedienteId: string;
  documentHmac: string;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function createFixture(dataSource: DataSource): Promise<Fixture> {
  const schema = `tenant_anonymize_${randomBytes(5).toString('hex')}`;
  const requestId = randomUUID();
  const partyId = randomUUID();
  const expedienteId = randomUUID();
  const documentHmac = hmacPii(`synthetic-document-${randomUUID()}`, HASH_KEY);
  const q = quoteIdentifier(schema);

  await dataSource.query(`CREATE SCHEMA ${q}`);
  await dataSource.query(
    `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
     VALUES (gen_random_uuid(), $1, $1, $2, 'ACTIVE', 'ci-tenant@example.invalid')`,
    [`anonymize-${schema.slice(-10)}`, schema],
  );
  await dataSource.query(`CREATE TABLE ${q}.billing_documents (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL,
    status text NOT NULL, void_note text, buyer_snapshot jsonb, buyer_document_encrypted varchar(500), updated_at timestamptz
  )`);
  await dataSource.query(
    `CREATE TABLE ${q}.billing_document_lines (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, document_id uuid NOT NULL)`,
  );
  await dataSource.query(
    `CREATE TABLE ${q}.billing_payments (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL, reference text, note text, void_note text, updated_at timestamptz)`,
  );

  await dataSource.query(`CREATE TABLE ${q}.potential_leads (id uuid PRIMARY KEY)`);
  await dataSource.query(`
    CREATE TABLE ${q}.data_subject_requests (
      id uuid PRIMARY KEY,
      party_id uuid,
      requester_document_hmac text,
      requester_evidence_media_id uuid,
      response_text text
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.data_authorizations (
      id uuid PRIMARY KEY,
      party_id uuid NOT NULL,
      evidence_media_id uuid
    )
  `);
  await dataSource.query(
    `CREATE TABLE ${q}.audit_logs (id uuid PRIMARY KEY, action text NOT NULL)`,
  );
  await dataSource.query(`
    CREATE TABLE ${q}.expediente_records (
      id uuid PRIMARY KEY,
      document_number_hmac text,
      document_number_encrypted varchar(500),
      document_number_hash varchar(64) NOT NULL,
      fiscal_document text,
      fiscal_document_encrypted varchar(500),
      fiscal_document_hmac varchar(64),
      full_name varchar(160) NOT NULL,
      address varchar(255),
      document_supports jsonb NOT NULL,
      anonymized_at timestamptz,
      anonymized_request_id uuid,
      updated_at timestamptz
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.contact_attempts (
      id uuid PRIMARY KEY,
      expediente_id uuid NOT NULL,
      notes text,
      updated_at timestamptz
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.consent_records (
      id uuid PRIMARY KEY,
      expediente_id uuid NOT NULL,
      ip_address varchar(64),
      evidence_ref varchar(255),
      revoked_reason varchar(255),
      updated_at timestamptz
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.coverage_checks (
      id uuid PRIMARY KEY,
      expediente_id uuid NOT NULL,
      latitude numeric(10, 7),
      longitude numeric(10, 7),
      address_used varchar(255),
      snapshot_json jsonb NOT NULL,
      updated_at timestamptz
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.party (
      id uuid PRIMARY KEY,
      document_type varchar(20) NOT NULL,
      document_number varchar(500) NOT NULL,
      document_number_hmac varchar(64),
      verification_digit varchar(2),
      display_name varchar(160) NOT NULL,
      legal_name varchar(200),
      birth_date date,
      incorporation_date date,
      notes text,
      address varchar(255),
      latitude numeric(10, 7),
      longitude numeric(10, 7),
      city varchar(120),
      department varchar(120),
      anonymized_at timestamptz,
      anonymized_request_id uuid,
      updated_at timestamptz,
      UNIQUE (document_type, document_number)
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.party_contact (
      id uuid PRIMARY KEY,
      party_id uuid NOT NULL,
      value varchar(255),
      value_encrypted varchar(500),
      value_hmac varchar(64),
      metadata jsonb,
      is_primary boolean NOT NULL DEFAULT false,
      verified_at timestamptz,
      updated_at timestamptz
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.subscribers (
      id uuid PRIMARY KEY,
      party_id uuid,
      user_id uuid,
      document_type varchar(20),
      document_number_encrypted varchar(500),
      document_number_hmac varchar(64),
      document_number_hash varchar(64) NOT NULL,
      email_hmac varchar(64),
      email_hash varchar(64),
      phone_hmac varchar(64),
      phone_hash varchar(64),
      first_name varchar(300),
      last_name varchar(300),
      stratum integer,
      birth_date date,
      nit varchar(500),
      nit_verification_digit varchar(1),
      business_name varchar(300),
      commercial_name varchar(300),
      legal_representative_id uuid,
      email_encrypted varchar(500) NOT NULL,
      phone_encrypted varchar(100) NOT NULL,
      alt_contact_name varchar(160),
      alt_contact_phone_encrypted varchar(100),
      whatsapp varchar(50),
      whatsapp_encrypted varchar(500),
      whatsapp_hmac varchar(64),
      address varchar(500) NOT NULL,
      neighborhood varchar(100),
      city varchar(50),
      department varchar(50),
      postal_code varchar(20),
      latitude numeric(10, 7),
      longitude numeric(10, 7),
      manual_override_reason varchar(500),
      external_id varchar(160),
      status varchar(30),
      anonymized_at timestamptz,
      anonymized_request_id uuid,
      updated_at timestamptz
    )
  `);
  await dataSource.query(`
    CREATE TABLE ${q}.users (
      id uuid PRIMARY KEY,
      email varchar(255) NOT NULL UNIQUE,
      email_hmac varchar(64) NOT NULL UNIQUE,
      email_hash varchar(64),
      first_name varchar(100),
      last_name varchar(100),
      phone varchar(20),
      job_title varchar(150),
      document_type varchar(20),
      document_number varchar(30),
      avatar_url varchar(500),
      deleted_at timestamptz,
      updated_at timestamptz
    )
  `);

  await dataSource.query(
    `INSERT INTO ${q}.data_subject_requests
      (id, party_id, requester_document_hmac, requester_evidence_media_id, response_text)
     VALUES ($1, $2, $3, NULL, $4)`,
    [requestId, partyId, documentHmac, 'synthetic request evidence must remain untouched'],
  );
  await dataSource.query(
    `INSERT INTO ${q}.data_authorizations (id, party_id, evidence_media_id)
     VALUES ($1, $2, NULL)`,
    [randomUUID(), partyId],
  );
  await dataSource.query(`INSERT INTO ${q}.audit_logs (id, action) VALUES ($1, $2)`, [
    randomUUID(),
    'synthetic audit row',
  ]);
  await dataSource.query(
    `INSERT INTO ${q}.party
      (id, document_type, document_number, document_number_hmac, verification_digit,
       display_name, legal_name, birth_date, notes, address, city, department)
     VALUES ($1, 'CC', $2, $3, '7', 'Titular sintético', 'Razón sintética', '1980-01-01',
       'nota sintética', 'Calle sintética', 'Bogotá', 'Cundinamarca')`,
    [partyId, encryptAes256Gcm('synthetic-document-value', ENCRYPTION_KEY), documentHmac],
  );
  await dataSource.query(
    `INSERT INTO ${q}.expediente_records
      (id, document_number_hmac, document_number_encrypted, document_number_hash,
       fiscal_document, fiscal_document_encrypted, fiscal_document_hmac,
       full_name, address, document_supports)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, 'Prospecto sintético', 'Dirección sintética', $7::jsonb)`,
    [
      expedienteId,
      documentHmac,
      encryptAes256Gcm('synthetic-document-value', ENCRYPTION_KEY),
      'a'.repeat(64),
      encryptAes256Gcm('synthetic-fiscal-value', ENCRYPTION_KEY),
      hmacPii('SYNTHETICFISCALVALUE', HASH_KEY),
      JSON.stringify({ synthetic: 'evidence' }),
    ],
  );
  await dataSource.query(
    `INSERT INTO ${q}.party_contact
      (id, party_id, value, value_encrypted, value_hmac, metadata, is_primary)
     VALUES ($1, $2, 'synthetic@example.invalid', $3, $4, $5::jsonb, true)`,
    [
      randomUUID(),
      partyId,
      encryptAes256Gcm('synthetic@example.invalid', ENCRYPTION_KEY),
      hmacPii('synthetic@example.invalid', HASH_KEY),
      JSON.stringify({ label: 'synthetic' }),
    ],
  );
  return { schema, requestId, partyId, expedienteId, documentHmac };
}

async function insertSubscriberAndUser(
  dataSource: DataSource,
  fixture: Fixture,
  accountDeletedAt: Date | null,
): Promise<{ subscriberId: string; userId: string; email: string }> {
  const q = quoteIdentifier(fixture.schema);
  const subscriberId = randomUUID();
  const userId = randomUUID();
  const email = `synthetic.${userId}@example.invalid`;
  await dataSource.query(
    `INSERT INTO ${q}.users
      (id, email, email_hmac, email_hash, first_name, last_name, phone,
       job_title, document_type, document_number, avatar_url, deleted_at)
     VALUES ($1, $2, $3, $4, 'Nombre sintético', 'Apellido sintético', '+570000000000',
       'Cargo sintético', 'CC', '00000000', 'https://example.invalid/avatar', $5)`,
    [userId, email, hmacPii(email, HASH_KEY), 'b'.repeat(64), accountDeletedAt],
  );
  await dataSource.query(
    `INSERT INTO ${q}.subscribers
      (id, party_id, user_id, document_type, document_number_encrypted,
       document_number_hmac, document_number_hash, email_hmac, email_hash,
       phone_hmac, phone_hash, first_name, last_name, birth_date, nit,
       nit_verification_digit, business_name, commercial_name, email_encrypted,
       phone_encrypted, alt_contact_name, alt_contact_phone_encrypted,
       whatsapp, whatsapp_encrypted, whatsapp_hmac, address, neighborhood, city,
       department, postal_code, latitude, longitude, manual_override_reason,
       external_id, status)
     VALUES ($1, $2, $3, 'CC', $4, $5, $6, $7, $8, $9, $10,
       'Nombre sintético', 'Apellido sintético', '1980-01-01', '00000000', '0',
       'Empresa sintética', 'Comercial sintético', $11, $12, 'Contacto sintético',
       $13, '0000000000', $14, $15, 'Dirección sintética', 'Barrio sintético',
       'Bogotá', 'Cundinamarca', '000000', 4.5, -74.1, 'Motivo sintético',
       'ID externo sintético', 'CANCELLED')`,
    [
      subscriberId,
      fixture.partyId,
      userId,
      encryptAes256Gcm('synthetic-document-value', ENCRYPTION_KEY),
      fixture.documentHmac,
      'c'.repeat(64),
      hmacPii(email, HASH_KEY),
      'd'.repeat(64),
      hmacPii('+570000000000', HASH_KEY),
      'e'.repeat(64),
      encryptAes256Gcm(email, ENCRYPTION_KEY),
      encryptAes256Gcm('+570000000000', ENCRYPTION_KEY),
      encryptAes256Gcm('+570000000001', ENCRYPTION_KEY),
      encryptAes256Gcm('+570000000002', ENCRYPTION_KEY),
      'f'.repeat(64),
    ],
  );
  return { subscriberId, userId, email };
}

describeWithDb('Anonymize titular — PostgreSQL real con schema sintético', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!/^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName)) {
      throw new Error(
        'Integración anonymize titular: DB_NAME debe ser test o iwana_it_*; nunca la base de desarrollo.',
      );
    }
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /**
   * Titular suprimido por el CLI sobre la cadena migrada, con el CHECK real, y con la marca que
   * dejaba el borrado anterior a la 176. Solo esa celda se simula: el resto es la fila real, y el
   * trigger se suspende en la transacción de la siembra porque la marca ya no se puede escribir.
   */
  async function withLegacyMarkerTitular(
    markerKey: Buffer,
    assertions: (titular: {
      schema: string;
      requestId: string;
      subscriberId: string;
      readDocument: () => Promise<unknown>;
      runK2: (mode: MfaToPiiMode) => ReturnType<typeof runMfaToPii>;
    }) => Promise<void>,
  ): Promise<void> {
    const schema = `tenant_anonymize_k2_${randomBytes(5).toString('hex')}`;
    const q = quoteIdentifier(schema);
    const tenantId = randomUUID();
    const partyId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const actorId = randomUUID();
    const migrationDataSource = createTenantDataSource(dataSource, schema, `anonymize-${schema}`);

    try {
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'Anonymize K2 synthetic fixture', $2, $3, 'ACTIVE', 'anonymize-it@example.invalid')`,
        [tenantId, `anonymize-${schema.slice(-10)}`, schema],
      );
      await dataSource.query(`CREATE SCHEMA ${q}`);
      await migrationDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(migrationDataSource);
      } finally {
        await migrationDataSource.destroy();
      }

      await dataSource.query(
        `INSERT INTO ${q}.party
          (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético')`,
        [partyId, encryptAes256Gcm('synthetic-party-document', ENCRYPTION_KEY)],
      );
      await dataSource.query(
        `INSERT INTO ${q}.subscribers
          (id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, email_encrypted,
           phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
         VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4,
           'Nombre sintético', 'Apellido sintético', 2, $5, $6, 'STANDARD', 'COMMON',
           'RESPONSABLE', 'Dirección sintética', $7)`,
        [
          subscriberId,
          tenantId,
          partyId,
          encryptAes256Gcm('synthetic-subscriber-document', ENCRYPTION_KEY),
          encryptAes256Gcm('synthetic-email', ENCRYPTION_KEY),
          encryptAes256Gcm('synthetic-phone', ENCRYPTION_KEY),
          actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.data_subject_requests
          (id, party_id, requester_kind, identity_verification_method, identity_verified_at,
           identity_verified_by, kind, "right", status, received_at, due_at, complete_at,
           erased_at, erasure_categories)
         VALUES ($1, $2, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $3,
           'CONSULTA', 'SUPRIMIR', 'RESUELTA', now(), CURRENT_DATE + 30, now(),
           now(), ARRAY['IDENTIFICACION']::text[])`,
        [requestId, partyId, actorId],
      );
      await anonymizeTitularInTenantSchema(dataSource, schema, requestId, [], false, KEYS, 'apply');

      await runInTenantSchema(dataSource, schema, async (queryRunner) => {
        await queryRunner.query(
          'ALTER TABLE subscribers DISABLE TRIGGER trg_subscribers_prevent_anonymized_mutation',
        );
        await queryRunner.query(
          'UPDATE subscribers SET document_number_encrypted = $2 WHERE id = $1',
          [subscriberId, encryptAes256Gcm('ANONIMIZADO', markerKey)],
        );
        await queryRunner.query(
          'ALTER TABLE subscribers ENABLE TRIGGER trg_subscribers_prevent_anonymized_mutation',
        );
      });

      await assertions({
        schema,
        requestId,
        subscriberId,
        readDocument: async () => {
          const rows = (await dataSource.query(
            `SELECT document_number_encrypted FROM ${q}.subscribers WHERE id = $1`,
            [subscriberId],
          )) as Array<{ document_number_encrypted: string | null }>;
          return rows[0]?.document_number_encrypted;
        },
        runK2: (mode) =>
          runMfaToPii(new TypeOrmReencryptDbAdapter(dataSource), {
            mode,
            schemaFilter: schema,
            eligibleTenantSchemas: [schema],
            keys: {
              piiActiveKey: ENCRYPTION_KEY,
              piiPreviousKey: RETIRED_ENCRYPTION_KEY,
              mfaKeys: [MFA_SOURCE_KEY],
            },
          }),
      });
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
  }

  it('remedia notas previas en una solicitud resuelta usando las migraciones reales', async () => {
    const schema = `tenant_anonymize_cli_${randomBytes(5).toString('hex')}`;
    const q = quoteIdentifier(schema);
    const tenantId = randomUUID();
    const partyId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const actorId = randomUUID();
    const migrationDataSource = createTenantDataSource(dataSource, schema, `anonymize-${schema}`);

    try {
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'Anonymize synthetic fixture', $2, $3, 'ACTIVE', 'anonymize-it@example.invalid')`,
        [tenantId, `anonymize-${schema.slice(-10)}`, schema],
      );
      await dataSource.query(`CREATE SCHEMA ${q}`);
      await migrationDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(migrationDataSource);
      } finally {
        await migrationDataSource.destroy();
      }

      await dataSource.query(
        `INSERT INTO ${q}.party
          (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético')`,
        [partyId, encryptAes256Gcm('synthetic-party-document', ENCRYPTION_KEY)],
      );
      await dataSource.query(
        `INSERT INTO ${q}.subscribers
          (id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, email_encrypted,
           phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
         VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4,
           'Nombre sintético', 'Apellido sintético', 2, $5, $6, 'STANDARD', 'COMMON',
           'RESPONSABLE', 'Dirección sintética', $7)`,
        [
          subscriberId,
          tenantId,
          partyId,
          encryptAes256Gcm('synthetic-subscriber-document', ENCRYPTION_KEY),
          encryptAes256Gcm('synthetic-email', ENCRYPTION_KEY),
          encryptAes256Gcm('synthetic-phone', ENCRYPTION_KEY),
          actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.data_subject_requests
          (id, party_id, requester_kind, identity_verification_method, identity_verified_at,
           identity_verified_by, kind, "right", status, received_at, due_at, complete_at,
           erased_at, erasure_categories)
         VALUES ($1, $2, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $3,
           'CONSULTA', 'SUPRIMIR', 'RESUELTA', now(), CURRENT_DATE + 30, now(),
           now(), ARRAY['IDENTIFICACION']::text[])`,
        [requestId, partyId, actorId],
      );

      await anonymizeTitularInTenantSchema(dataSource, schema, requestId, [], false, KEYS, 'apply');
      const noteId = randomUUID();
      await dataSource.query(
        `INSERT INTO ${q}.crm_lifecycle_changes
          (id, tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
           reason_code, note_encrypted, source, batch_id, actor_id)
         VALUES ($1, $2, 'SUBSCRIBER', $3, $3, 'ACTIVE', 'CANCELLED',
           'SOLICITUD_TITULAR', $4, 'MANUAL', $5, $6)`,
        [
          noteId,
          tenantId,
          subscriberId,
          encryptAes256Gcm('synthetic lifecycle note', ENCRYPTION_KEY),
          randomUUID(),
          actorId,
        ],
      );

      const before = await verifyAnonymizedTenant(dataSource, schema, KEYS);
      expect(before.residualFields).toBeGreaterThan(0);
      expect(before.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            titularIds: expect.arrayContaining([subscriberId]),
            tables: expect.arrayContaining([
              expect.objectContaining({ table: 'crm_lifecycle_changes' }),
            ]),
          }),
        ]),
      );

      const [versionBefore] = (await dataSource.query(
        `SELECT updated_at FROM ${q}.subscribers WHERE id = $1`,
        [subscriberId],
      )) as Array<{ updated_at: Date }>;
      await anonymizeTitularInTenantSchema(dataSource, schema, requestId, [], false, KEYS, 'apply');
      const after = await verifyAnonymizedTenant(dataSource, schema, KEYS);
      const [versionAfter] = (await dataSource.query(
        `SELECT updated_at FROM ${q}.subscribers WHERE id = $1`,
        [subscriberId],
      )) as Array<{ updated_at: Date }>;
      expect(after.residualFields).toBe(0);
      expect(versionAfter?.updated_at.getTime()).toBe(versionBefore?.updated_at.getTime());
      expect(
        await dataSource.query(
          `SELECT note_encrypted FROM ${q}.crm_lifecycle_changes WHERE id = $1`,
          [noteId],
        ),
      ).toEqual([{ note_encrypted: null }]);
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
  }, 180_000);

  it('R2: --apply solo con --request remedia un expediente ya anonimizado y falla cerrado con alcance vacío', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      const first = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );
      expect(first.verification.residualFields).toBe(0);

      await dataSource.query(
        `UPDATE ${q}.expediente_records SET full_name = 'residuo sintetico de remediacion' WHERE id = $1`,
        [fixture.expedienteId],
      );
      const dirty = await verifyAnonymizedTenant(dataSource, fixture.schema, KEYS);
      expect(dirty.residualFields).toBeGreaterThan(0);

      const dry = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [],
        false,
        KEYS,
        'dry-run',
      );
      expect(dry.applied).toBe(false);
      expect((await verifyAnonymizedTenant(dataSource, fixture.schema, KEYS)).residualFields).toBe(
        dirty.residualFields,
      );

      const remediated = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [],
        false,
        KEYS,
        'apply',
      );
      expect(remediated.verification.residualFields).toBe(0);
      expect(await verifyAnonymizedTenant(dataSource, fixture.schema, KEYS)).toMatchObject({
        residualFields: 0,
        findings: [],
      });

      const emptyRequestId = randomUUID();
      await dataSource.query(
        `INSERT INTO ${q}.data_subject_requests
          (id, party_id, requester_document_hmac, requester_evidence_media_id, response_text)
         VALUES ($1, NULL, NULL, NULL, 'solicitud sintetica sin alcance')`,
        [emptyRequestId],
      );
      await expect(
        anonymizeTitularInTenantSchema(
          dataSource,
          fixture.schema,
          emptyRequestId,
          [],
          false,
          KEYS,
          'dry-run',
        ),
      ).resolves.toMatchObject({ applied: false });
      await expect(
        anonymizeTitularInTenantSchema(
          dataSource,
          fixture.schema,
          emptyRequestId,
          [],
          false,
          KEYS,
          'apply',
        ),
      ).rejects.toThrow('--expediente');
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('anonimiza prospecto, usa dry-run por defecto, verifica e itera idempotentemente', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      await dataSource.query(
        `INSERT INTO ${q}.contact_attempts (id, expediente_id, notes) VALUES ($1, $2, $3)`,
        [randomUUID(), fixture.expedienteId, 'nota de contacto sintética'],
      );
      await dataSource.query(
        `INSERT INTO ${q}.consent_records
          (id, expediente_id, ip_address, evidence_ref, revoked_reason)
         VALUES ($1, $2, '192.0.2.4', 'synthetic-evidence', 'motivo sintético')`,
        [randomUUID(), fixture.expedienteId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.coverage_checks
          (id, expediente_id, latitude, longitude, address_used, snapshot_json)
         VALUES ($1, $2, 4.5, -74.1, 'dirección sintética', $3::jsonb)`,
        [randomUUID(), fixture.expedienteId, JSON.stringify({ address: 'synthetic' })],
      );

      const dryRun = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'dry-run',
      );
      expect(dryRun).toMatchObject({
        mode: 'dry-run',
        applied: false,
        totals: {
          expedienteRecords: 1,
          contactAttempts: 1,
          consentRecords: 1,
          coverageChecks: 1,
          parties: 1,
          partyContacts: 1,
        },
        changed: { expedienteRecords: 0, parties: 0, partyContacts: 0 },
      });
      expect(dryRun).not.toHaveProperty('requestId');
      expect(
        await dataSource.query(`SELECT full_name FROM ${q}.expediente_records WHERE id = $1`, [
          fixture.expedienteId,
        ]),
      ).toEqual([{ full_name: 'Prospecto sintético' }]);

      const applied = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );
      expect(applied).toMatchObject({
        mode: 'apply',
        applied: true,
        verification: { residualFields: 0, activeMediaAssets: 0 },
      });
      const expediente = (await dataSource.query(
        `SELECT full_name, document_number_encrypted, document_number_hmac,
                document_number_hash, fiscal_document, fiscal_document_encrypted,
                fiscal_document_hmac, address, document_supports
           FROM ${q}.expediente_records WHERE id = $1`,
        [fixture.expedienteId],
      )) as Array<Record<string, unknown>>;
      expect(expediente[0]).toMatchObject({
        full_name: 'ANONIMIZADO',
        document_number_encrypted: null,
        document_number_hmac: null,
        fiscal_document: null,
        fiscal_document_encrypted: null,
        fiscal_document_hmac: null,
        address: null,
        document_supports: {},
      });
      expect(
        await dataSource.query(
          `SELECT anonymized_at IS NOT NULL AS marked,
                anonymized_request_id = $2::uuid AS request_marked
           FROM ${q}.expediente_records WHERE id = $1`,
          [fixture.expedienteId, fixture.requestId],
        ),
      ).toEqual([{ marked: true, request_marked: true }]);
      expect(expediente[0]?.['document_number_hash']).toBeTruthy();
      const party = (await dataSource.query(
        `SELECT document_number, document_number_hmac, verification_digit, display_name, legal_name
           FROM ${q}.party WHERE id = $1`,
        [fixture.partyId],
      )) as Array<Record<string, unknown>>;
      expect(decryptAes256Gcm(String(party[0]?.['document_number']), ENCRYPTION_KEY)).toBe(
        `ANONIMIZADO:${fixture.partyId}`,
      );
      expect(party[0]).toMatchObject({
        document_number_hmac: null,
        verification_digit: null,
        display_name: 'ANONIMIZADO',
        legal_name: null,
      });
      expect(
        await dataSource.query(
          `SELECT anonymized_at IS NOT NULL AS marked,
                anonymized_request_id = $2::uuid AS request_marked
           FROM ${q}.party WHERE id = $1`,
          [fixture.partyId, fixture.requestId],
        ),
      ).toEqual([{ marked: true, request_marked: true }]);
      expect(await dataSource.query(`SELECT notes FROM ${q}.contact_attempts`)).toEqual([
        { notes: null },
      ]);
      expect(
        await dataSource.query(
          `SELECT ip_address, evidence_ref, revoked_reason FROM ${q}.consent_records`,
        ),
      ).toEqual([{ ip_address: null, evidence_ref: null, revoked_reason: null }]);
      expect(await dataSource.query(`SELECT snapshot_json FROM ${q}.coverage_checks`)).toEqual([
        { snapshot_json: {} },
      ]);

      const retainedRequest = await dataSource.query(
        `SELECT requester_document_hmac, response_text FROM ${q}.data_subject_requests WHERE id = $1`,
        [fixture.requestId],
      );
      expect(retainedRequest).toEqual([
        {
          requester_document_hmac: fixture.documentHmac,
          response_text: 'synthetic request evidence must remain untouched',
        },
      ]);
      expect(await dataSource.query(`SELECT action FROM ${q}.audit_logs`)).toEqual([
        { action: 'synthetic audit row' },
      ]);
      expect(
        (await dataSource.query(`SELECT COUNT(*)::int AS count FROM ${q}.data_authorizations`))[0],
      ).toEqual({ count: 1 });

      const repeated = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );
      expect(repeated.applied).toBe(true);
      expect(repeated.totals.unmatchedExpedientes).toBe(0);
      expect(repeated.changed).toEqual({
        expedienteRecords: 0,
        contactAttempts: 0,
        consentRecords: 0,
        coverageChecks: 0,
        parties: 0,
        partyContacts: 0,
        subscribers: 0,
        users: 0,
        privacyMediaAssets: 0,
        stratumMediaAssets: 0,
      });

      const cleanVerification = await verifyAnonymizedTenant(dataSource, fixture.schema, KEYS);
      expect(cleanVerification).toMatchObject({
        titularesChecked: 1,
        markedSubscribers: 0,
        markedExpedientes: 1,
        residualFields: 0,
        findings: [],
      });

      await dataSource.query(
        `UPDATE ${q}.expediente_records SET full_name = 'synthetic residual fixture' WHERE id = $1`,
        [fixture.expedienteId],
      );
      const residualVerification = await verifyAnonymizedTenant(dataSource, fixture.schema, KEYS);
      expect(residualVerification.residualFields).toBeGreaterThan(0);
      expect(residualVerification.findings).toEqual([
        expect.objectContaining({
          titularIds: [fixture.expedienteId],
          tables: expect.arrayContaining([
            expect.objectContaining({ table: 'expediente_records', residualFields: 1 }),
          ]),
        }),
      ]);
      expect(JSON.stringify(residualVerification)).not.toContain('synthetic residual fixture');
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('CA-BT-26: verify-only detecta estratos 1 previos y apply los corrige', async () => {
    const schema = `tenant_anonymize_cli_${randomBytes(5).toString('hex')}`;
    const q = quoteIdentifier(schema);
    const tenantId = randomUUID();
    const partyId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const actorId = randomUUID();
    const migrationDataSource = createTenantDataSource(dataSource, schema, `anonymize-${schema}`);

    try {
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'Anonymize synthetic fixture', $2, $3, 'ACTIVE', 'anonymize-it@example.invalid')`,
        [tenantId, `anonymize-${schema.slice(-10)}`, schema],
      );
      await dataSource.query(`CREATE SCHEMA ${q}`);
      await migrationDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(migrationDataSource);
      } finally {
        await migrationDataSource.destroy();
      }

      await dataSource.query(
        `INSERT INTO ${q}.party
          (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético')`,
        [partyId, encryptAes256Gcm('synthetic-party-document', ENCRYPTION_KEY)],
      );
      await dataSource.query(
        `INSERT INTO ${q}.subscribers
          (id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, email_encrypted,
           phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
         VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4,
           'Nombre sintético', 'Apellido sintético', 2, $5, $6, 'STANDARD', 'COMMON',
           'RESPONSABLE', 'Dirección sintética', $7)`,
        [
          subscriberId,
          tenantId,
          partyId,
          encryptAes256Gcm('synthetic-subscriber-document', ENCRYPTION_KEY),
          encryptAes256Gcm('synthetic-email', ENCRYPTION_KEY),
          encryptAes256Gcm('synthetic-phone', ENCRYPTION_KEY),
          actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.data_subject_requests
          (id, party_id, requester_kind, identity_verification_method, identity_verified_at,
           identity_verified_by, kind, "right", status, received_at, due_at, complete_at,
           erased_at, erasure_categories)
         VALUES ($1, $2, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $3,
           'CONSULTA', 'SUPRIMIR', 'RESUELTA', now(), CURRENT_DATE + 30, now(),
           now(), ARRAY['IDENTIFICACION']::text[])`,
        [requestId, partyId, actorId],
      );

      const contractId = randomUUID();
      await dataSource.query(
        `INSERT INTO ${q}.contracts (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,terminated_at,service_usage,installation_stratum) VALUES ($1,$2,$3,'synthetic-plan','{}','TERMINATED','2000-01-01','RESIDENTIAL',3)`,
        [contractId, tenantId, subscriberId],
      );
      const ticketId = randomUUID();
      await dataSource.query(
        `INSERT INTO ${q}.support_tickets (id,tenant_id,ticket_number,type,subject,requester_type,requester_ref_id,created_by_user_id) VALUES ($1,$2,'PQR-B7-CLI','PQR','Sonda CLI','SUBSCRIBER',$3,$4)`,
        [ticketId, tenantId, subscriberId, actorId],
      );
      await expect(
        anonymizeTitularInTenantSchema(dataSource, schema, requestId, [], false, KEYS, 'apply'),
      ).rejects.toThrow('deber de conservación');
      expect(
        await dataSource.query(`SELECT stratum FROM ${q}.subscribers WHERE id=$1`, [subscriberId]),
      ).toEqual([{ stratum: 2 }]);
      await dataSource.query(
        `INSERT INTO ${q}.ticket_pqr_records (ticket_id,tenant_id,deadline_type,deadline_at,notified_at,resolved_at) VALUES ($1,$2,'FINAL_RESOLUTION',now(),now()-interval '4 years',now()-interval '4 years')`,
        [ticketId, tenantId],
      );
      await anonymizeTitularInTenantSchema(dataSource, schema, requestId, [], false, KEYS, 'apply');
      await runInTenantSchema(dataSource, schema, async (qr) => {
        await qr.query("SELECT set_config('iwana.titular_erasure','on',true)");
        await qr.query('UPDATE subscribers SET stratum=1 WHERE id=$1', [subscriberId]);
        await qr.query('UPDATE contracts SET installation_stratum=1 WHERE id=$1', [contractId]);
      });
      const before = await verifyAnonymizedTenant(dataSource, schema, KEYS);
      expect(before.residualFields).toBeGreaterThan(0);
      expect(
        before.findings.flatMap((finding) => finding.tables.map((table) => table.table)),
      ).toEqual(expect.arrayContaining(['subscribers', 'contracts']));
      await anonymizeTitularInTenantSchema(dataSource, schema, requestId, [], false, KEYS, 'apply');
      expect((await verifyAnonymizedTenant(dataSource, schema, KEYS)).residualFields).toBe(0);
      expect(
        await dataSource.query(`SELECT stratum FROM ${q}.subscribers WHERE id=$1`, [subscriberId]),
      ).toEqual([{ stratum: null }]);
      expect(
        await dataSource.query(
          `SELECT installation_stratum,anonymized_at IS NOT NULL AS marked FROM ${q}.contracts WHERE id=$1`,
          [contractId],
        ),
      ).toEqual([{ installation_stratum: null, marked: true }]);
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
  }, 180_000);

  it('conserva evidencia de autorización no compartida y activa en el CLI', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    const mediaId = randomUUID();
    try {
      await dataSource.query(
        `INSERT INTO public.media_assets
          (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
         VALUES ($1, $2, 'privacy_evidence', 'fixture.bin', 'application/octet-stream',
           'bin', 1, $3)`,
        [mediaId, fixture.schema, `${fixture.schema}/privacy_evidence/${mediaId}.bin`],
      );
      await dataSource.query(
        `UPDATE ${q}.data_authorizations SET evidence_media_id = $1 WHERE party_id = $2`,
        [mediaId, fixture.partyId],
      );

      const result = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );

      expect(result).toMatchObject({ applied: true, verification: { activeMediaAssets: 0 } });
      expect(
        await dataSource.query(
          `SELECT deleted_at IS NOT NULL AS deleted FROM public.media_assets WHERE id = $1`,
          [mediaId],
        ),
      ).toEqual([{ deleted: false }]);
    } finally {
      await dataSource.query(`DELETE FROM public.media_assets WHERE id = $1`, [mediaId]);
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('mantiene activa la evidencia de autorización y sin cambios su fila al anonimizar por CLI', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    const mediaId = randomUUID();
    try {
      await dataSource.query(
        `INSERT INTO public.media_assets
          (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
         VALUES ($1, $2, 'privacy_evidence', 'fixture.bin', 'application/octet-stream',
           'bin', 1, $3)`,
        [mediaId, fixture.schema, `${fixture.schema}/privacy_evidence/${mediaId}.bin`],
      );
      await dataSource.query(
        `UPDATE ${q}.data_authorizations SET evidence_media_id = $1 WHERE party_id = $2`,
        [mediaId, fixture.partyId],
      );
      await dataSource.query(
        `CREATE TABLE ${q}.data_authorizations_snapshot AS
         SELECT * FROM ${q}.data_authorizations WHERE party_id = $1`,
        [fixture.partyId],
      );

      const result = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );

      expect(result.labels.privacyMediaAssets).toBe('conservada (prueba de autorización)');
      expect(result.totals.privacyMediaAssets).toBe(0);
      expect(result.changed.privacyMediaAssets).toBe(0);
      expect(
        await dataSource.query(
          `SELECT deleted_at IS NULL AS active FROM public.media_assets WHERE id = $1`,
          [mediaId],
        ),
      ).toEqual([{ active: true }]);
      expect(
        await dataSource.query(
          `SELECT NOT EXISTS (
             SELECT 1
               FROM ${q}.data_authorizations current_row
               FULL JOIN ${q}.data_authorizations_snapshot snapshot USING (id)
              WHERE (current_row.party_id = $1 OR snapshot.party_id = $1)
                AND to_jsonb(current_row) IS DISTINCT FROM to_jsonb(snapshot)
           ) AS unchanged`,
          [fixture.partyId],
        ),
      ).toEqual([{ unchanged: true }]);
    } finally {
      await dataSource.query(`DELETE FROM public.media_assets WHERE id = $1`, [mediaId]);
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('anonimiza ex-suscriptor con cuenta dada de baja y conserva la unicidad del email sintético', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      const linked = await insertSubscriberAndUser(dataSource, fixture, new Date());
      const result = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [],
        false,
        KEYS,
        'apply',
      );
      expect(result).toMatchObject({
        applied: true,
        totals: { subscribers: 1, users: 1 },
        changed: { users: 1 },
      });
      const user = (await dataSource.query(
        `SELECT email, email_hmac, first_name, last_name, phone, document_number
           FROM ${q}.users WHERE id = $1`,
        [linked.userId],
      )) as Array<Record<string, unknown>>;
      const anonymousEmail = `anon+${linked.userId}@anon.invalid`;
      expect(user[0]).toEqual({
        email: anonymousEmail,
        email_hmac: hmacPii(anonymousEmail, HASH_KEY),
        first_name: null,
        last_name: null,
        phone: null,
        document_number: null,
      });
      const subscriber = (await dataSource.query(
        `SELECT document_number_hmac, email_hmac, phone_hmac, whatsapp_hmac,
                email_encrypted, phone_encrypted, address
           FROM ${q}.subscribers WHERE id = $1`,
        [linked.subscriberId],
      )) as Array<Record<string, unknown>>;
      expect(subscriber[0]).toMatchObject({
        document_number_hmac: null,
        email_hmac: null,
        phone_hmac: null,
        whatsapp_hmac: null,
        address: 'ANONIMIZADO',
      });
      expect(decryptAes256Gcm(String(subscriber[0]?.['email_encrypted']), ENCRYPTION_KEY)).toBe(
        'ANONIMIZADO',
      );
      expect(decryptAes256Gcm(String(subscriber[0]?.['phone_encrypted']), ENCRYPTION_KEY)).toBe(
        'ANONIMIZADO',
      );
      expect(linked.email).not.toBe(anonymousEmail);

      const repeated = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [],
        false,
        KEYS,
        'apply',
      );
      expect(repeated.changed.users).toBe(0);
      expect(repeated.verification.residualFields).toBe(0);
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('aborta ex-suscriptor con cuenta activa sin cambiar filas', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      const linked = await insertSubscriberAndUser(dataSource, fixture, null);
      await expect(
        anonymizeTitularInTenantSchema(
          dataSource,
          fixture.schema,
          fixture.requestId,
          [],
          false,
          KEYS,
          'apply',
        ),
      ).rejects.toThrow('Hay 1 cuenta(s) enlazada(s) activa(s); no se aplicaron cambios.');
      expect(
        await dataSource.query(`SELECT email FROM ${q}.users WHERE id = $1`, [linked.userId]),
      ).toEqual([{ email: linked.email }]);
      expect(
        await dataSource.query(`SELECT display_name FROM ${q}.party WHERE id = $1`, [
          fixture.partyId,
        ]),
      ).toEqual([{ display_name: 'Titular sintético' }]);
      expect(
        await dataSource.query(`SELECT first_name FROM ${q}.subscribers WHERE id = $1`, [
          linked.subscriberId,
        ]),
      ).toEqual([{ first_name: 'Nombre sintético' }]);
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('aborta y revierte si potential_leads existe con filas', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      await dataSource.query(`INSERT INTO ${q}.potential_leads (id) VALUES ($1)`, [randomUUID()]);
      await expect(
        anonymizeTitularInTenantSchema(
          dataSource,
          fixture.schema,
          fixture.requestId,
          [fixture.expedienteId],
          false,
          KEYS,
          'apply',
        ),
      ).rejects.toThrow('potential_leads contiene 1 fila(s); no se aplicaron cambios.');
      expect(
        await dataSource.query(`SELECT full_name FROM ${q}.expediente_records WHERE id = $1`, [
          fixture.expedienteId,
        ]),
      ).toEqual([{ full_name: 'Prospecto sintético' }]);
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('sigue rechazando sin confirmación un expediente con HMAC ausente y datos personales residuales', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      await dataSource.query(
        `UPDATE ${q}.expediente_records SET document_number_hmac = NULL WHERE id = $1`,
        [fixture.expedienteId],
      );
      await expect(
        anonymizeTitularInTenantSchema(
          dataSource,
          fixture.schema,
          fixture.requestId,
          [fixture.expedienteId],
          false,
          KEYS,
          'apply',
        ),
      ).rejects.toThrow(
        '1 expediente(s) sin coincidencia HMAC; registra el motivo en el ticket y usa --confirm-unmatched.',
      );
      expect(
        await dataSource.query(
          `SELECT full_name, address FROM ${q}.expediente_records WHERE id = $1`,
          [fixture.expedienteId],
        ),
      ).toEqual([{ full_name: 'Prospecto sintético', address: 'Dirección sintética' }]);
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('anonimiza contratos y cotizaciones sin borrar el insumo ni claves no personales de snapshots', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    try {
      const linked = await insertSubscriberAndUser(dataSource, fixture, new Date());
      await dataSource.query(`
        CREATE TABLE ${q}.contracts (
          id uuid PRIMARY KEY,
          subscriber_id uuid NOT NULL,
          installation_address text,
          installation_postal_code text,
          installation_notes text,
          fiscal_name text,
          fiscal_document text,
          fiscal_address text,
          alias text,
          stratum_evidence_media_id uuid,
          fiscal_document_encrypted varchar(500),
          fiscal_document_hmac varchar(64),
          vat_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
          plan_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
          installation_city text,
          installation_department text,
          installation_stratum integer,
          service_usage text,
          customer_segment text,
          status text NOT NULL
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.quotes (
          id uuid PRIMARY KEY,
          subscriber_id uuid,
          expediente_id uuid,
          plan_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `);
      const contractId = randomUUID();
      const quoteBySubscriber = randomUUID();
      const quoteByExpediente = randomUUID();
      const mediaId = randomUUID();
      await dataSource.query(
        `INSERT INTO public.media_assets
          (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
         VALUES ($1, $2, 'stratum_evidence', 'fixture.bin', 'application/octet-stream',
           'bin', 1, $3)`,
        [mediaId, fixture.schema, `${fixture.schema}/stratum_evidence/${mediaId}.bin`],
      );
      await dataSource.query(
        `INSERT INTO ${q}.contracts
          (id, subscriber_id, installation_address, installation_postal_code,
           installation_notes, fiscal_name, fiscal_document, fiscal_address,
           fiscal_document_encrypted, fiscal_document_hmac, alias,
           stratum_evidence_media_id, vat_snapshot, plan_snapshot_json,
           installation_city, installation_department, installation_stratum,
           service_usage, customer_segment, status)
         VALUES ($1, $2, 'fixture-address', 'fixture-postal', 'fixture-notes',
           'fixture-fiscal-name', NULL, 'fixture-fiscal-address', $3, $4, 'fixture-alias',
           $5, $6::jsonb, $7::jsonb, 'fixture-city', 'fixture-department', 3,
           'RESIDENTIAL', 'STANDARD', 'ACTIVE')`,
        [
          contractId,
          linked.subscriberId,
          encryptAes256Gcm('synthetic-contract-fiscal-value', ENCRYPTION_KEY),
          hmacPii('SYNTHETICCONTRACTFISCALVALUE', HASH_KEY),
          mediaId,
          JSON.stringify({ fiscalName: 'remove', amount: 10 }),
          JSON.stringify({ plan: { name: 'remove', documentType: 'remove' } }),
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.quotes (id, subscriber_id, plan_snapshot_json)
         VALUES ($1, $2, $3::jsonb)`,
        [
          quoteBySubscriber,
          linked.subscriberId,
          JSON.stringify({ phonePrimary: 'remove', code: 'keep' }),
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.quotes (id, expediente_id, plan_snapshot_json)
         VALUES ($1, $2, $3::jsonb)`,
        [quoteByExpediente, fixture.expedienteId, JSON.stringify({ nested: { email: 'remove' } })],
      );

      const result = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );

      expect(result.applied).toBe(true);
      expect(
        await dataSource.query(
          `SELECT installation_address, installation_postal_code, installation_notes,
                fiscal_name, fiscal_document, fiscal_address,
                fiscal_document_encrypted, fiscal_document_hmac, alias,
                stratum_evidence_media_id, vat_snapshot, plan_snapshot_json,
                installation_city, installation_department, installation_stratum,
                service_usage, customer_segment, status
           FROM ${q}.contracts WHERE id = $1`,
          [contractId],
        ),
      ).toEqual([
        {
          installation_address: null,
          installation_postal_code: null,
          installation_notes: null,
          fiscal_name: null,
          fiscal_document: null,
          fiscal_address: null,
          fiscal_document_encrypted: null,
          fiscal_document_hmac: null,
          alias: 'ANONIMIZADO',
          stratum_evidence_media_id: mediaId,
          vat_snapshot: { amount: 10 },
          plan_snapshot_json: { plan: {} },
          installation_city: null,
          installation_department: null,
          installation_stratum: null,
          service_usage: 'RESIDENTIAL',
          customer_segment: 'STANDARD',
          status: 'ACTIVE',
        },
      ]);
      const quotes = (await dataSource.query(
        `SELECT id, plan_snapshot_json FROM ${q}.quotes`,
      )) as Array<{ id: string; plan_snapshot_json: Record<string, unknown> }>;
      expect(quotes).toHaveLength(2);
      expect(quotes.find((quote) => quote.id === quoteBySubscriber)?.plan_snapshot_json).toEqual({
        code: 'keep',
      });
      expect(quotes.find((quote) => quote.id === quoteByExpediente)?.plan_snapshot_json).toEqual({
        nested: {},
      });
      expect(await dataSource.query(`SELECT COUNT(*)::int AS count FROM ${q}.contracts`)).toEqual([
        { count: 1 },
      ]);
      expect(await dataSource.query(`SELECT COUNT(*)::int AS count FROM ${q}.quotes`)).toEqual([
        { count: 2 },
      ]);
      expect(
        await dataSource.query(
          `SELECT deleted_at IS NOT NULL AS deleted FROM public.media_assets WHERE id = $1`,
          [mediaId],
        ),
      ).toEqual([{ deleted: true }]);
    } finally {
      await dataSource.query(`DELETE FROM public.media_assets WHERE tenant_schema = $1`, [
        fixture.schema,
      ]);
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  it('recorre la cadena de WFM y tasks y conserva sus relaciones operativas', async () => {
    const fixture = await createFixture(dataSource);
    const q = quoteIdentifier(fixture.schema);
    const linked = await insertSubscriberAndUser(dataSource, fixture, new Date());
    const visitId = randomUUID();
    const scheduleId = randomUUID();
    const workOrderId = randomUUID();
    const workOrderTaskId = randomUUID();
    const executionOrderId = randomUUID();
    const operationalTaskId = randomUUID();
    const crmTaskId = randomUUID();
    const mediaId = randomUUID();
    try {
      await dataSource.query(`
        CREATE TABLE ${q}.visit_requests (
          id uuid PRIMARY KEY, expediente_id uuid, subscriber_id uuid,
          title varchar(160) NOT NULL, description text, origin_label varchar(160),
          address text, municipality text, sector text, latitude numeric, longitude numeric,
          cancel_reason varchar(200), additional_reason text, origin_context text,
          origin_ref varchar(160), schedule_event_id uuid, work_order_id uuid,
          execution_order_id uuid
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.schedule_events (
          id uuid PRIMARY KEY, expediente_id uuid, subscriber_id uuid,
          title varchar(160) NOT NULL, description text, address text,
          municipality text, sector text, latitude numeric, longitude numeric,
          failure_reason text, review_notes text, work_order_id uuid, execution_order_id uuid
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.work_orders (
          id uuid PRIMARY KEY, source_context text, source_ref varchar(160),
          scheduled_event_id uuid, summary varchar(200) NOT NULL, notes text
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.work_order_tasks (
          id uuid PRIMARY KEY, work_order_id uuid, title varchar(160) NOT NULL,
          description text, result_notes text
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.schedule_reschedule_logs (
          id uuid PRIMARY KEY, schedule_event_id uuid, notes text, reason varchar(160)
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.execution_orders (
          id uuid PRIMARY KEY, visit_request_id uuid, schedule_event_id uuid,
          subscriber_id varchar(160), customer_display_label varchar(200) NOT NULL,
          work_summary varchar(200) NOT NULL, service_address text, municipality text,
          sector text, work_instructions text, close_notes text, template_label text,
          template_requirements_snapshot jsonb NOT NULL, task_id uuid
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.execution_order_activities (
          id uuid PRIMARY KEY, execution_order_id uuid, description text NOT NULL
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.execution_order_evidence (
          id uuid PRIMARY KEY, execution_order_id uuid, notes text,
          file_name varchar(200), media_asset_id uuid
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.execution_order_status_transitions (
          id uuid PRIMARY KEY, execution_order_id uuid, reason varchar(255), changed_by uuid
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.operational_tasks (
          id uuid PRIMARY KEY, origin_context text, origin_ref_id varchar(160),
          recipient_type varchar(30), recipient_ref_id varchar(160), schedule_event_id uuid,
          work_order_id uuid, title varchar(200) NOT NULL, description text, recipient_label varchar(160)
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.task_timeline_events (
          id uuid PRIMARY KEY, task_id uuid, payload jsonb NOT NULL
        )
      `);
      await dataSource.query(`
        CREATE TABLE ${q}.task_assignment_history (
          id uuid PRIMARY KEY, task_id uuid, reason varchar(500)
        )
      `);
      await dataSource.query(
        `INSERT INTO public.media_assets
          (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
         VALUES ($1, $2, 'execution_evidence', 'fixture.bin', 'application/octet-stream',
           'bin', 1, $3)`,
        [mediaId, fixture.schema, `${fixture.schema}/execution_evidence/${mediaId}.bin`],
      );
      await dataSource.query(
        `INSERT INTO ${q}.visit_requests
          (id, expediente_id, subscriber_id, title, description, origin_label, address,
           municipality, sector, latitude, longitude, cancel_reason, additional_reason,
           origin_context, origin_ref, schedule_event_id, work_order_id, execution_order_id)
         VALUES ($1, $2, $3, 'fixture-visit', 'fixture-description', 'fixture-origin',
           'fixture-address', 'fixture-city', 'fixture-sector', 1, 2, 'fixture-cancel',
           'fixture-additional', 'TASKS', $4, $5, $6, $7)`,
        [
          visitId,
          fixture.expedienteId,
          linked.subscriberId,
          operationalTaskId,
          scheduleId,
          workOrderId,
          executionOrderId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.schedule_events
          (id, expediente_id, subscriber_id, title, description, address, municipality,
           sector, latitude, longitude, failure_reason, review_notes, work_order_id, execution_order_id)
         VALUES ($1, $2, $3, 'fixture-event', 'fixture-description', 'fixture-address',
           'fixture-city', 'fixture-sector', 1, 2, 'fixture-failure', 'fixture-review', $4, $5)`,
        [scheduleId, fixture.expedienteId, linked.subscriberId, workOrderId, executionOrderId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.work_orders
          (id, source_context, source_ref, scheduled_event_id, summary, notes)
         VALUES ($1, 'CRM', $2, $3, 'fixture-summary', 'fixture-notes')`,
        [workOrderId, fixture.expedienteId, scheduleId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.work_order_tasks (id, work_order_id, title, description, result_notes)
         VALUES ($1, $2, 'fixture-task', 'fixture-description', 'fixture-result')`,
        [workOrderTaskId, workOrderId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.schedule_reschedule_logs (id, schedule_event_id, notes, reason)
         VALUES ($1, $2, 'fixture-notes', 'OPERATIONAL_REASON')`,
        [randomUUID(), scheduleId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_orders
          (id, visit_request_id, schedule_event_id, subscriber_id, customer_display_label,
           work_summary, service_address, municipality, sector, work_instructions, close_notes,
           template_label, template_requirements_snapshot, task_id)
         VALUES ($1, $2, $3, $4, 'fixture-customer', 'fixture-work', 'fixture-address',
           'fixture-city', 'fixture-sector', 'fixture-instructions', 'fixture-close',
           'fixture-template', $5::jsonb, $6)`,
        [
          executionOrderId,
          visitId,
          scheduleId,
          linked.subscriberId,
          JSON.stringify({ privateNote: 'remove' }),
          operationalTaskId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_activities (id, execution_order_id, description)
         VALUES ($1, $2, 'fixture-activity')`,
        [randomUUID(), executionOrderId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_evidence
          (id, execution_order_id, notes, file_name, media_asset_id)
         VALUES ($1, $2, 'fixture-evidence-notes', 'fixture-file', $3)`,
        [randomUUID(), executionOrderId, mediaId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_status_transitions (id, execution_order_id, reason)
         VALUES ($1, $2, 'fixture-transition-reason')`,
        [randomUUID(), executionOrderId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.operational_tasks
          (id, origin_context, origin_ref_id, recipient_type, recipient_ref_id,
           schedule_event_id, work_order_id, title, description, recipient_label)
         VALUES
          ($1, 'TASKS', 'fixture-origin', NULL, NULL, NULL, NULL,
           'fixture-task-title', 'fixture-task-description', 'fixture-recipient'),
          ($2, 'CRM', $3, 'SUBSCRIBER', $4, $5, $6,
           'fixture-crm-task', 'fixture-task-description', 'fixture-recipient')`,
        [
          operationalTaskId,
          crmTaskId,
          fixture.expedienteId,
          linked.subscriberId,
          scheduleId,
          workOrderId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.task_timeline_events (id, task_id, payload)
         VALUES ($1, $2, $3::jsonb)`,
        [randomUUID(), operationalTaskId, JSON.stringify({ description: 'fixture-timeline' })],
      );
      await dataSource.query(
        `INSERT INTO ${q}.task_assignment_history (id, task_id, reason)
         VALUES ($1, $2, 'fixture-assignment-reason')`,
        [randomUUID(), operationalTaskId],
      );

      const result = await anonymizeTitularInTenantSchema(
        dataSource,
        fixture.schema,
        fixture.requestId,
        [fixture.expedienteId],
        false,
        KEYS,
        'apply',
      );

      expect(result).toMatchObject({
        applied: true,
        totals: { visitRequests: 1, scheduleEvents: 1, executionOrders: 1 },
        changed: { visitRequests: 1, scheduleEvents: 1, executionOrders: 1 },
        verification: { residualFields: 0, activeMediaAssets: 0 },
      });
      expect(
        await dataSource.query(
          `SELECT title, description, origin_label, address, municipality, sector,
                latitude, longitude, cancel_reason, additional_reason
           FROM ${q}.visit_requests WHERE id = $1`,
          [visitId],
        ),
      ).toEqual([
        {
          title: 'ANONIMIZADO',
          description: null,
          origin_label: null,
          address: null,
          municipality: null,
          sector: null,
          latitude: null,
          longitude: null,
          cancel_reason: null,
          additional_reason: null,
        },
      ]);
      expect(
        await dataSource.query(
          `SELECT title, description, address, municipality, sector, latitude, longitude,
                failure_reason, review_notes FROM ${q}.schedule_events WHERE id = $1`,
          [scheduleId],
        ),
      ).toEqual([
        {
          title: 'ANONIMIZADO',
          description: null,
          address: null,
          municipality: null,
          sector: null,
          latitude: null,
          longitude: null,
          failure_reason: null,
          review_notes: null,
        },
      ]);
      expect(
        await dataSource.query(`SELECT summary, notes FROM ${q}.work_orders WHERE id = $1`, [
          workOrderId,
        ]),
      ).toEqual([{ summary: 'ANONIMIZADO', notes: null }]);
      expect(
        await dataSource.query(
          `SELECT title, description, result_notes FROM ${q}.work_order_tasks WHERE id = $1`,
          [workOrderTaskId],
        ),
      ).toEqual([{ title: 'ANONIMIZADO', description: null, result_notes: null }]);
      expect(
        await dataSource.query(`SELECT reason, notes FROM ${q}.schedule_reschedule_logs`),
      ).toEqual([{ reason: 'ANONIMIZADO', notes: null }]);
      expect(
        await dataSource.query(
          `SELECT customer_display_label, work_summary, service_address, municipality, sector,
                work_instructions, close_notes, template_label, template_requirements_snapshot
           FROM ${q}.execution_orders WHERE id = $1`,
          [executionOrderId],
        ),
      ).toEqual([
        {
          customer_display_label: 'ANONIMIZADO',
          work_summary: 'ANONIMIZADO',
          service_address: null,
          municipality: null,
          sector: null,
          work_instructions: null,
          close_notes: null,
          template_label: null,
          template_requirements_snapshot: {},
        },
      ]);
      expect(
        await dataSource.query(`SELECT description FROM ${q}.execution_order_activities`),
      ).toEqual([{ description: 'ANONIMIZADO' }]);
      expect(
        await dataSource.query(`SELECT notes, file_name FROM ${q}.execution_order_evidence`),
      ).toEqual([{ notes: null, file_name: null }]);
      expect(
        await dataSource.query(`SELECT reason FROM ${q}.execution_order_status_transitions`),
      ).toEqual([{ reason: null }]);
      expect(
        await dataSource.query(
          `SELECT id, title, description, recipient_label FROM ${q}.operational_tasks`,
        ),
      ).toEqual(
        expect.arrayContaining([
          { id: operationalTaskId, title: 'ANONIMIZADO', description: null, recipient_label: null },
          { id: crmTaskId, title: 'ANONIMIZADO', description: null, recipient_label: null },
        ]),
      );
      expect(await dataSource.query(`SELECT payload FROM ${q}.task_timeline_events`)).toEqual([
        { payload: {} },
      ]);
      expect(await dataSource.query(`SELECT reason FROM ${q}.task_assignment_history`)).toEqual([
        { reason: null },
      ]);
      expect(
        await dataSource.query(
          `SELECT deleted_at IS NOT NULL AS deleted FROM public.media_assets WHERE id = $1`,
          [mediaId],
        ),
      ).toEqual([{ deleted: true }]);
    } finally {
      await dataSource.query(`DELETE FROM public.media_assets WHERE id = $1`, [mediaId]);
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE schema_name = $1', [fixture.schema]);
    }
  });

  // CA-K2A-06 (D-K2A-5): remediación de una marca anterior a la 176, cifrada con clave retirada.
  it('el verificador reporta la marca antigua, el CLI la deja en NULL y K2 verifica en 0', async () => {
    await withLegacyMarkerTitular(
      RETIRED_ENCRYPTION_KEY,
      async ({ schema, requestId, subscriberId, readDocument, runK2 }) => {
        const before = await verifyAnonymizedTenant(dataSource, schema, KEYS);
        expect(before.findings).toEqual([
          {
            titularIds: [subscriberId],
            residualFields: 1,
            tables: [{ table: 'subscribers', residualFields: 1 }],
          },
        ]);
        const dryRunBefore = await runK2('dry-run');
        expect(dryRunBefore.totals.writeBlocked).toBe(1);
        expect(dryRunBefore.hasBlockingIssues).toBe(true);

        // P2 de seguridad: la salida no lleva ids; las solicitudes solo se piden aparte.
        expect(JSON.stringify(toVerificationOutput(before))).not.toContain(subscriberId);
        expect(await listFindingRequestIds(dataSource, schema, before)).toEqual([requestId]);

        const report = await anonymizeTitularInTenantSchema(
          dataSource,
          schema,
          requestId,
          [],
          false,
          KEYS,
          'apply',
        );
        expect(report.verification.residualFields).toBe(0);
        expect(await readDocument()).toBeNull();

        const after = await verifyAnonymizedTenant(dataSource, schema, KEYS);
        expect(after.residualFields).toBe(0);
        expect(after.findings).toEqual([]);

        const dryRunAfter = await runK2('dry-run');
        expect(dryRunAfter.totals.writeBlocked).toBe(0);
        expect(dryRunAfter.hasBlockingIssues).toBe(false);
        const verification = await runK2('verify-pii-only');
        expect(verification.hasBlockingIssues).toBe(false);
        expect(verification.totals.pending).toBe(0);
        expect(verification.totals.piiPreviousRemaining).toBe(0);

        await expect(
          runInTenantSchema(dataSource, schema, (queryRunner) =>
            queryRunner.query('UPDATE subscribers SET updated_at = now() WHERE id = $1', [
              subscriberId,
            ]),
          ),
        ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: '55000' }) });
      },
    );
  }, 180_000);

  // CA-K2A-13 (D-K2A-6, «Límite»): K2 no ve esta marca; bloquearía la siguiente rotación.
  it('una marca ya cifrada con la clave activa pasa K2 y solo el verificador la delata', async () => {
    await withLegacyMarkerTitular(
      ENCRYPTION_KEY,
      async ({ schema, subscriberId, readDocument, runK2 }) => {
        const marker = await readDocument();
        expect(marker).toEqual(expect.any(String));

        const dryRun = await runK2('dry-run');
        expect(dryRun.totals.writeBlocked).toBe(0);
        expect(dryRun.hasBlockingIssues).toBe(false);
        expect(
          dryRun.targets.find(
            ({ entityType }) => entityType === 'subscriber.documentNumberEncrypted',
          ),
        ).toMatchObject({ candidates: 1, skippedAlreadyPii: 1, reencrypted: 0, writeBlocked: 0 });

        const verification = await runK2('verify-pii-only');
        expect(verification.hasBlockingIssues).toBe(false);
        expect(verification.totals.pending).toBe(0);
        expect(verification.totals.piiPreviousRemaining).toBe(0);

        const residuals = await verifyAnonymizedTenant(dataSource, schema, KEYS);
        expect(residuals.findings).toEqual([
          {
            titularIds: [subscriberId],
            residualFields: 1,
            tables: [{ table: 'subscribers', residualFields: 1 }],
          },
        ]);
        expect(await readDocument()).toBe(marker);

        // P2 de seguridad: la lectura de la verificación nunca confirma.
        const tenantName = async () =>
          (
            (await dataSource.query('SELECT name FROM public.tenants WHERE schema_name = $1', [
              schema,
            ])) as Array<{ name: string }>
          )[0]?.name;
        const nameBefore = await tenantName();
        await expect(
          runRolledBackInTenantSchema(dataSource, schema, async (queryRunner) => {
            await queryRunner.query(
              `UPDATE public.tenants SET name = name || '-x' WHERE schema_name = $1`,
              [schema],
            );
            return 'leído';
          }),
        ).resolves.toBe('leído');
        expect(await tenantName()).toBe(nameBefore);
      },
    );
  }, 180_000);
});
