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
  TaxRegime,
  VatTreatment,
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
    return expediente;
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

  function makeAuditService(): AuditService {
    return new AuditService(dataSource, {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService);
  }

  function makeSubscribersService(auditService: AuditService): SubscribersService {
    const statusTransitions = new SubscriberStatusTransitionService(dataSource, auditService);
    return new SubscribersService(
      dataSource,
      testConfig,
      new VatTreatmentService(),
      statusTransitions,
      auditService,
      new PartyWriteAdapter(testConfig),
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
    ]) {
      await dataSource.query(
        `CREATE TABLE ${target}.${quoteIdentifier(table)} (LIKE ${source}.${quoteIdentifier(table)} INCLUDING ALL)`,
      );
    }

    await dataSource.query(
      `ALTER TABLE ${target}.party ADD COLUMN document_number_hmac varchar(64)`,
    );
    await dataSource.query(
      `ALTER TABLE ${target}.party_contact ADD COLUMN value_encrypted varchar(500), ADD COLUMN value_hmac varchar(64)`,
    );
    await dataSource.query(
      `ALTER TABLE ${target}.subscribers ADD COLUMN whatsapp_encrypted varchar(500), ADD COLUMN whatsapp_hmac varchar(64)`,
    );
    await dataSource.query(
      `CREATE UNIQUE INDEX uq_party_document_hmac_active ON ${target}.party (document_type, document_number_hmac) WHERE deleted_at IS NULL AND status <> 'MERGED' AND document_number_hmac IS NOT NULL`,
    );
    await dataSource.query(
      `CREATE UNIQUE INDEX uq_subscribers_expediente ON ${target}.subscribers (expediente_id) WHERE expediente_id IS NOT NULL AND deleted_at IS NULL`,
    );
    await dataSource.query(
      `CREATE TABLE ${target}.crm_conversion_failures (
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

    await TenantContext.run(context(), () => conversion.createFromExpediente(first.id, actorId));
    await TenantContext.run(context(), () => conversion.createFromExpediente(second.id, actorId));

    expect(await countRows('party')).toBe(1);
    expect(await countRows('subscribers')).toBe(2);
    const partyRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT document_number, document_number_hmac FROM party'),
    )) as Array<{ document_number: string; document_number_hmac: string }>;
    expect(partyRows[0]?.document_number).not.toContain('1234567');
    expect(partyRows[0]?.document_number_hmac).toMatch(/^[a-f0-9]{64}$/u);
    const contactRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT value, value_encrypted, value_hmac FROM party_contact'),
    )) as Array<{ value: string; value_encrypted: string; value_hmac: string }>;
    expect(contactRows).toHaveLength(2);
    for (const contact of contactRows) {
      expect(contact.value).toBe('');
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
          expedienteId: expediente.id,
          initialStatus: SubscriberStatus.CANCELLED,
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
    const statusTransitionService = new SubscriberStatusTransitionService(dataSource, auditService);
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
          expedienteId: expediente.id,
          initialStatus: SubscriberStatus.CANCELLED,
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

  it('persiste el fallo de evento y el reintento idempotente lo resuelve', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const eventEmitter = {
      emitAsync: jest
        .fn()
        .mockRejectedValueOnce(new Error('event listener failed'))
        .mockResolvedValueOnce([]),
    };
    const expedienteService = makeExpedienteService(auditService, subscribersService, eventEmitter);
    const expediente = await createExpediente({ status: ExpedienteStatus.PRECALIFICADO });

    await TenantContext.run(context(), () =>
      expedienteService.transitionStatus(
        expediente.id,
        { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
        actorId,
      ),
    );
    const beforeRetry = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOne(CrmConversionFailure, { where: { expedienteId: expediente.id } }),
    );
    expect(beforeRetry).toMatchObject({
      eventName: 'crm.expediente.ready-for-installation',
      errorCode: 'EVENT_EMIT_FAILED',
      attempts: 1,
      resolvedAt: null,
    });

    const result = await TenantContext.run(context(), () =>
      expedienteService.retryConversionEvent(expediente.id, actorId),
    );
    expect(result).toEqual({
      retried: true,
      resolved: true,
      eventName: 'crm.expediente.ready-for-installation',
    });

    const afterRetry = await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.findOne(CrmConversionFailure, { where: { expedienteId: expediente.id } }),
    );
    expect(afterRetry?.attempts).toBe(1);
    expect(afterRetry?.resolvedAt).toBeInstanceOf(Date);
    const repeated = await TenantContext.run(context(), () =>
      expedienteService.retryConversionEvent(expediente.id, actorId),
    );
    expect(repeated.retried).toBe(false);
    expect(eventEmitter.emitAsync).toHaveBeenCalledTimes(2);
  });
});
