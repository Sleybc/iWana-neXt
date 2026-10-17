import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { decryptAes256Gcm, encryptAes256Gcm } from '../common/crypto/aes-gcm.util';
import { hmacPii } from '../common/crypto/pii-hash-key.util';
import { anonymizeTitularInTenantSchema } from './anonymize-titular';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const HASH_KEY = Buffer.from('26'.repeat(32), 'hex');
const ENCRYPTION_KEY = Buffer.from('37'.repeat(32), 'hex');
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
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
    } finally {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
    }
  });

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
          installation_city: 'fixture-city',
          installation_department: 'fixture-department',
          installation_stratum: 3,
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
      ).toEqual([{ reason: 'OPERATIONAL_REASON', notes: null }]);
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
    }
  });
});
