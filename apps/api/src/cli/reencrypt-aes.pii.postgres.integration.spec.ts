import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  parseEncryptionKeyHex,
} from '../common/crypto/aes-gcm.util';
import { createFiscalDocumentCryptoFromKeys } from '../common/crypto/fiscal-document.util';
import { ReencryptDbPort } from '../common/crypto/reencrypt-aes.orchestrator';
import { TypeOrmReencryptDbAdapter } from '../common/crypto/reencrypt-aes.db-adapter';
import { EncryptedColumnTarget } from '../common/crypto/reencrypt-aes.targets';
import {
  listEligiblePiiTenantSchemas,
  PII_ENCRYPTED_TARGETS,
  runMfaToPii,
} from './reencrypt-aes.pii';
import { resolveK2ReencryptIntegrationEnabled } from './reencrypt-aes.integration-safety';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';

const databaseName = (process.env['DB_NAME'] ?? '').trim();
const databaseHost = process.env['DB_HOST']?.trim() || undefined;
const k2Enabled = resolveK2ReencryptIntegrationEnabled({
  optIn: process.env['IWANA_K2_REENCRYPT_INTEGRATION'],
  databaseName,
  databaseHost,
});
const describeWithDb = k2Enabled ? describe : describe.skip;
const schemaName = `tenant_k2_reencrypt_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = randomUUID();
const mfaKey = parseEncryptionKeyHex('0123456789abcdef'.repeat(4));
const mfaPreviousKey = parseEncryptionKeyHex('fedcba9876543210'.repeat(4));
const piiKey = parseEncryptionKeyHex('89abcdef01234567'.repeat(4));
const piiPreviousKey = parseEncryptionKeyHex('76543210fedcba98'.repeat(4));
const hashKey = parseEncryptionKeyHex('abcdef0123456789'.repeat(4));
const sourceKeys = [mfaKey, mfaPreviousKey];

/** MOD14 añade este objetivo en B2 (RS-9); ver el invariante de migraciones. */
const columnsPendingTarget = ['billing_documents.buyer_document_encrypted'];

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

describeWithDb('CLI reencrypt-aes PII — PostgreSQL real, esquema tenant migrado', () => {
  let dataSource: DataSource;
  let db: ScopedTenantDbPort;
  let eligibleTenantSchemas: string[];
  const subscriberOne = randomUUID();
  const subscriberTwo = randomUUID();
  const contractId = randomUUID();
  const expedienteId = randomUUID();
  const mfaObjectiveId = randomUUID();
  const mfaEmailCiphertext = encryptLegacy('synthetic-mfa-email');
  const mfaObjectiveCiphertext = encryptLegacy('synthetic-mfa-objective');
  // `subscribers.phone_encrypted` es varchar(100): admite hasta 21 bytes de texto claro.
  const synthetic = {
    subscriberDocument: 'synthetic-subscriber-document',
    subscriberEmail: 'synthetic-subscriber-email',
    subscriberPhone: 'synthetic-phone',
    subscriberAltPhone: 'synthetic-alt-phone',
    subscriberWhatsapp: 'synthetic-subscriber-whatsapp',
    subscriberEmailTwo: 'synthetic-subscriber-email-two',
    expedienteDocument: 'synthetic-expediente-document',
    expedientePrimaryPhone: 'synthetic-expediente-primary-phone',
    expedienteSecondaryPhone: 'synthetic-expediente-secondary-phone',
    expedienteEmail: 'synthetic-expediente-email',
    expedienteAltPhone: 'synthetic-expediente-alt-phone',
    expedienteSitePhone: 'synthetic-expediente-site-phone',
    expedienteFiscalDocument: 'synthetic-expediente-fiscal',
    contractFiscalDocument: 'synthetic-contract-fiscal',
    lifecycleNote: 'synthetic-lifecycle-note',
    partyDocument: 'synthetic-party-document',
    partyContact: 'synthetic-party-contact',
    requesterName: 'synthetic-requester-name',
    requesterDocument: 'synthetic-requester-document',
    requesterContact: 'synthetic-requester-contact',
  } as const;

  async function seedFixture(): Promise<void> {
    const q = quoteIdentifier(schemaName);
    const partyId = randomUUID();

    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by, email_encrypted, phone_encrypted, alt_contact_phone_encrypted,
         whatsapp_encrypted)
       VALUES
        ($1, $2, 'LEAD', 'NATURAL', 'RESIDENTIAL', 'CC', $3, 'Titular', 'Sintético', 3,
         'STANDARD', 'Dirección sintética', $4, $5, $6, $7, $8)`,
      [
        subscriberOne,
        tenantId,
        encryptLegacy(synthetic.subscriberDocument),
        actorId,
        encryptLegacy(synthetic.subscriberEmail, mfaPreviousKey),
        encryptLegacy(synthetic.subscriberPhone),
        encryptLegacy(synthetic.subscriberAltPhone),
        encryptLegacy(synthetic.subscriberWhatsapp),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, status, person_type, customer_segment, nit, business_name, vat_treatment,
         address, created_by, email_encrypted)
       VALUES
        ($1, $2, 'LEAD', 'JURIDICA', 'PYME', '900000000', 'Empresa sintética', 'STANDARD',
         'Dirección sintética', $3, $4)`,
      [subscriberTwo, tenantId, actorId, encryptLegacy(synthetic.subscriberEmailTwo)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
        (id, tenant_id, full_name, created_by, document_number_encrypted,
         phone_primary_encrypted, phone_secondary_encrypted, email_primary_encrypted,
         alt_contact_phone_encrypted, site_contact_phone_encrypted, fiscal_document_encrypted)
       VALUES ($1, $2, 'Titular sintético', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        expedienteId,
        tenantId,
        actorId,
        encryptLegacy(synthetic.expedienteDocument),
        encryptLegacy(synthetic.expedientePrimaryPhone),
        encryptLegacy(synthetic.expedienteSecondaryPhone),
        encryptLegacy(synthetic.expedienteEmail),
        encryptLegacy(synthetic.expedienteAltPhone),
        encryptLegacy(synthetic.expedienteSitePhone),
        encryptLegacy(synthetic.expedienteFiscalDocument),
      ],
    );
    // Contrato terminado y con la clave PII previa: es la fila que retiene una rotación real.
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, status, terminated_at, plan_id, plan_snapshot_json,
         fiscal_document_encrypted)
       VALUES ($1, $2, $3, 'TERMINATED', now(), 'fixture-plan', '{}'::jsonb, $4)`,
      [
        contractId,
        tenantId,
        subscriberOne,
        encryptLegacy(synthetic.contractFiscalDocument, piiPreviousKey),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.crm_lifecycle_changes
        (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status, reason_code,
         source, batch_id, note_encrypted)
       VALUES ($1, 'SUBSCRIBER', $2, $2, 'ACTIVE', 'SUSPENDED', 'MORA', 'MANUAL', $3, $4)`,
      [tenantId, subscriberOne, randomUUID(), encryptLegacy(synthetic.lifecycleNote)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético')`,
      [partyId, encryptLegacy(synthetic.partyDocument)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party_contact (party_id, type, value_encrypted)
       VALUES ($1, 'EMAIL', $2)`,
      [partyId, encryptLegacy(synthetic.partyContact)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.data_subject_requests
        (requester_kind, kind, "right", status, received_at, due_at, requester_name_encrypted,
         requester_document_encrypted, requester_contact_encrypted)
       VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'RADICADA', now(), CURRENT_DATE, $1, $2, $3)`,
      [
        encryptLegacy(synthetic.requesterName),
        encryptLegacy(synthetic.requesterDocument),
        encryptLegacy(synthetic.requesterContact),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.users (id, email, password_hash, role, tenant_id, email_hmac, mfa_secret)
       VALUES ($1, $2, 'synthetic-hash', 'ADMIN', $3, 'synthetic-hmac', $4)`,
      [mfaObjectiveId, mfaEmailCiphertext, tenantId, mfaObjectiveCiphertext],
    );
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
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'INACTIVE', $5)`,
      [
        tenantId,
        'K2 sintético',
        `k2-${tenantId.slice(0, 8)}`,
        schemaName,
        'k2-reencrypt@example.invalid',
      ],
    );
    // Cadena real: columnas, restricciones y triggers que un DDL a mano no reproduce.
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `k2-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await seedFixture();

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
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('el inventario coincide con las columnas *_encrypted del esquema migrado', async () => {
    const rows = (await dataSource.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = $1 AND column_name LIKE '%\\_encrypted'`,
      [schemaName],
    )) as Array<{ table_name: string; column_name: string }>;
    const schemaColumns = rows.map((row) => `${row.table_name}.${row.column_name}`);
    const inventory = PII_ENCRYPTED_TARGETS.map(({ table, column }) => `${table}.${column}`);

    expect(
      schemaColumns.filter(
        (column) => !inventory.includes(column) && !columnsPendingTarget.includes(column),
      ),
    ).toEqual([]);
    expect(
      inventory.filter(
        (column) => column.endsWith('_encrypted') && !schemaColumns.includes(column),
      ),
    ).toEqual([]);
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
    expect(dryRun.totals.reencrypted).toBe(20);
    expect(dryRun.totals.nonCiphertext).toBe(0);
    expect(
      dryRun.targets.filter((metric) => metric.candidates === 0).map((m) => m.entityType),
    ).toEqual([]);

    const legacyBeforeApply = await dataSource.query(
      `SELECT document_number_encrypted, email_encrypted FROM ${quoteIdentifier(schemaName)}.subscribers WHERE id = $1`,
      [subscriberOne],
    );
    expect(decryptAes256Gcm(legacyBeforeApply[0].email_encrypted, mfaPreviousKey, null)).toBe(
      synthetic.subscriberEmail,
    );

    const verificationBeforeApply = await runMfaToPii(db, {
      mode: 'verify-pii-only',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(verificationBeforeApply.totals.piiPreviousRemaining).toBe(1);
    expect(verificationBeforeApply.hasBlockingIssues).toBe(true);

    const apply = await runMfaToPii(db, {
      mode: 'apply',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(apply.hasBlockingIssues).toBe(false);
    expect(apply.totals.reencrypted).toBe(20);

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
    expect(verification.totals.piiPreviousRemaining).toBe(0);

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
      UNION ALL SELECT 'expediente_fiscal', id, fiscal_document_encrypted FROM ${quoteIdentifier(schemaName)}.expediente_records
      UNION ALL SELECT 'contract_fiscal', id, fiscal_document_encrypted FROM ${quoteIdentifier(schemaName)}.contracts
      UNION ALL SELECT 'lifecycle', id, note_encrypted FROM ${quoteIdentifier(schemaName)}.crm_lifecycle_changes
      UNION ALL SELECT 'party', id, document_number FROM ${quoteIdentifier(schemaName)}.party
      UNION ALL SELECT 'party_contact', id, value_encrypted FROM ${quoteIdentifier(schemaName)}.party_contact
      UNION ALL SELECT 'request', id, requester_name_encrypted FROM ${quoteIdentifier(schemaName)}.data_subject_requests
    `);
    expect(allPiiRows.length).toBeGreaterThan(0);
    expect(JSON.stringify(allPiiRows)).not.toContain('synthetic-');
  });

  it('el documento fiscal se lee por la ruta de producción tras retirar las claves previas', async () => {
    const crypto = createFiscalDocumentCryptoFromKeys({
      activeEncryptionKey: piiKey,
      previousEncryptionKeys: null,
      hashKey,
    });
    const [contract] = (await dataSource.query(
      `SELECT fiscal_document_encrypted, status::text AS status, terminated_at
         FROM ${quoteIdentifier(schemaName)}.contracts WHERE id = $1`,
      [contractId],
    )) as Array<{
      fiscal_document_encrypted: string;
      status: string;
      terminated_at: Date | null;
    }>;
    const [expediente] = (await dataSource.query(
      `SELECT fiscal_document_encrypted
         FROM ${quoteIdentifier(schemaName)}.expediente_records WHERE id = $1`,
      [expedienteId],
    )) as Array<{ fiscal_document_encrypted: string }>;

    expect(crypto.decrypt(contract?.fiscal_document_encrypted ?? '')).toBe(
      synthetic.contractFiscalDocument,
    );
    expect(crypto.decrypt(expediente?.fiscal_document_encrypted ?? '')).toBe(
      synthetic.expedienteFiscalDocument,
    );
    expect(contract?.status).toBe('TERMINATED');
    expect(contract?.terminated_at).not.toBeNull();
  });

  // Caracteriza un bloqueo abierto, no el comportamiento deseado: el borrado deja una marca
  // cifrada en `subscribers.document_number_encrypted` (lo exige chk_subscriber_person_fields)
  // y el trigger de la 169 rechaza el UPDATE. Debe ir al final: la fila no se puede retirar.
  it('K2 aborta con 55000 al recifrar la marca cifrada de un titular anonimizado', async () => {
    const q = quoteIdentifier(schemaName);
    const keys = { piiActiveKey: piiKey, piiPreviousKey, mfaKeys: sourceKeys };
    const options = { schemaFilter: schemaName, eligibleTenantSchemas, pageSize: 1, keys };
    const anonymizedId = randomUUID();
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by, anonymized_at, anonymized_request_id)
       VALUES
        ($1, $2, 'CANCELLED', 'NATURAL', 'RESIDENTIAL', 'CC', $3, 'ANONIMIZADO', 'ANONIMIZADO', 1,
         'STANDARD', 'ANONIMIZADO', $4, now(), $5)`,
      [anonymizedId, tenantId, encryptLegacy('ANONIMIZADO', piiPreviousKey), actorId, randomUUID()],
    );
    // El borrado deja NULL el documento fiscal del contrato: esta fila no se recifra ni bloquea.
    await dataSource.query(
      `INSERT INTO ${q}.contracts (tenant_id, subscriber_id, plan_id, plan_snapshot_json)
       VALUES ($1, $2, 'fixture-plan', '{}'::jsonb)`,
      [tenantId, anonymizedId],
    );

    const dryRun = await runMfaToPii(db, { ...options, mode: 'dry-run' });
    expect(dryRun.totals.reencrypted).toBe(1);
    expect(dryRun.hasBlockingIssues).toBe(false);

    await expect(runMfaToPii(db, { ...options, mode: 'apply' })).rejects.toMatchObject({
      driverError: expect.objectContaining({ code: '55000' }),
    });

    const verification = await runMfaToPii(db, { ...options, mode: 'verify-pii-only' });
    expect(verification.totals.piiPreviousRemaining).toBe(1);
    expect(verification.hasBlockingIssues).toBe(true);
  });
});
