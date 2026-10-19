import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  CustomerSegment,
  DocumentType,
  DocumentTypeParty,
  ExpedienteStatus,
  PersonType,
  PartyStatus,
  PartyType,
  SubscriberStatus,
  VatResponsibility,
  TaxRegime,
  VatTreatment,
  ConsentStatus,
  ConsentChannel,
  ConsentType,
} from '@iwana/shared';
import { encryptAes256Gcm, parseEncryptionKeyHex } from '../../../common/crypto/aes-gcm.util';
import { createPartyPiiCrypto } from '../../parties/party-pii.util';
import { AuditService } from '../../audit/audit.service';
import { PlatformAuditService } from '../../audit/platform-audit.service';
import { Party } from '../../parties/entities/party.entity';
import { PartyContact } from '../../parties/entities/party-contact.entity';
import { PartyRole } from '../../parties/entities/party-role.entity';
import { PartyWriteAdapter } from '../../parties/adapters/party-write.adapter';
import { PartyService } from '../../parties/services/party.service';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscriberFiscalCompletenessService } from './subscriber-fiscal-completeness.service';
import { SubscribersService } from './subscribers.service';
import { SubscriberCreationService } from './subscriber-creation.service';
import { VatTreatmentService } from './vat-treatment.service';
import { SubscriberActivationListener } from './listeners/subscriber-activation.listener';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { ContactAttempt } from '../expedientes/entities/contact-attempt.entity';
import { ConsentRecord } from '../expedientes/entities/consent-record-v2.entity';
import { CoverageCheck } from '../expedientes/entities/coverage-check.entity';
import { StatusChange } from '../expedientes/entities/status-change.entity';
import { SalesAttribution } from '../attributions/entities/sales-attribution.entity';
import { CrmConversionFailure } from '../expedientes/entities/crm-conversion-failure.entity';
import { ExpedienteService } from '../expedientes/expediente.service';
import { Contract } from '../contracts/entities/contract.entity';
import { ContractStatus } from '../enums/contract-status.enum';
import { DataAuthorizationEntity } from '../../privacy/entities/data-authorization.entity';
import { LegalTextEntity } from '../../privacy/entities/legal-text.entity';
import { PartyPrivacyMarkEntity } from '../../privacy/entities/party-privacy-mark.entity';
import { PrivacyAuthorizationAdapter } from '../../privacy/authorizations/privacy-authorization.adapter';
import { LegalTextsService } from '../../privacy/legal-texts/legal-texts.service';
import { PrivacyMarksAdapter } from '../../privacy/marks/privacy-marks.adapter';
import { CrmContractImpersonationAdapter } from '../privacy-adapters/crm-contract-impersonation.adapter';
import { CrmContractStandingReadAdapter } from '../privacy-adapters/crm-contract-standing-read.adapter';
import { UnprocessableEntityException } from '@nestjs/common';
import { PrivacyModule1460000000000 } from '../../../../../../packages/database/src/migrations/tenant/146_privacy_module';
import { SubscriberContactNullable1480000000000 } from '../../../../../../packages/database/src/migrations/tenant/148_subscriber_contact_nullable';
import { ExpedienteReadyForInstallationEvent } from '../expedientes/events/expediente-pipeline.events';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

