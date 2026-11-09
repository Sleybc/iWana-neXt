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
  tenantId: string;
  requestId: string;
  partyId: string;
  expedienteId: string;
  documentHmac: string;
  actorId: string;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Esquema propio con la cadena tenant vigente (`applyTenantMigrationsInOrder`); antes se
 * creaba con DDL a mano. Solo `potential_leads` se crea a mano: la cadena no la tiene y el CLI
 * la vigila como tabla heredada.
 */
async function createFixture(
  dataSource: DataSource,
  options: { authorizationEvidenceMediaId?: string } = {},
): Promise<Fixture> {
  const schema = `tenant_anonymize_${randomBytes(5).toString('hex')}`;
  const tenantId = randomUUID();
  const requestId = randomUUID();
  const partyId = randomUUID();
  const expedienteId = randomUUID();
  const actorId = randomUUID();
  const documentHmac = hmacPii(`synthetic-document-${randomUUID()}`, HASH_KEY);
  const q = quoteIdentifier(schema);

  // La migración 092 exige un tenant canónico en public.tenants para su esquema.
  await dataSource.query(
    `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
     VALUES ($1, $2, $2, $3, 'ACTIVE', 'ci-tenant@example.invalid')`,
    [tenantId, `anonymize-${schema.slice(-10)}`, schema],
  );
  await dataSource.query(`CREATE SCHEMA ${q}`);
  const migrationDataSource = createTenantDataSource(dataSource, schema, `anonymize-${schema}`);
  await migrationDataSource.initialize();
  try {
    await applyTenantMigrationsInOrder(migrationDataSource);
  } finally {
    await migrationDataSource.destroy();
  }

  // Solo de prueba: ninguna migración tenant crea potential_leads; el CLI la bloquea y cuenta
  // si existe (tabla heredada), y una prueba siembra una fila para que aborte.
  await dataSource.query(`CREATE TABLE ${q}.potential_leads (id uuid PRIMARY KEY)`);

  await dataSource.query(
    `INSERT INTO ${q}.party
      (id, party_type, document_type, document_number, document_number_hmac, verification_digit,
       display_name, legal_name, birth_date, notes, address, city, department)
     VALUES ($1, 'NATURAL', 'CC', $2, $3, '7', 'Titular sintético', 'Razón sintética', '1980-01-01',
       'nota sintética', 'Calle sintética', 'Bogotá', 'Cundinamarca')`,
    [partyId, encryptAes256Gcm('synthetic-document-value', ENCRYPTION_KEY), documentHmac],
  );
  await dataSource.query(
    `INSERT INTO ${q}.data_subject_requests
      (id, party_id, requester_document_hmac, requester_evidence_media_id, response_text,
       requester_kind, identity_verification_method, identity_verified_at, identity_verified_by,
       kind, "right", status, received_at, due_at, complete_at, erased_at, erasure_categories)
     VALUES ($1, $2, $3, NULL, $4, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $5,
       'CONSULTA', 'SUPRIMIR', 'RESUELTA', now(), CURRENT_DATE + 30, now(),
       now(), ARRAY['IDENTIFICACION']::text[])`,
    [requestId, partyId, documentHmac, 'synthetic request evidence must remain untouched', actorId],
  );
  // data_authorizations es de solo anexar (146): la evidencia se fija al insertar, no después.
  await dataSource.query(
    `INSERT INTO ${q}.data_authorizations
      (id, party_id, evidence_media_id, purpose, kind, granted, channel)
     VALUES ($1, $2, $3, 'TRATAMIENTO_CONTRACTUAL', 'GRANT', true, 'PRESENCIAL')`,
    [randomUUID(), partyId, options.authorizationEvidenceMediaId ?? null],
  );
  await dataSource.query(
    `INSERT INTO ${q}.audit_logs (id, tenant_id, action, entity_type, entity_id)
     VALUES ($1, $2, $3, 'synthetic', 'synthetic')`,
    [randomUUID(), tenantId, 'synthetic audit row'],
  );
  await dataSource.query(
    `INSERT INTO ${q}.expediente_records
      (id, tenant_id, created_by, document_number_hmac, document_number_encrypted,
       document_number_hash, fiscal_document, fiscal_document_encrypted, fiscal_document_hmac,
       full_name, address, document_supports)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'Prospecto sintético', 'Dirección sintética',
       $9::jsonb)`,
    [
      expedienteId,
      tenantId,
      actorId,
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
      (id, party_id, type, value, value_encrypted, value_hmac, metadata, is_primary)
     VALUES ($1, $2, 'EMAIL', 'synthetic@example.invalid', $3, $4, $5::jsonb, true)`,
    [
      randomUUID(),
      partyId,
      encryptAes256Gcm('synthetic@example.invalid', ENCRYPTION_KEY),
      hmacPii('synthetic@example.invalid', HASH_KEY),
      JSON.stringify({ label: 'synthetic' }),
    ],
  );
  return { schema, tenantId, requestId, partyId, expedienteId, documentHmac, actorId };
}

/**
 * Deja un residuo en un expediente ya anonimizado. La 169 (endurecida por la 178) impide esa
 * escritura incluso con el GUC de supresión, así que se siembra como dueño con el trigger
 * desactivado dentro de la transacción (patrón CA-K2A-06).
 */
async function seedResidualOnAnonymizedExpediente(
  dataSource: DataSource,
  fixture: Fixture,
  fullName: string,
): Promise<void> {
  await runInTenantSchema(dataSource, fixture.schema, async (queryRunner) => {
    await queryRunner.query(
      'ALTER TABLE expediente_records DISABLE TRIGGER trg_expediente_records_prevent_anonymized_mutation',
    );
    await queryRunner.query('UPDATE expediente_records SET full_name = $2 WHERE id = $1', [
      fixture.expedienteId,
      fullName,
    ]);
    await queryRunner.query(
      'ALTER TABLE expediente_records ENABLE TRIGGER trg_expediente_records_prevent_anonymized_mutation',
    );
  });
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
      (id, tenant_id, role, password_hash, email, email_hmac, email_hash, first_name, last_name,
       phone, job_title, document_type, document_number, avatar_url, deleted_at)
     VALUES ($1, $6, 'SUBSCRIBER', 'synthetic-password-hash', $2, $3, $4, 'Nombre sintético',
       'Apellido sintético', '+570000000000', 'Cargo sintético', 'CC', '00000000',
       'https://example.invalid/avatar', $5)`,
    [userId, email, hmacPii(email, HASH_KEY), 'b'.repeat(64), accountDeletedAt, fixture.tenantId],
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
       external_id, status, tenant_id, person_type, customer_segment, vat_treatment,
       stratum, created_by)
     VALUES ($1, $2, $3, 'CC', $4, $5, $6, $7, $8, $9, $10,
       'Nombre sintético', 'Apellido sintético', '1980-01-01', '00000000', '0',
       'Empresa sintética', 'Comercial sintético', $11, $12, 'Contacto sintético',
       $13, '0000000000', $14, $15, 'Dirección sintética', 'Barrio sintético',
       'Bogotá', 'Cundinamarca', '000000', 4.5, -74.1, 'Motivo sintético',
       'ID externo sintético', 'CANCELLED', $16, 'NATURAL', 'RESIDENTIAL', 'STANDARD',
       2, $17)`,
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
      fixture.tenantId,
      fixture.actorId,
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

      await seedResidualOnAnonymizedExpediente(
        dataSource,
        fixture,
        'residuo sintetico de remediacion',
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
          (id, party_id, requester_document_hmac, requester_evidence_media_id, response_text,
           requester_kind, kind, "right", status, received_at, due_at)
         VALUES ($1, NULL, NULL, NULL, 'solicitud sintetica sin alcance',
           'TITULAR', 'CONSULTA', 'SUPRIMIR', 'RADICADA', now(), CURRENT_DATE + 30)`,
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
        `INSERT INTO ${q}.contact_attempts
          (id, tenant_id, expediente_id, notes, channel, result, advisor_id)
         VALUES ($1, $4, $2, $3, 'PHONE', 'NO_ANSWER', $5)`,
        [
          randomUUID(),
          fixture.expedienteId,
          'nota de contacto sintética',
          fixture.tenantId,
          fixture.actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.consent_records
          (id, tenant_id, expediente_id, ip_address, evidence_ref, revoked_reason,
           consent_type, status, channel, legal_text_version)
         VALUES ($1, $3, $2, '192.0.2.4', 'synthetic-evidence', 'motivo sintético',
           'DATA_PROCESSING', 'REVOKED', 'PHONE', 'v-synthetic')`,
        [randomUUID(), fixture.expedienteId, fixture.tenantId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.coverage_checks
          (id, tenant_id, expediente_id, latitude, longitude, address_used, snapshot_json,
           result, checked_by)
         VALUES ($1, $4, $2, 4.5, -74.1, 'dirección sintética', $3::jsonb, 'COVERED', $5)`,
        [
          randomUUID(),
          fixture.expedienteId,
          JSON.stringify({ address: 'synthetic' }),
          fixture.tenantId,
          fixture.actorId,
        ],
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
      // La semilla fija un hash heredado ('a' x 64). La cadena lo crea anulable (087) y la regla
      // `legacy-hash` lo borra a NULL; el marcador solo existiría en un esquema NOT NULL que la
      // cadena nunca tuvo (spec K2 D-K2A-1).
      expect(expediente[0]?.['document_number_hash']).toBeNull();
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

      await seedResidualOnAnonymizedExpediente(dataSource, fixture, 'synthetic residual fixture');
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
      // Estado heredado anterior a la 177: la 178 ya no deja escribirlo ni con el GUC, así que
      // se siembra como dueño con el trigger desactivado dentro de la transacción (patrón CA-K2A-06).
      await runInTenantSchema(dataSource, schema, async (qr) => {
        await qr.query(
          'ALTER TABLE subscribers DISABLE TRIGGER trg_subscribers_prevent_anonymized_mutation',
        );
        await qr.query(
          'ALTER TABLE contracts DISABLE TRIGGER trg_contracts_prevent_anonymized_mutation',
        );
        await qr.query('UPDATE subscribers SET stratum=1 WHERE id=$1', [subscriberId]);
        await qr.query('UPDATE contracts SET installation_stratum=1 WHERE id=$1', [contractId]);
        await qr.query(
          'ALTER TABLE subscribers ENABLE TRIGGER trg_subscribers_prevent_anonymized_mutation',
        );
        await qr.query(
          'ALTER TABLE contracts ENABLE TRIGGER trg_contracts_prevent_anonymized_mutation',
        );
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
    const mediaId = randomUUID();
    // data_authorizations es de solo anexar (146): la evidencia entra con la fila.
    const fixture = await createFixture(dataSource, { authorizationEvidenceMediaId: mediaId });
    const q = quoteIdentifier(fixture.schema);
    try {
      await dataSource.query(
        `INSERT INTO public.media_assets
          (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
         VALUES ($1, $2, 'privacy_evidence', 'fixture.bin', 'application/octet-stream',
           'bin', 1, $3)`,
        [mediaId, fixture.schema, `${fixture.schema}/privacy_evidence/${mediaId}.bin`],
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
    const mediaId = randomUUID();
    // data_authorizations es de solo anexar (146): la evidencia entra con la fila.
    const fixture = await createFixture(dataSource, { authorizationEvidenceMediaId: mediaId });
    const q = quoteIdentifier(fixture.schema);
    try {
      await dataSource.query(
        `INSERT INTO public.media_assets
          (id, tenant_schema, usage, original_filename, mime_type, ext, size_bytes, object_key)
         VALUES ($1, $2, 'privacy_evidence', 'fixture.bin', 'application/octet-stream',
           'bin', 1, $3)`,
        [mediaId, fixture.schema, `${fixture.schema}/privacy_evidence/${mediaId}.bin`],
      );
      // Solo de prueba: copia de la fila previa para comparar; no existe en la cadena.
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
      // La semilla cifra correo y teléfono. Desde la 148 ambas columnas admiten NULL y la regla
      // `null` las borra; el marcador cifrado solo aplicaría a un esquema previo a la 148.
      expect(subscriber[0]?.['email_encrypted']).toBeNull();
      expect(subscriber[0]?.['phone_encrypted']).toBeNull();
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
           service_usage, customer_segment, status, tenant_id, plan_id)
         VALUES ($1, $2, 'fixture-address', 'fixture-postal', 'fixture-notes',
           'fixture-fiscal-name', NULL, 'fixture-fiscal-address', $3, $4, 'fixture-alias',
           $5, $6::jsonb, $7::jsonb, 'fixture-city', 'fixture-department', 3,
           'RESIDENTIAL', 'STANDARD', 'ACTIVE', $8, 'synthetic-plan')`,
        [
          contractId,
          linked.subscriberId,
          encryptAes256Gcm('synthetic-contract-fiscal-value', ENCRYPTION_KEY),
          hmacPii('SYNTHETICCONTRACTFISCALVALUE', HASH_KEY),
          mediaId,
          JSON.stringify({ fiscalName: 'remove', amount: 10 }),
          JSON.stringify({ plan: { name: 'remove', documentType: 'remove' } }),
          fixture.tenantId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.quotes
          (id, subscriber_id, plan_snapshot_json, tenant_id, plan_id, monthly_amount)
         VALUES ($1, $2, $3::jsonb, $4, 'synthetic-plan', 0)`,
        [
          quoteBySubscriber,
          linked.subscriberId,
          JSON.stringify({ phonePrimary: 'remove', code: 'keep' }),
          fixture.tenantId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.quotes
          (id, expediente_id, plan_snapshot_json, tenant_id, plan_id, monthly_amount)
         VALUES ($1, $2, $3::jsonb, $4, 'synthetic-plan', 0)`,
        [
          quoteByExpediente,
          fixture.expedienteId,
          JSON.stringify({ nested: { email: 'remove' } }),
          fixture.tenantId,
        ],
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
      // Tablas de la cadena (WFM 0xx, tasks 045 y órdenes de ejecución): se completan sus NOT NULL
      // con valores neutros que no participan en el alcance de la supresión.
      const tenantId = fixture.tenantId;
      const actorId = fixture.actorId;
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
           origin_context, origin_ref, schedule_event_id, work_order_id, execution_order_id,
           tenant_id, status, work_type, priority, requested_by_user_id)
         VALUES ($1, $2, $3, 'fixture-visit', 'fixture-description', 'fixture-origin',
           'fixture-address', 'fixture-city', 'fixture-sector', 1, 2, 'fixture-cancel',
           'fixture-additional', 'TASKS', $4, $5, $6, $7,
           $8, 'SCHEDULED', 'INSTALLATION', 'NORMAL', $9)`,
        [
          visitId,
          fixture.expedienteId,
          linked.subscriberId,
          operationalTaskId,
          scheduleId,
          workOrderId,
          executionOrderId,
          tenantId,
          actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.schedule_events
          (id, expediente_id, subscriber_id, title, description, address, municipality,
           sector, latitude, longitude, failure_reason, review_notes, work_order_id, execution_order_id,
           tenant_id, type, scheduled_start_at, scheduled_end_at, assigned_user_id, created_by)
         VALUES ($1, $2, $3, 'fixture-event', 'fixture-description', 'fixture-address',
           'fixture-city', 'fixture-sector', 1, 2, 'fixture-failure', 'fixture-review', $4, $5,
           $6, 'INSTALLATION', now(), now() + interval '1 hour', $7, $7)`,
        [
          scheduleId,
          fixture.expedienteId,
          linked.subscriberId,
          workOrderId,
          executionOrderId,
          tenantId,
          actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.work_orders
          (id, source_context, source_ref, scheduled_event_id, summary, notes,
           tenant_id, code, type, assigned_user_id, created_by)
         VALUES ($1, 'CRM', $2, $3, 'fixture-summary', 'fixture-notes',
           $4, 'WO-FIXTURE-1', 'INSTALLATION', $5, $5)`,
        [workOrderId, fixture.expedienteId, scheduleId, tenantId, actorId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.work_order_tasks
          (id, work_order_id, title, description, result_notes, tenant_id)
         VALUES ($1, $2, 'fixture-task', 'fixture-description', 'fixture-result', $3)`,
        [workOrderTaskId, workOrderId, tenantId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.schedule_reschedule_logs
          (id, schedule_event_id, notes, reason, tenant_id, from_start_at, from_end_at,
           to_start_at, to_end_at, changed_by)
         VALUES ($1, $2, 'fixture-notes', 'OPERATIONAL_REASON', $3, now(), now(), now(), now(), $4)`,
        [randomUUID(), scheduleId, tenantId, actorId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_orders
          (id, visit_request_id, schedule_event_id, subscriber_id, customer_display_label,
           work_summary, service_address, municipality, sector, work_instructions, close_notes,
           template_label, template_requirements_snapshot, task_id,
           tenant_id, execution_order_number, origin_context, work_type)
         VALUES ($1, $2, $3, $4, 'fixture-customer', 'fixture-work', 'fixture-address',
           'fixture-city', 'fixture-sector', 'fixture-instructions', 'fixture-close',
           'fixture-template', $5::jsonb, $6, $7, 'OT-FIXTURE-1', 'WFM', 'INSTALLATION')`,
        [
          executionOrderId,
          visitId,
          scheduleId,
          linked.subscriberId,
          JSON.stringify({ privateNote: 'remove' }),
          operationalTaskId,
          tenantId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_activities
          (id, execution_order_id, description, tenant_id, activity_type)
         VALUES ($1, $2, 'fixture-activity', $3, 'NOTE')`,
        [randomUUID(), executionOrderId, tenantId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_evidence
          (id, execution_order_id, notes, file_name, media_asset_id, tenant_id, evidence_type)
         VALUES ($1, $2, 'fixture-evidence-notes', 'fixture-file', $3, $4, 'PHOTO')`,
        [randomUUID(), executionOrderId, mediaId, tenantId],
      );
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_status_transitions
          (id, execution_order_id, reason, tenant_id, from_status, to_status, changed_at)
         VALUES ($1, $2, 'fixture-transition-reason', $3, 'CREATED', 'ASSIGNED', now())`,
        [randomUUID(), executionOrderId, tenantId],
      );
      // task_origin_context no tiene TASKS (045) y recipient_type es NOT NULL: la tarea no CRM
      // queda como MANUAL hacia un área interna, sin referencia al titular.
      await dataSource.query(
        `INSERT INTO ${q}.operational_tasks
          (id, origin_context, origin_ref_id, recipient_type, recipient_ref_id,
           schedule_event_id, work_order_id, title, description, recipient_label,
           tenant_id, task_number, type, responsible_type, responsible_ref_id, execution_mode)
         VALUES
          ($1, 'MANUAL', 'fixture-origin', 'INTERNAL_AREA', NULL, NULL, NULL,
           'fixture-task-title', 'fixture-task-description', 'fixture-recipient',
           $7, 'TSK-FIXTURE-1', 'FIELD_VISIT', 'USER', $8, 'FIELD_SERVICE'),
          ($2, 'CRM', $3, 'SUBSCRIBER', $4, $5, $6,
           'fixture-crm-task', 'fixture-task-description', 'fixture-recipient',
           $7, 'TSK-FIXTURE-2', 'FIELD_VISIT', 'USER', $8, 'FIELD_SERVICE')`,
        [
          operationalTaskId,
          crmTaskId,
          fixture.expedienteId,
          linked.subscriberId,
          scheduleId,
          workOrderId,
          tenantId,
          actorId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.task_timeline_events (id, task_id, payload, tenant_id, event_type)
         VALUES ($1, $2, $3::jsonb, $4, 'CREATED')`,
        [
          randomUUID(),
          operationalTaskId,
          JSON.stringify({ description: 'fixture-timeline' }),
          tenantId,
        ],
      );
      await dataSource.query(
        `INSERT INTO ${q}.task_assignment_history
          (id, task_id, reason, tenant_id, previous_responsible_type, previous_responsible_ref_id,
           new_responsible_type, new_responsible_ref_id)
         VALUES ($1, $2, 'fixture-assignment-reason', $3, 'USER', $4, 'USER', $4)`,
        [randomUUID(), operationalTaskId, tenantId, actorId],
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
