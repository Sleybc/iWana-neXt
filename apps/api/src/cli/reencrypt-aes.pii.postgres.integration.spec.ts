import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  parseEncryptionKeyHex,
} from '../common/crypto/aes-gcm.util';
import { ReencryptDbPort } from '../common/crypto/reencrypt-aes.orchestrator';
import { TypeOrmReencryptDbAdapter } from '../common/crypto/reencrypt-aes.db-adapter';
import { EncryptedColumnTarget } from '../common/crypto/reencrypt-aes.targets';
import { listEligiblePiiTenantSchemas, runMfaToPii } from './reencrypt-aes.pii';
import { resolveK2ReencryptIntegrationEnabled } from './reencrypt-aes.integration-safety';

const databaseName = (process.env['DB_NAME'] ?? '').trim();
const databaseHost = process.env['DB_HOST']?.trim() || undefined;
const k2Enabled = resolveK2ReencryptIntegrationEnabled({
  optIn: process.env['IWANA_K2_REENCRYPT_INTEGRATION'],
  databaseName,
  databaseHost,
});
const describeWithDb = k2Enabled ? describe : describe.skip;
const schemaName = `tenant_k2_reencrypt_${randomBytes(5).toString('hex')}`;
const mfaKey = parseEncryptionKeyHex('0123456789abcdef'.repeat(4));
const mfaPreviousKey = parseEncryptionKeyHex('fedcba9876543210'.repeat(4));
const piiKey = parseEncryptionKeyHex('89abcdef01234567'.repeat(4));
const piiPreviousKey = parseEncryptionKeyHex('76543210fedcba98'.repeat(4));
const sourceKeys = [mfaKey, mfaPreviousKey];