describeWithDb('B5 identidad, conversión y reintento contra PostgreSQL real', () => {
  const encryptionKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const hashKeyHex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const encryptionKey = parseEncryptionKeyHex(encryptionKeyHex);
  let dataSource: DataSource;
  let tenantId: string;
  let sourceSchemaName: string;
  let testSchemaName: string;

  const actorId = '00000000-0000-4000-8000-0000000000b5';
  const testConfig = {
    getOrThrow: (key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY') return encryptionKeyHex;
      if (key === 'PII_HASH_KEY') return hashKeyHex;
      throw new Error(`Configuración de prueba no reconocida: ${key}`);
    },
    get: () => undefined,
  } as unknown as ConfigService;

  const context = () => ({
    tenantId,
    schemaName: testSchemaName,
    tenantSlug: integrationTenantSlug!,
  });

  function quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  async function countRows(table: string, where = '', parameters: unknown[] = []): Promise<number> {
    const rows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(`SELECT COUNT(*)::int AS count FROM ${table} ${where}`, parameters),
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }

  async function createExpediente(
    overrides: Partial<ExpedienteRecord> = {},
    options: { withTreatmentConsent?: boolean; consentChannel?: string } = {},
  ): Promise<ExpedienteRecord> {
    const expediente = Object.assign(new ExpedienteRecord(), {
      id: randomUUID(),
      tenantId,
      status: ExpedienteStatus.LISTO_PARA_INSTALACION,
      previousStatus: null,
      statusChangedAt: new Date(),
      fullName: 'Persona de prueba B5',
      firstName: 'Persona',
      lastName: 'Prueba B5',
      documentType: 'CC',
      personType: 'PERSONA_NATURAL',
      stratum: 2,
      emailPrimaryEncrypted: encryptAes256Gcm('b5@example.test', encryptionKey),
      phonePrimaryEncrypted: encryptAes256Gcm('3000000000', encryptionKey),
      address: 'Dirección sintética de prueba',
      municipality: 'Municipio de prueba',
      source: 'B5_INTEGRATION',
      createdBy: actorId,
      ...overrides,
    });

    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.save(ExpedienteRecord, expediente),
    );
    if (options.withTreatmentConsent !== false) {
      await runInTenantSchema(dataSource, testSchemaName, (qr) =>
        qr.manager.save(
          ConsentRecord,
          Object.assign(new ConsentRecord(), {
            tenantId,
            expedienteId: expediente.id,
            legacyProspectId: expediente.id,
            consentType: ConsentType.TRATAMIENTO_DATOS,
            status: ConsentStatus.ACEPTADO,
            legacyAccepted: true,
            channel: options.consentChannel ?? 'WEB',
            obtainedAt: new Date('2026-10-01T12:00:00.000Z'),
            ipAddress: '127.0.0.1',
            legalTextVersion: 'privacy-v1',
            evidenceRef: null,
            revokedAt: null,
            revokedReason: null,
            revokedBy: null,
          }),
        ),
      );
    }
    return expediente;
  }

  async function captureTreatmentConsent(expedienteId: string): Promise<void> {
    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.save(
        ConsentRecord,
        Object.assign(new ConsentRecord(), {
          tenantId,
          expedienteId,
          legacyProspectId: expedienteId,
          consentType: ConsentType.TRATAMIENTO_DATOS,
          status: ConsentStatus.ACEPTADO,
          legacyAccepted: true,
          channel: 'WEB',
          obtainedAt: new Date('2026-10-14T12:00:00.000Z'),
          ipAddress: '127.0.0.1',
          legalTextVersion: 'privacy-v1',
          evidenceRef: null,
          revokedAt: null,
          revokedReason: null,
          revokedBy: null,
        }),
      ),
    );
  }

  async function persistParty(
    documentNumber: string,
    overrides: Partial<Party> = {},
  ): Promise<Party> {
    const pii = createPartyPiiCrypto(testConfig);
    const party = Object.assign(new Party(), {
      partyType: PartyType.NATURAL,
      documentType: DocumentTypeParty.CC,
      documentNumber: pii.encrypt(documentNumber),
      documentNumberHmac: pii.documentHmac(DocumentTypeParty.CC, documentNumber),
      verificationDigit: null,
      displayName: 'Party sintética de integración',
      legalName: null,
      birthDate: null,
      incorporationDate: null,
      status: PartyStatus.ACTIVE,
      mergedIntoPartyId: null,
      mergedIntoParty: null,
      notes: null,
      address: null,
      latitude: null,
      longitude: null,
      city: null,
      department: null,
      deletedAt: null,
      ...overrides,
    });
    return runInTenantSchema(dataSource, testSchemaName, (qr) => qr.manager.save(Party, party));
  }

  async function persistContract(
    subscriberId: string,
    status: ContractStatus = ContractStatus.ACTIVE,
  ): Promise<Contract> {
    const contract = Object.assign(new Contract(), {
      tenantId,
      quoteId: null,
      subscriberId,
      planId: 'B5-PLAN',
      planSnapshotJson: { id: 'B5-PLAN' },
      status,
      alias: `Contrato ${randomUUID().slice(0, 8)}`,
      installationAddress: null,
      installationCity: null,
      installationDepartment: null,
      installationPostalCode: null,
      installationNotes: null,
      customerSegment: null,
      serviceUsage: null,
      installationStratum: null,
      stratumEvidenceMediaId: null,
      vatSnapshot: null,
      additionalProductIds: [],
      additionalServiceIds: [],
      paymentMethod: null,
      billingCycle: null,
      fiscalName: null,
      fiscalDocument: null,
      fiscalAddress: null,
      startDate: null,
      endDate: null,
    });
    return runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.save(Contract, contract),
    );
  }

  function makeAuditService(): AuditService {
    return new AuditService(dataSource, {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService);
  }

  function makeSubscribersService(
    auditService: AuditService,
    marksAdapter = new PrivacyMarksAdapter(dataSource),
  ): SubscribersService {
    const statusTransitions = new SubscriberStatusTransitionService(
      dataSource,
      auditService,
      new SubscriberFiscalCompletenessService(),
    );
    const privacyAuthorizationAdapter = new PrivacyAuthorizationAdapter(dataSource);
    return new SubscribersService(
      dataSource,
      testConfig,
      new VatTreatmentService(),
      statusTransitions,
      auditService,
      new PartyWriteAdapter(testConfig),
      { getPlansByIds: async () => new Map() } as never,
      privacyAuthorizationAdapter,
      privacyAuthorizationAdapter,
      new LegalTextsService(dataSource, auditService),
      marksAdapter,
    );
  }

  function makeExpedienteService(
    auditService: AuditService,
    subscribersService: SubscribersService,
    eventEmitter: Pick<EventEmitter2, 'emitAsync'>,
  ): ExpedienteService {
    return new ExpedienteService(
      dataSource,
      testConfig,
      auditService,
      {
        calculate: jest.fn().mockResolvedValue({
          commercial: 80,
          legal: 80,
          technical: 80,
          operational: 80,
        }),
      } as never,
      { findById: jest.fn().mockResolvedValue({ name: 'Actor B5' }) } as never,
      eventEmitter as EventEmitter2,
      subscribersService,
      new LegalTextsService(dataSource, auditService),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        AuditLog,
        Party,
        PartyRole,
        PartyContact,
        Subscriber,
        ExpedienteRecord,
        ContactAttempt,
        ConsentRecord,
        CoverageCheck,
        StatusChange,
        SalesAttribution,
        CrmConversionFailure,
        Contract,
        DataAuthorizationEntity,
        LegalTextEntity,
        PartyPrivacyMarkEntity,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 8, min: 1 },
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenants[0]) throw new Error(`No existe el tenant '${integrationTenantSlug}'.`);
    tenantId = tenants[0].id;
    sourceSchemaName = tenants[0].schema_name;
    testSchemaName = `tenant_b5_${randomUUID().replace(/-/g, '')}`;

    const target = quoteIdentifier(testSchemaName);
    const source = quoteIdentifier(sourceSchemaName);
    await dataSource.query(`CREATE SCHEMA ${target}`);
    for (const table of [
      'party',
      'party_role',
      'party_contact',
      'subscribers',
      'expediente_records',
      'contact_attempts',
      'consent_records',
      'coverage_checks',
      'status_changes',
      'sales_attributions',
      'audit_logs',
      'contracts',
    ]) {
      await dataSource.query(
        `CREATE TABLE IF NOT EXISTS ${target}.${quoteIdentifier(table)} (LIKE ${source}.${quoteIdentifier(table)} INCLUDING ALL)`,
      );
    }

    // R6: LIKE INCLUDING ALL copia los índices del origen con nombre autogenerado
    // (p. ej. subscribers_expediente_id_idx). Producción reconoce el conflicto
    // de concurrencia por el nombre uq_subscribers_expediente, así que se
    // eliminan los duplicados: el fixture no depende del estado de migración.
    const duplicateExpedienteIndexes = (await dataSource.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'subscribers' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(expediente_id)%' AND indexname <> 'uq_subscribers_expediente'`,
      [testSchemaName],
    )) as Array<{ indexname: string }>;
    for (const duplicate of duplicateExpedienteIndexes) {
      await dataSource.query(
        `DROP INDEX IF EXISTS ${target}.${quoteIdentifier(duplicate.indexname)}`,
      );
    }

    await runInTenantSchema(dataSource, testSchemaName, (migrationRunner) =>
      new PrivacyModule1460000000000().up(migrationRunner),
    );

    // R6: el tenant de origen ya puede estar migrado (143/144 aplicadas). El clon
    // con LIKE trae esas columnas, asi que cada alta usa IF NOT EXISTS para no
    // fallar con 42701 en CI. No cambia lo verificado por los tests.
    await dataSource.query(
      `ALTER TABLE ${target}.party ADD COLUMN IF NOT EXISTS document_number_hmac varchar(64)`,
    );
    await dataSource.query(
      `INSERT INTO ${target}.legal_texts (id, type, version, sha256, content, published_at)
       VALUES ('00000000-0000-4000-8000-000000000099', 'AUTORIZACION', 'privacy-v1', repeat('a', 64), 'Texto legal sintético', now())`,
    );
    await dataSource.query(
      `ALTER TABLE ${target}.party_contact ADD COLUMN IF NOT EXISTS value_encrypted varchar(500), ADD COLUMN IF NOT EXISTS value_hmac varchar(64)`,
    );
    await runInTenantSchema(dataSource, testSchemaName, (contactMigrationRunner) =>
      new SubscriberContactNullable1480000000000().up(contactMigrationRunner),
    );
    await dataSource.query(
      `ALTER TABLE ${target}.subscribers ADD COLUMN IF NOT EXISTS whatsapp_encrypted varchar(500), ADD COLUMN IF NOT EXISTS whatsapp_hmac varchar(64)`,
    );
    await dataSource.query(
      `ALTER TABLE ${target}.contracts
         ADD COLUMN IF NOT EXISTS service_usage varchar(20),
         ADD COLUMN IF NOT EXISTS installation_stratum smallint,
         ADD COLUMN IF NOT EXISTS stratum_evidence_media_id uuid,
         ADD COLUMN IF NOT EXISTS vat_snapshot jsonb`,
    );
    await dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_party_document_hmac_active ON ${target}.party (document_type, document_number_hmac) WHERE deleted_at IS NULL AND status <> 'MERGED' AND document_number_hmac IS NOT NULL`,
    );
    await dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_subscribers_expediente ON ${target}.subscribers (expediente_id) WHERE expediente_id IS NOT NULL AND deleted_at IS NULL`,
    );
    await dataSource.query(
      `CREATE TABLE IF NOT EXISTS ${target}.crm_conversion_failures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        expediente_id uuid NOT NULL REFERENCES ${target}.expediente_records(id),
        event_name varchar(80) NOT NULL,
        error_code varchar(80) NOT NULL,
        attempts int NOT NULL DEFAULT 1,
        first_failed_at timestamptz NOT NULL DEFAULT now(),
        last_failed_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz NULL,
        resolved_by uuid NULL,
        CONSTRAINT uq_crm_conversion_failure UNIQUE (expediente_id, event_name)
      )`,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (testSchemaName) {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(testSchemaName)} CASCADE`);
      }
      await dataSource.destroy();
    }
  });

  it('convierte persona jurídica sin inventar responsabilidades, representante ni DV ausente', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente({
      personType: 'PERSONA_JURIDICA',
      documentType: 'NIT',
      documentNumberEncrypted: null,
      companyName: 'Empresa sintética MOD05',
      fiscalDocumentEncrypted: encryptAes256Gcm('900123456', encryptionKey),
    });

    const subscriberId = await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );
    const rows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        `SELECT status, vat_responsibility, rut_responsibilities,
                legal_representative_party_id, nit, nit_verification_digit
           FROM subscribers WHERE id = $1`,
        [subscriberId],
      ),
    )) as Array<{
      status: string;
      vat_responsibility: string | null;
      rut_responsibilities: string[];
      legal_representative_party_id: string | null;
      nit: string | null;
      nit_verification_digit: string | null;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: SubscriberStatus.PROSPECT,
      vat_responsibility: null,
      rut_responsibilities: [],
      legal_representative_party_id: null,
      nit: '900123456',
      nit_verification_digit: null,
    });
  });

  it('deduplica Party por HMAC cuando el formato del documento cambia', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      subscribersService,
      new EventEmitter2(),
      auditService,
    );
    const first = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('1.234.567', encryptionKey),
    });
    const second = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('1234567', encryptionKey),
    });
    const partyCountBefore = await countRows('party');
    const subscriberCountBefore = await countRows('subscribers');

    await TenantContext.run(context(), () => conversion.createFromExpediente(first.id, actorId));
    await TenantContext.run(context(), () => conversion.createFromExpediente(second.id, actorId));

    expect(await countRows('party')).toBe(partyCountBefore + 1);
    expect(await countRows('subscribers')).toBe(subscriberCountBefore + 2);
    const subscriberRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT party_id FROM subscribers WHERE expediente_id = ANY($1::uuid[])', [
        [first.id, second.id],
      ]),
    )) as Array<{ party_id: string }>;
    const partyIds = subscriberRows.map((row) => row.party_id);
    const partyRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT document_number, document_number_hmac FROM party WHERE id = ANY($1::uuid[])',
        [partyIds],
      ),
    )) as Array<{ document_number: string; document_number_hmac: string }>;
    expect(partyRows[0]?.document_number).not.toContain('1234567');
    expect(partyRows[0]?.document_number_hmac).toMatch(/^[a-f0-9]{64}$/u);
    const contactRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT value, value_encrypted, value_hmac FROM party_contact WHERE party_id = ANY($1::uuid[])',
        [partyIds],
      ),
    )) as Array<{ value: string | null; value_encrypted: string; value_hmac: string }>;
    expect(contactRows).toHaveLength(2);
    for (const contact of contactRows) {
      expect(contact.value).toBeNull();
      expect(contact.value_encrypted).not.toContain('b5@example.test');
      expect(contact.value_encrypted).not.toContain('3000000000');
      expect(contact.value_hmac).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it('PartyService crea, encuentra y rechaza duplicados por HMAC con documento normalizado', async () => {
    const service = new PartyService(dataSource, testConfig);
    const input = {
      partyType: PartyType.NATURAL,
      documentType: DocumentTypeParty.CC,
      documentNumber: '8.765.432',
      displayName: 'Persona B5 por HMAC',
    };

    const created = await TenantContext.run(context(), () => service.create(input));
    const found = await TenantContext.run(context(), () =>
      service.findByDocument(DocumentTypeParty.CC, '8765432'),
    );
    expect(found?.id).toBe(created.id);
    expect(found?.documentNumber).toBe('8.765.432');

    const stored = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT document_number, document_number_hmac FROM party WHERE id = $1', [
        created.id,
      ]),
    )) as Array<{ document_number: string; document_number_hmac: string }>;
    expect(stored[0]?.document_number).not.toContain('8.765.432');
    expect(stored[0]?.document_number_hmac).toMatch(/^[a-f0-9]{64}$/u);
    await expect(
      TenantContext.run(context(), () => service.create({ ...input, documentNumber: '8765432' })),
    ).rejects.toThrow('Ya existe un party activo con ese documento');
  });

  it('la conversión enlaza al Party canónico cuando coexisten canónico y alias MERGED con el mismo HMAC', async () => {
    const documentNumber = '81000001';
    const canonical = await persistParty(documentNumber, { displayName: 'Party canónico B11' });
    const merged = await persistParty(documentNumber, {
      displayName: 'Party fusionado B11',
      status: PartyStatus.MERGED,
      mergedIntoPartyId: canonical.id,
    });
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm(documentNumber, encryptionKey),
    });
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );

    await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );

    const subscriberRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT party_id FROM subscribers WHERE expediente_id = $1', [expediente.id]),
    )) as Array<{ party_id: string }>;
    expect(subscriberRows).toEqual([{ party_id: canonical.id }]);
    expect(
      await countRows('subscribers', 'WHERE expediente_id = $1 AND party_id = $2', [
        expediente.id,
        merged.id,
      ]),
    ).toBe(0);
  });

  it('la conversión no reutiliza un Party eliminado lógicamente con el mismo HMAC', async () => {
    const documentNumber = '82000001';
    const deleted = await persistParty(documentNumber, {
      displayName: 'Party eliminado B11',
      status: PartyStatus.INACTIVE,
      deletedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm(documentNumber, encryptionKey),
    });
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );

    await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );

    const subscriberRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT party_id FROM subscribers WHERE expediente_id = $1', [expediente.id]),
    )) as Array<{ party_id: string }>;
    const partyId = subscriberRows[0]?.party_id;
    expect(partyId).toBeDefined();
    expect(partyId).not.toBe(deleted.id);
    const destinationRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT status, deleted_at FROM party WHERE id = $1', [partyId]),
    )) as Array<{ status: PartyStatus; deleted_at: Date | null }>;
    expect(destinationRows).toEqual([{ status: PartyStatus.ACTIVE, deleted_at: null }]);
  });

  it('dos conversiones concurrentes del mismo expediente retornan un único subscriber', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      subscribersService,
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('7654321', encryptionKey),
    });
    const partyCountBefore = await countRows('party');

    const ids = await TenantContext.run(context(), () =>
      Promise.all([
        conversion.createFromExpediente(expediente.id, actorId),
        conversion.createFromExpediente(expediente.id, actorId),
      ]),
    );

    expect(ids[0]).toBe(ids[1]);
    expect(await countRows('subscribers', 'WHERE expediente_id = $1', [expediente.id])).toBe(1);
    expect(await countRows('party')).toBe(partyCountBefore + 1);
  });

  it('reactiva hasta ACTIVE el subscriber cancelado del mismo expediente y audita el motivo fijo', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const eventEmitter = new EventEmitter2();
    const activationListener = new SubscriberActivationListener(subscribersService, eventEmitter);
    eventEmitter.on('crm.expediente.activated', (event) => activationListener.handle(event));
    const expedienteService = makeExpedienteService(auditService, subscribersService, eventEmitter);
    const expediente = await createExpediente({
      status: ExpedienteStatus.DESCARTADO,
      previousStatus: ExpedienteStatus.CLIENTE_ACTIVO,
      documentNumberEncrypted: null,
    });
    const subscriber = await TenantContext.run(context(), () =>
      subscribersService.create(
        {
          personType: PersonType.NATURAL,
          customerSegment: CustomerSegment.RESIDENTIAL,
          documentType: DocumentType.CC,
          documentNumber: '2468135',
          firstName: 'Persona B5',
          lastName: 'Reactivada',
          stratum: 2,
          email: 'reactivated@example.test',
          phone: '3000000001',
          whatsapp: '3000000001',
          address: 'Dirección sintética',
          vatResponsibility: VatResponsibility.RESPONSABLE,
          rutResponsibilities: ['O-13'],
          expedienteId: expediente.id,
          initialStatus: SubscriberStatus.CANCELLED,
          authorizationChannel: ConsentChannel.PRESENCIAL,
          authorizations: [
            {
              purpose: 'TRATAMIENTO_CONTRACTUAL',
              granted: true,
              legalTextId: '00000000-0000-4000-8000-000000000099',
            },
          ],
        },
        actorId,
      ),
    );

    await TenantContext.run(context(), () => expedienteService.reactivate(expediente.id, actorId));

    const persisted = await TenantContext.run(context(), () =>
      subscribersService.findById(subscriber.id),
    );
    expect(persisted.status).toBe(SubscriberStatus.ACTIVE);
    expect(persisted.whatsapp).toBe('3000000001');
    const whatsappRow = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT whatsapp, whatsapp_encrypted, whatsapp_hmac FROM subscribers WHERE id = $1',
        [subscriber.id],
      ),
    )) as Array<{ whatsapp: string | null; whatsapp_encrypted: string; whatsapp_hmac: string }>;
    expect(whatsappRow[0]?.whatsapp).toBeNull();
    expect(whatsappRow[0]?.whatsapp_encrypted).not.toContain('3000000001');
    expect(whatsappRow[0]?.whatsapp_hmac).toMatch(/^[a-f0-9]{64}$/u);
    const auditRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        "SELECT new_value FROM audit_logs WHERE entity_type = 'Subscriber' AND entity_id = $1",
        [subscriber.id],
      ),
    )) as Array<{ new_value: unknown }>;
    expect(JSON.stringify(auditRows)).toContain('EXPEDIENTE_REACTIVATED');
  });

  it('no restaura un suscriptor que ya estuvo ACTIVE según activatedAt', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const statusTransitionService = new SubscriberStatusTransitionService(
      dataSource,
      auditService,
      new SubscriberFiscalCompletenessService(),
    );
    const expediente = await createExpediente({
      status: ExpedienteStatus.DESCARTADO,
      previousStatus: ExpedienteStatus.CLIENTE_ACTIVO,
      documentNumberEncrypted: null,
    });
    const subscriber = await TenantContext.run(context(), () =>
      subscribersService.create(
        {
          personType: PersonType.NATURAL,
          customerSegment: CustomerSegment.RESIDENTIAL,
          documentType: DocumentType.CC,
          documentNumber: '9753186',
          firstName: 'Persona B5',
          lastName: 'Baja anterior',
          stratum: 2,
          email: 'previously-active@example.test',
          phone: '3000000002',
          address: 'Dirección sintética',
          vatResponsibility: VatResponsibility.RESPONSABLE,
          rutResponsibilities: ['O-13'],
          expedienteId: expediente.id,
          initialStatus: SubscriberStatus.CANCELLED,
          authorizationChannel: ConsentChannel.PRESENCIAL,
          authorizations: [
            {
              purpose: 'TRATAMIENTO_CONTRACTUAL',
              granted: true,
              legalTextId: '00000000-0000-4000-8000-000000000099',
            },
          ],
        },
        actorId,
      ),
    );
    const activatedAt = new Date('2026-09-01T10:00:00.000Z');
    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('UPDATE subscribers SET activated_at = $2 WHERE id = $1', [
        subscriber.id,
        activatedAt,
      ]),
    );

    await expect(
      TenantContext.run(context(), () =>
        statusTransitionService.reactivateFromExpediente(subscriber.id, expediente.id, actorId),
      ),
    ).rejects.toThrow(
      'Un suscriptor previamente activado no puede restaurarse desde su expediente.',
    );

    const persisted = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT status, activated_at FROM subscribers WHERE id = $1', [subscriber.id]),
    )) as Array<{ status: SubscriberStatus; activated_at: Date }>;
    expect(persisted[0]?.status).toBe(SubscriberStatus.CANCELLED);
    expect(new Date(persisted[0]!.activated_at).toISOString()).toBe(activatedAt.toISOString());
  });

  it('mantiene pendiente la conversión tras un fallo transitorio y la resuelve al reintentar', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const eventEmitter = new EventEmitter2();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      subscribersService,
      eventEmitter,
      auditService,
    );
    eventEmitter.on(
      'crm.expediente.ready-for-installation',
      (event: ExpedienteReadyForInstallationEvent) =>
        conversion.handleExpedienteReadyForInstallation(event),
    );
    const expedienteService = makeExpedienteService(auditService, subscribersService, eventEmitter);
    jest
      .spyOn(eventEmitter, 'emitAsync')
      .mockRejectedValueOnce(new Error('fallo transitorio sintético'))
      .mockRejectedValueOnce(new Error('fallo transitorio sintético'));
    const expediente = await createExpediente(
      {
        status: ExpedienteStatus.PRECALIFICADO,
        documentNumberEncrypted: encryptAes256Gcm('83000011', encryptionKey),
      },
      { withTreatmentConsent: false },
    );
    await captureTreatmentConsent(expediente.id);

    const transitioned = await TenantContext.run(context(), () =>
      expedienteService.transitionStatus(
        expediente.id,
        { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
        actorId,
      ),
    );
    expect(transitioned.status).toBe(ExpedienteStatus.LISTO_PARA_INSTALACION);
    const persistedExpediente = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT status FROM expediente_records WHERE id = $1', [expediente.id]),
    )) as Array<{ status: ExpedienteStatus }>;
    expect(persistedExpediente[0]?.status).toBe(ExpedienteStatus.LISTO_PARA_INSTALACION);

    const beforeRetry = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOne(CrmConversionFailure, { where: { expedienteId: expediente.id } }),
    );
    expect(beforeRetry).toMatchObject({
      eventName: 'crm.expediente.ready-for-installation',
      errorCode: 'CONVERSION_FAILED',
      attempts: 1,
      resolvedAt: null,
    });
    expect(await countRows('subscribers', 'WHERE expediente_id = $1', [expediente.id])).toBe(0);

    const failedRetry = await TenantContext.run(context(), () =>
      expedienteService.retryConversionEvent(expediente.id, actorId),
    );
    expect(failedRetry).toEqual({
      retried: true,
      resolved: false,
      eventName: 'crm.expediente.ready-for-installation',
    });

    const stillPending = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOne(CrmConversionFailure, { where: { expedienteId: expediente.id } }),
    );
    expect(stillPending).toMatchObject({
      errorCode: 'CONVERSION_FAILED',
      attempts: 2,
      resolvedAt: null,
    });
    expect(await countRows('subscribers', 'WHERE expediente_id = $1', [expediente.id])).toBe(0);

    const successfulRetry = await TenantContext.run(context(), () =>
      expedienteService.retryConversionEvent(expediente.id, actorId),
    );
    expect(successfulRetry).toEqual({
      retried: true,
      resolved: true,
      eventName: 'crm.expediente.ready-for-installation',
    });

    const resolvedFailure = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOne(CrmConversionFailure, { where: { expedienteId: expediente.id } }),
    );
    expect(resolvedFailure).toMatchObject({
      errorCode: 'CONVERSION_FAILED',
      attempts: 2,
      resolvedBy: actorId,
    });
    expect(resolvedFailure?.resolvedAt).toBeInstanceOf(Date);
    expect(await countRows('subscribers', 'WHERE expediente_id = $1', [expediente.id])).toBe(1);
    expect(eventEmitter.listenerCount('crm.expediente.ready-for-installation')).toBe(1);

    const retryAuditEntries = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        `SELECT action, entity_type, entity_id, user_id, new_value
           FROM audit_logs
          WHERE entity_type = $1 AND entity_id = $2 AND action = $3
          ORDER BY created_at ASC, id ASC`,
        ['Expediente', expediente.id, 'CONVERSION_RETRY'],
      ),
    )) as Array<{
      action: string;
      entity_type: string;
      entity_id: string;
      user_id: string;
      new_value: Record<string, unknown>;
    }>;
    expect(retryAuditEntries).toHaveLength(2);
    expect(retryAuditEntries).toEqual([
      {
        action: 'CONVERSION_RETRY',
        entity_type: 'Expediente',
        entity_id: expediente.id,
        user_id: actorId,
        new_value: {
          eventName: 'crm.expediente.ready-for-installation',
          resolved: false,
          errorCode: 'CONVERSION_FAILED',
        },
      },
      {
        action: 'CONVERSION_RETRY',
        entity_type: 'Expediente',
        entity_id: expediente.id,
        user_id: actorId,
        new_value: {
          eventName: 'crm.expediente.ready-for-installation',
          resolved: true,
          errorCode: 'CONVERSION_FAILED',
        },
      },
    ]);
    expect(JSON.stringify(retryAuditEntries)).not.toMatch(
      /83000011|b5@example\.test|3000000000|persona de prueba/i,
    );
  });

  it('rechaza conversión sin autorización contractual y revierte Party y Subscriber', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente(
      { documentNumberEncrypted: encryptAes256Gcm('83000001', encryptionKey) },
      { withTreatmentConsent: false },
    );
    const partyCountBefore = await countRows('party');

    await expect(
      TenantContext.run(context(), () => conversion.createFromExpediente(expediente.id, actorId)),
    ).rejects.toMatchObject({
      response: { code: 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED' },
      status: 422,
    });

    expect(await countRows('party')).toBe(partyCountBefore);
    expect(await countRows('subscribers', 'WHERE expediente_id = $1', [expediente.id])).toBe(0);
    const sourceConsents = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT id FROM consent_records WHERE expediente_id = $1', [expediente.id]),
    )) as Array<{ id: string }>;
    expect(
      await countRows('data_authorizations', 'WHERE source_ref = $1', [
        `consent_records:${sourceConsents[0]?.id}`,
      ]),
    ).toBe(0);
  });

  it('convierte dos veces con las mismas filas de autorización por sourceRef', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente(
      { documentNumberEncrypted: encryptAes256Gcm('83000002', encryptionKey) },
      { consentChannel: ConsentChannel.TELEFONO },
    );

    const [first, second] = await TenantContext.run(context(), async () => [
      await conversion.createFromExpediente(expediente.id, actorId),
      await conversion.createFromExpediente(expediente.id, actorId),
    ]);

    expect(first).toBe(second);
    expect(await countRows('subscribers', 'WHERE expediente_id = $1', [expediente.id])).toBe(1);
    const sourceConsents = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT id FROM consent_records WHERE expediente_id = $1', [expediente.id]),
    )) as Array<{ id: string }>;
    const convertedAuthorization = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT channel, kind FROM data_authorizations WHERE source_ref = $1', [
        `consent_records:${sourceConsents[0]?.id}`,
      ]),
    )) as Array<{ channel: string; kind: string }>;
    expect(convertedAuthorization).toEqual([{ channel: ConsentChannel.TELEFONO, kind: 'GRANT' }]);
    expect(
      await countRows('data_authorizations', 'WHERE source_ref = $1', [
        `consent_records:${sourceConsents[0]?.id}`,
      ]),
    ).toBe(1);
  });

  it('conserva un canal histórico fuera del catálogo como LEGACY_IMPORT', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('83000006', encryptionKey),
    });

    await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );

    const [authorization] = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        `SELECT da.channel, da.kind
         FROM data_authorizations da
         JOIN consent_records cr
           ON da.source_ref = 'consent_records:' || cr.id::text
         WHERE cr.expediente_id = $1`,
        [expediente.id],
      ),
    )) as Array<{ channel: string; kind: string }>;
    expect(authorization).toEqual({ channel: 'WEB', kind: 'LEGACY_IMPORT' });
  });

  it('rechaza alta directa sin autorización contractual con 422', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const before = await countRows('subscribers');

    await expect(
      TenantContext.run(context(), () =>
        subscribersService.create(
          {
            personType: PersonType.NATURAL,
            customerSegment: CustomerSegment.RESIDENTIAL,
            documentType: 'CC',
            documentNumber: '83000003',
            firstName: 'Titular',
            lastName: 'Sintético',
            stratum: 2,
            email: 'signup@example.test',
            phone: '3000000003',
            address: 'Dirección sintética',
          },
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED' },
      status: 422,
    });
    expect(await countRows('subscribers')).toBe(before);
  });

  it('consulta las marcas una sola vez por página del listado de suscriptores', async () => {
    const auditService = makeAuditService();
    const marksAdapter = new PrivacyMarksAdapter(dataSource);
    const marksSpy = jest.spyOn(marksAdapter, 'activeMarks');
    const subscribersService = makeSubscribersService(auditService, marksAdapter);
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      subscribersService,
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('83000004', encryptionKey),
    });
    await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );

    const page = await TenantContext.run(context(), () =>
      subscribersService.findAll({ page: 1, limit: 20 }),
    );

    expect(marksSpy).toHaveBeenCalledTimes(1);
    expect(marksSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(String)]));
    expect(page.data[0]?.privacyMarks).toEqual([]);
  });

  it('suspende contratos del Party en una transacción y emite eventos después del commit', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('83000005', encryptionKey),
    });
    const subscriberId = await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );
    const subscriber = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOneOrFail(Subscriber, { where: { id: subscriberId } }),
    );
    const contract = await persistContract(subscriber.id, ContractStatus.ACTIVE);
    const eventEmitter = new EventEmitter2();
    const emitted: Array<Record<string, unknown>> = [];
    eventEmitter.on('crm.contract.suspended', (event: Record<string, unknown>) =>
      emitted.push(event),
    );
    const adapter = new CrmContractImpersonationAdapter(
      dataSource,
      eventEmitter,
      makeAuditService(),
    );

    await TenantContext.run(context(), () =>
      runInTenantSchema(dataSource, testSchemaName, async (qr) => {
        const result = await adapter.suspendForImpersonation(
          {
            partyId: subscriber.partyId!,
            contractIds: [contract.id],
            requestId: randomUUID(),
            actorId,
          },
          { manager: qr.manager },
        );
        expect(result.suspendedContractIds).toEqual([contract.id]);
        expect(emitted).toHaveLength(0);
      }),
    );

    const persisted = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOneOrFail(Contract, { where: { id: contract.id } }),
    );
    expect(persisted.status).toBe(ContractStatus.SUSPENDED);
    expect(emitted).toMatchObject([
      { partyId: subscriber.partyId, contractId: contract.id, reason: 'SUPLANTACION' },
    ]);
    const auditRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        "SELECT new_value FROM audit_logs WHERE entity_type = 'Contract' AND entity_id = $1",
        [contract.id],
      ),
    )) as Array<{ new_value: { reason?: string } }>;
    expect(auditRows.at(-1)?.new_value.reason).toBe('SUPLANTACION');
  });

  it('rechaza contrato ajeno con rollback y sin evento de suspensión', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const firstExpediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('83000006', encryptionKey),
    });
    const secondExpediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('83000007', encryptionKey),
    });
    const firstId = await TenantContext.run(context(), () =>
      conversion.createFromExpediente(firstExpediente.id, actorId),
    );
    const secondId = await TenantContext.run(context(), () =>
      conversion.createFromExpediente(secondExpediente.id, actorId),
    );
    const first = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOneOrFail(Subscriber, { where: { id: firstId } }),
    );
    const second = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOneOrFail(Subscriber, { where: { id: secondId } }),
    );
    const ownContract = await persistContract(first.id, ContractStatus.ACTIVE);
    const foreignContract = await persistContract(second.id, ContractStatus.ACTIVE);
    const eventEmitter = new EventEmitter2();
    const emitted = jest.fn();
    eventEmitter.on('crm.contract.suspended', emitted);
    const adapter = new CrmContractImpersonationAdapter(
      dataSource,
      eventEmitter,
      makeAuditService(),
    );

    await expect(
      TenantContext.run(context(), () =>
        runInTenantSchema(dataSource, testSchemaName, (qr) =>
          adapter.suspendForImpersonation(
            {
              partyId: first.partyId!,
              contractIds: [ownContract.id, foreignContract.id],
              requestId: randomUUID(),
              actorId,
            },
            { manager: qr.manager },
          ),
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'IMPERSONATION_CONTRACT_NOT_OWNED' },
      status: 422,
    });

    const statusRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT id, status FROM contracts WHERE id = ANY($1::uuid[])', [
        [ownContract.id, foreignContract.id],
      ]),
    )) as Array<{ id: string; status: ContractStatus }>;
    expect(statusRows.every((row) => row.status === ContractStatus.ACTIVE)).toBe(true);
    expect(emitted).not.toHaveBeenCalled();
  });

  it('expone el estado contractual para las reglas de conservación', async () => {
    const auditService = makeAuditService();
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      makeSubscribersService(auditService),
      new EventEmitter2(),
      auditService,
    );
    const expediente = await createExpediente({
      documentNumberEncrypted: encryptAes256Gcm('83000008', encryptionKey),
    });
    const subscriberId = await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );
    const subscriber = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOneOrFail(Subscriber, { where: { id: subscriberId } }),
    );
    const open = await persistContract(subscriber.id, ContractStatus.ACTIVE);
    await persistContract(subscriber.id, ContractStatus.TERMINATED);
    const standing = await TenantContext.run(context(), () =>
      new CrmContractStandingReadAdapter(dataSource).standing(subscriber.partyId!),
    );
    expect(standing.openContractIds).toEqual([open.id]);
    expect(standing.lastTerminatedAt).toEqual(expect.any(String));
  });
});
