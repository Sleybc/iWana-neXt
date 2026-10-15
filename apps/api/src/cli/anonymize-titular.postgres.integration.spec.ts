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
      full_name varchar(160) NOT NULL,
      address varchar(255),
      document_supports jsonb NOT NULL,
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
       full_name, address, document_supports)
     VALUES ($1, $2, $3, $4, 'Prospecto sintético', 'Dirección sintética', $5::jsonb)`,
    [
      expedienteId,
      documentHmac,
      encryptAes256Gcm('synthetic-document-value', ENCRYPTION_KEY),
      'a'.repeat(64),
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
                document_number_hash, address, document_supports
           FROM ${q}.expediente_records WHERE id = $1`,
        [fixture.expedienteId],
      )) as Array<Record<string, unknown>>;
      expect(expediente[0]).toMatchObject({
        full_name: 'ANONIMIZADO',
        document_number_encrypted: null,
        document_number_hmac: null,
        address: null,
        document_supports: {},
      });
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
});