function encryptLegacy(value: string, key: Buffer = mfaKey): string {
  return encryptAes256Gcm(value, key);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

class ScopedTenantDbPort implements ReencryptDbPort {
  constructor(
    private readonly delegate: TypeOrmReencryptDbAdapter,
    private readonly schema: string,
  ) {}

  async listActiveTenantSchemas(): Promise<string[]> {
    throw new Error(
      'La integración debe resolver el schema por el lookup elegible de control-plane.',
    );
  }

  tableExists(schemaName: string, table: string): Promise<boolean> {
    return this.delegate.tableExists(schemaName, table);
  }

  fetchEncryptedBatch(
    schemaName: string,
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ) {
    return this.delegate.fetchEncryptedBatch(schemaName, target, offset, limit);
  }

  updateEncryptedValue(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void> {
    return this.delegate.updateEncryptedValue(schemaName, target, id, newCiphertext);
  }
}

describeWithDb('CLI reencrypt-aes PII — PostgreSQL real, fixture tenant sin migraciones', () => {
  let dataSource: DataSource;
  let db: ScopedTenantDbPort;
  let eligibleTenantSchemas: string[];
  const subscriberOne = randomUUID();
  const subscriberTwo = randomUUID();
  const mfaObjectiveId = randomUUID();
  const mfaEmailCiphertext = encryptLegacy('synthetic-mfa-email');
  const mfaObjectiveCiphertext = encryptLegacy('synthetic-mfa-objective');
  const synthetic = {
    subscriberDocument: 'synthetic-subscriber-document',
    subscriberEmail: 'synthetic-subscriber-email',
    subscriberPhone: 'synthetic-subscriber-phone',
    subscriberAltPhone: 'synthetic-subscriber-alt-phone',
    subscriberWhatsapp: 'synthetic-subscriber-whatsapp',
    subscriberEmailTwo: 'synthetic-subscriber-email-two',
    expedienteDocument: 'synthetic-expediente-document',
    expedientePrimaryPhone: 'synthetic-expediente-primary-phone',
    expedienteSecondaryPhone: 'synthetic-expediente-secondary-phone',
    expedienteEmail: 'synthetic-expediente-email',
    expedienteAltPhone: 'synthetic-expediente-alt-phone',
    expedienteSitePhone: 'synthetic-expediente-site-phone',
    partyDocument: 'synthetic-party-document',
    partyContact: 'synthetic-party-contact',
    requesterName: 'synthetic-requester-name',
    requesterDocument: 'synthetic-requester-document',
    requesterContact: 'synthetic-requester-contact',
  } as const;

  async function createFixtureSchema(): Promise<void> {
    const q = quoteIdentifier(schemaName);
    await dataSource.query(`CREATE SCHEMA ${q}`);
    await dataSource.query(`
      CREATE TABLE ${q}.subscribers (
        id uuid PRIMARY KEY,
        document_number_encrypted varchar(500),
        email_encrypted varchar(500),
        phone_encrypted varchar(500),
        alt_contact_phone_encrypted varchar(500),
        whatsapp_encrypted varchar(500)
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${q}.expediente_records (
        id uuid PRIMARY KEY,
        document_number_encrypted varchar(500),
        phone_primary_encrypted varchar(500),
        phone_secondary_encrypted varchar(500),
        email_primary_encrypted varchar(500),
        alt_contact_phone_encrypted varchar(500),
        site_contact_phone_encrypted varchar(500)
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${q}.party (
        id uuid PRIMARY KEY, document_number varchar(500)
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${q}.party_contact (
        id uuid PRIMARY KEY, value_encrypted varchar(500)
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${q}.data_subject_requests (
        id uuid PRIMARY KEY,
        requester_name_encrypted varchar(500),
        requester_document_encrypted varchar(500),
        requester_contact_encrypted varchar(500)
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${q}.users (
        id uuid PRIMARY KEY, email varchar(500), mfa_secret varchar(500)
      )
    `);

    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, document_number_encrypted, email_encrypted, phone_encrypted,
         alt_contact_phone_encrypted, whatsapp_encrypted)
       VALUES
        ($1, $2, $3, $4, $5, $6),
        ($7, NULL, $8, NULL, NULL, NULL)`,
      [
        subscriberOne,
        encryptLegacy(synthetic.subscriberDocument),
        encryptLegacy(synthetic.subscriberEmail, mfaPreviousKey),
        encryptLegacy(synthetic.subscriberPhone),
        encryptLegacy(synthetic.subscriberAltPhone),
        encryptLegacy(synthetic.subscriberWhatsapp),
        subscriberTwo,
        encryptLegacy(synthetic.subscriberEmailTwo),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        encryptLegacy(synthetic.expedienteDocument),
        encryptLegacy(synthetic.expedientePrimaryPhone),
        encryptLegacy(synthetic.expedienteSecondaryPhone),
        encryptLegacy(synthetic.expedienteEmail),
        encryptLegacy(synthetic.expedienteAltPhone),
        encryptLegacy(synthetic.expedienteSitePhone),
      ],
    );
    await dataSource.query(`INSERT INTO ${q}.party VALUES ($1, $2)`, [
      randomUUID(),
      encryptLegacy(synthetic.partyDocument),
    ]);
    await dataSource.query(`INSERT INTO ${q}.party_contact VALUES ($1, $2)`, [
      randomUUID(),
      encryptLegacy(synthetic.partyContact),
    ]);
    await dataSource.query(`INSERT INTO ${q}.data_subject_requests VALUES ($1, $2, $3, $4)`, [
      randomUUID(),
      encryptLegacy(synthetic.requesterName),
      encryptLegacy(synthetic.requesterDocument),
      encryptLegacy(synthetic.requesterContact),
    ]);
    await dataSource.query(`INSERT INTO ${q}.users VALUES ($1, $2, $3)`, [
      mfaObjectiveId,
      mfaEmailCiphertext,
      mfaObjectiveCiphertext,
    ]);
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: databaseHost ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
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
    await createFixtureSchema();
    await dataSource.query(`
      CREATE TABLE public.tenants (
        schema_name varchar(63) PRIMARY KEY,
        status varchar(30) NOT NULL
      )
    `);
    await dataSource.query(
      `INSERT INTO public.tenants (schema_name, status) VALUES ($1, 'INACTIVE')`,
      [schemaName],
    );
    for (const status of ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'MARKED_FOR_DELETION']) {
      await dataSource.query('UPDATE public.tenants SET status = $1 WHERE schema_name = $2', [
        status,
        schemaName,
      ]);
      const result = await listEligiblePiiTenantSchemas(
        (query, parameters) => dataSource.query(query, parameters),
        schemaName,
      );
      expect(result).toEqual([schemaName]);
    }
    await dataSource.query('UPDATE public.tenants SET status = $1 WHERE schema_name = $2', [
      'INACTIVE',
      schemaName,
    ]);
    eligibleTenantSchemas = await listEligiblePiiTenantSchemas(
      (query, parameters) => dataSource.query(query, parameters),
      schemaName,
    );
    expect(eligibleTenantSchemas).toEqual([schemaName]);
    await expect(
      listEligiblePiiTenantSchemas(
        (query, parameters) => dataSource.query(query, parameters),
        'tenant_k2_unregistered',
      ),
    ).rejects.toThrow('Schema tenant no registrado, sin namespace o no elegible para K2.');
    db = new ScopedTenantDbPort(new TypeOrmReencryptDbAdapter(dataSource), schemaName);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('dry-run cuenta sin escribir y recifra todos los objetivos PII, sin alterar MFA', async () => {
    const keys = {
      piiActiveKey: piiKey,
      piiPreviousKey,
      mfaKeys: sourceKeys,
    };
    const dryRun = await runMfaToPii(db, {
      mode: 'dry-run',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(dryRun.hasBlockingIssues).toBe(false);
    expect(dryRun.totals.reencrypted).toBe(17);
    expect(dryRun.totals.nonCiphertext).toBe(0);

    const legacyBeforeApply = await dataSource.query(
      `SELECT document_number_encrypted, email_encrypted FROM ${quoteIdentifier(schemaName)}.subscribers WHERE id = $1`,
      [subscriberOne],
    );
    expect(decryptAes256Gcm(legacyBeforeApply[0].email_encrypted, mfaPreviousKey, null)).toBe(
      synthetic.subscriberEmail,
    );

    const apply = await runMfaToPii(db, {
      mode: 'apply',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(apply.hasBlockingIssues).toBe(false);
    expect(apply.totals.reencrypted).toBe(17);

    const repeated = await runMfaToPii(db, {
      mode: 'apply',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(repeated.hasBlockingIssues).toBe(false);
    expect(repeated.totals.reencrypted).toBe(0);

    const verification = await runMfaToPii(db, {
      mode: 'verify-pii-only',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(verification.hasBlockingIssues).toBe(false);
    expect(verification.totals.mfaOnlyRemaining).toBe(0);

    const subscribers = (await dataSource.query(
      `SELECT id, document_number_encrypted, email_encrypted, phone_encrypted,
              alt_contact_phone_encrypted, whatsapp_encrypted
       FROM ${quoteIdentifier(schemaName)}.subscribers ORDER BY id`,
    )) as Array<Record<string, string | null>>;
    const migrated = subscribers.find((row) => row['id'] === subscriberOne);
    const paged = subscribers.find((row) => row['id'] === subscriberTwo);
    expect(migrated?.['document_number_encrypted']).toBeTruthy();
    expect(decryptAes256Gcm(migrated?.['document_number_encrypted'] ?? '', piiKey, null)).toBe(
      synthetic.subscriberDocument,
    );
    expect(decryptAes256Gcm(migrated?.['email_encrypted'] ?? '', piiKey, null)).toBe(
      synthetic.subscriberEmail,
    );
    expect(decryptAes256Gcm(paged?.['email_encrypted'] ?? '', piiKey, null)).toBe(
      synthetic.subscriberEmailTwo,
    );
    expect(migrated?.['phone_encrypted']).not.toBeNull();

    const nullSafe = await dataSource.query(
      `SELECT phone_encrypted FROM ${quoteIdentifier(schemaName)}.subscribers WHERE id = $1`,
      [subscriberTwo],
    );
    expect(nullSafe[0]?.phone_encrypted).toBeNull();

    const mfaObjective = await dataSource.query(
      `SELECT email, mfa_secret FROM ${quoteIdentifier(schemaName)}.users WHERE id = $1`,
      [mfaObjectiveId],
    );
    expect(mfaObjective[0]?.email).toBe(mfaEmailCiphertext);
    expect(decryptAes256Gcm(mfaObjective[0]?.email, mfaKey, null)).toBe('synthetic-mfa-email');
    expect(mfaObjective[0]?.mfa_secret).toBe(mfaObjectiveCiphertext);
    expect(decryptAes256Gcm(mfaObjective[0]?.mfa_secret, mfaKey, null)).toBe(
      'synthetic-mfa-objective',
    );

    const allPiiRows = await dataSource.query(`
      SELECT 'expediente' AS family, id, document_number_encrypted AS value FROM ${quoteIdentifier(schemaName)}.expediente_records
      UNION ALL SELECT 'party', id, document_number FROM ${quoteIdentifier(schemaName)}.party
      UNION ALL SELECT 'party_contact', id, value_encrypted FROM ${quoteIdentifier(schemaName)}.party_contact
      UNION ALL SELECT 'request', id, requester_name_encrypted FROM ${quoteIdentifier(schemaName)}.data_subject_requests
    `);
    expect(allPiiRows.length).toBeGreaterThan(0);
    expect(JSON.stringify(allPiiRows)).not.toContain('synthetic-');
  });
});
