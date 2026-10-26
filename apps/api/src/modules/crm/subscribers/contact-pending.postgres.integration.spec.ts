import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  ConsentStatus,
  ConsentType,
  CustomerSegment,
  PersonType,
  ExpedienteStatus,
  SubscriberStatus,
  TaxRegime,
  VatTreatment,
  VatResponsibility,
  UserRole,
} from '@iwana/shared';
import { encryptAes256Gcm, parseEncryptionKeyHex } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { PlatformAuditService } from '../../audit/platform-audit.service';
import { DataAuthorizationEntity } from '../../privacy/entities/data-authorization.entity';
import { LegalTextEntity } from '../../privacy/entities/legal-text.entity';
import { PartyPrivacyMarkEntity } from '../../privacy/entities/party-privacy-mark.entity';
import { PrivacyAuthorizationAdapter } from '../../privacy/authorizations/privacy-authorization.adapter';
import { LegalTextsService } from '../../privacy/legal-texts/legal-texts.service';
import { PrivacyMarksAdapter } from '../../privacy/marks/privacy-marks.adapter';
import { Party } from '../../parties/entities/party.entity';
import { PartyContact } from '../../parties/entities/party-contact.entity';
import { PartyRole } from '../../parties/entities/party-role.entity';
import { PartyWriteAdapter } from '../../parties/adapters/party-write.adapter';
import { PartyReadAdapter } from '../../parties/adapters/party-read.adapter';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscriberFiscalCompletenessService } from './subscriber-fiscal-completeness.service';
import { evaluateSubscriberFiscalCompleteness } from './subscriber-fiscal-completeness.service';
import { SubscriberCreationService } from './subscriber-creation.service';
import { PRIMARY_SERVICE_PROJECTION_SQL, SubscribersService } from './subscribers.service';
import { VatTreatmentService } from './vat-treatment.service';
import { projectSubscriberForList } from './subscriber-projection';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { ContactAttempt } from '../expedientes/entities/contact-attempt.entity';
import { ConsentRecord } from '../expedientes/entities/consent-record-v2.entity';
import { CoverageCheck } from '../expedientes/entities/coverage-check.entity';
import { StatusChange } from '../expedientes/entities/status-change.entity';
import { SalesAttribution } from '../attributions/entities/sales-attribution.entity';
import { CrmConversionFailure } from '../expedientes/entities/crm-conversion-failure.entity';
import { ExpedienteService } from '../expedientes/expediente.service';
import { Contract } from '../contracts/entities/contract.entity';
import { CommercialCatalogReadAdapter } from '../../commercial/ports/commercial-catalog-read.adapter';
import { CatalogItem } from '../../commercial/entities/catalog-item.entity';
import {
  createTenantDataSource,
  applyTenantMigrationsInOrder,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = `tenant_mod05_e3_${randomUUID().replace(/-/g, '')}`;
const tenantId = randomUUID();
const tenantSlug = `mod05-e3-${randomUUID().slice(0, 8)}`;
const actorId = '00000000-0000-4000-8000-0000000000e3';
const encryptionKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const hashKeyHex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const encryptionKey = parseEncryptionKeyHex(encryptionKeyHex);
const testConfig = {
  getOrThrow: (key: string) => {
    if (key === 'MFA_ENCRYPTION_KEY') return encryptionKeyHex;
    if (key === 'PII_HASH_KEY') return hashKeyHex;
    throw new Error('Configuración de prueba no reconocida.');
  },
  get: () => undefined,
} as unknown as ConfigService;

describeWithDb('Contacto pendiente de subscriber — PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantDataSource: DataSource | undefined;

  const context = () => ({ tenantId, schemaName, tenantSlug });

  async function createExpedienteWithoutContact(): Promise<ExpedienteRecord> {
    const expediente = Object.assign(new ExpedienteRecord(), {
      id: randomUUID(),
      tenantId,
      status: ExpedienteStatus.LISTO_PARA_INSTALACION,
      previousStatus: null,
      statusChangedAt: new Date(),
      fullName: 'Persona sintética E3',
      firstName: 'Persona',
      lastName: 'Sintética E3',
      documentType: 'CC',
      personType: 'PERSONA_NATURAL',
      stratum: 2,
      documentNumberEncrypted: encryptAes256Gcm('77000001', encryptionKey),
      emailPrimaryEncrypted: null,
      emailSecondary: null,
      phonePrimaryEncrypted: null,
      phoneSecondaryEncrypted: null,
      address: 'Dirección sintética de integración',
      municipality: 'Municipio sintético',
      source: 'CONTACT_PENDING_INTEGRATION',
      createdBy: actorId,
    });
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.save(ExpedienteRecord, expediente),
    );
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.save(
        ConsentRecord,
        Object.assign(new ConsentRecord(), {
          tenantId,
          expedienteId: expediente.id,
          legacyProspectId: expediente.id,
          consentType: ConsentType.TRATAMIENTO_DATOS,
          status: ConsentStatus.ACEPTADO,
          legacyAccepted: true,
          channel: 'WEB',
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
    return expediente;
  }

  function makeAuditService(): AuditService {
    return new AuditService(dataSource, {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService);
  }

  function makeSubscribersService(auditService: AuditService): SubscribersService {
    const privacyAuthorizationAdapter = new PrivacyAuthorizationAdapter(dataSource);
    return new SubscribersService(
      dataSource,
      testConfig,
      new VatTreatmentService(),
      new SubscriberStatusTransitionService(
        dataSource,
        auditService,
        new SubscriberFiscalCompletenessService(),
      ),
      auditService,
      new PartyWriteAdapter(testConfig),
      new CommercialCatalogReadAdapter(dataSource),
      privacyAuthorizationAdapter,
      privacyAuthorizationAdapter,
      new LegalTextsService(dataSource, auditService),
      new PrivacyMarksAdapter(dataSource),
      undefined,
      new PartyReadAdapter(dataSource, testConfig),
    );
  }

  function makeExpedienteService(
    auditService: AuditService,
    subscribersService: SubscribersService,
    eventEmitter: EventEmitter2,
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
      { findById: jest.fn().mockResolvedValue({ name: 'Actor E3' }) } as never,
      eventEmitter,
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
        PartyContact,
        PartyRole,
        Subscriber,
        ExpedienteRecord,
        ContactAttempt,
        ConsentRecord,
        CoverageCheck,
        StatusChange,
        SalesAttribution,
        CrmConversionFailure,
        Contract,
        CatalogItem,
        DataAuthorizationEntity,
        LegalTextEntity,
        PartyPrivacyMarkEntity,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 8, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'MOD05 E3 integration', tenantSlug, schemaName, 'integration@example.invalid'],
    );

    tenantDataSource = createTenantDataSource(dataSource, schemaName, `mod05-e3-${schemaName}`);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource);
    await tenantDataSource.destroy();
    tenantDataSource = undefined;

    await dataSource.query(
      `INSERT INTO "${schemaName}".legal_texts
         (id, type, version, sha256, content, published_at)
       VALUES ('00000000-0000-4000-8000-000000000099', 'AUTORIZACION', 'privacy-v1', repeat('a', 64), 'Texto legal sintético', now())`,
    );
  }, 180_000);

  afterAll(async () => {
    if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
    await dataSource.destroy();
  });

  it('convierte sin contacto a PROSPECT, bloquea activaciones sin escritura y activa al agregar un canal', async () => {
    const expediente = await createExpedienteWithoutContact();
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const conversion = new SubscriberCreationService(
      dataSource,
      testConfig,
      subscribersService,
      new EventEmitter2(),
      auditService,
    );
    const expedienteService = makeExpedienteService(
      auditService,
      subscribersService,
      new EventEmitter2(),
    );

    const subscriberId = await TenantContext.run(context(), () =>
      conversion.createFromExpediente(expediente.id, actorId),
    );
    const subscriber = await TenantContext.run(context(), () =>
      subscribersService.findById(subscriberId),
    );
    expect(subscriber.status).toBe(SubscriberStatus.PROSPECT);
    expect(projectSubscriberForList(subscriber, UserRole.ADMIN).contactPending).toBe(true);
    expect(subscriber.emailEncrypted).toBeNull();
    expect(subscriber.phoneEncrypted).toBeNull();
    if (!subscriber.partyId) throw new Error('La conversión no vinculó Party.');
    const partyId = subscriber.partyId;

    const stored = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT email_encrypted, email_hmac, phone_encrypted, phone_hmac
           FROM subscribers WHERE id = $1`,
        [subscriberId],
      ),
    )) as Array<{
      email_encrypted: string | null;
      email_hmac: string | null;
      phone_encrypted: string | null;
      phone_hmac: string | null;
    }>;
    expect(stored).toEqual([
      { email_encrypted: null, email_hmac: null, phone_encrypted: null, phone_hmac: null },
    ]);
    expect(
      await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.manager.count(PartyContact, { where: { partyId } }),
      ),
    ).toBe(0);

    await expect(
      TenantContext.run(context(), () =>
        subscribersService.transitionStatus(subscriberId, SubscriberStatus.ACTIVE, null, actorId),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'SUBSCRIBER_FISCAL_DATA_INCOMPLETE',
        missing: ['VAT_RESPONSIBILITY'],
      },
    });
    await expect(
      TenantContext.run(context(), () =>
        expedienteService.transitionStatus(
          expediente.id,
          { targetStatus: ExpedienteStatus.CLIENTE_ACTIVO },
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED' },
    });

    expect(
      (await TenantContext.run(context(), () => expedienteService.findById(expediente.id))).status,
    ).toBe(ExpedienteStatus.LISTO_PARA_INSTALACION);
    expect(
      (await TenantContext.run(context(), () => subscribersService.findById(subscriberId))).status,
    ).toBe(SubscriberStatus.PROSPECT);

    await TenantContext.run(context(), () =>
      subscribersService.update(
        subscriberId,
        {
          email: 'synthetic-contact@example.test',
          vatResponsibility: VatResponsibility.RESPONSABLE,
          rutResponsibilities: ['O-13'],
        },
        actorId,
      ),
    );
    const activated = await TenantContext.run(context(), () =>
      subscribersService.transitionStatus(subscriberId, SubscriberStatus.ACTIVE, null, actorId),
    );
    expect(activated.status).toBe(SubscriberStatus.ACTIVE);
    expect(projectSubscriberForList(activated, UserRole.ADMIN).contactPending).toBe(false);

    const visibleBeforeBlock = await TenantContext.run(context(), () =>
      subscribersService.search({ documentNumber: '77000001' }),
    );
    expect(visibleBeforeBlock).toHaveLength(1);
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.save(
        PartyPrivacyMarkEntity,
        Object.assign(new PartyPrivacyMarkEntity(), {
          partyId,
          mark: 'DATOS_BLOQUEADOS',
          event: 'OPEN',
          requestId: null,
          actorId,
          occurredAt: new Date(),
        }),
      ),
    );
    const visibleAfterBlock = await TenantContext.run(context(), () =>
      subscribersService.search({ documentNumber: '77000001', excludeBlocked: true }),
    );
    expect(visibleAfterBlock).toEqual([]);
  });

  it('proyecta el servicio principal y mantiene paridad de conteos globales en PostgreSQL', async () => {
    const auditService = makeAuditService();
    const subscribersService = makeSubscribersService(auditService);
    const before = await TenantContext.run(context(), () => subscribersService.getQueueCounts());
    const activeId = randomUUID();
    const suspendedId = randomUUID();
    const cancelledId = randomUUID();
    const anonymizedId = randomUUID();
    const fixture = [
      {
        id: activeId,
        status: SubscriberStatus.ACTIVE,
        personType: PersonType.NATURAL,
        anonymized: false,
        contact: false,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: [] as string[],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      },
      {
        id: suspendedId,
        status: SubscriberStatus.SUSPENDED,
        personType: PersonType.NATURAL,
        anonymized: false,
        contact: true,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      },
      {
        id: cancelledId,
        status: SubscriberStatus.CANCELLED,
        personType: PersonType.NATURAL,
        anonymized: false,
        contact: false,
        vatResponsibility: null,
        rutResponsibilities: [] as string[],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      },
      {
        id: anonymizedId,
        status: SubscriberStatus.ACTIVE,
        personType: PersonType.NATURAL,
        anonymized: true,
        contact: false,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: [] as string[],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      },
    ];

    for (const row of fixture) {
      await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `INSERT INTO subscribers (
             id, tenant_id, person_type, customer_segment, document_type,
             document_number_encrypted, first_name, last_name, stratum,
             nit, nit_verification_digit, business_name, email_encrypted, phone_encrypted,
             vat_treatment, tax_regime, address, created_by, status,
             vat_responsibility, rut_responsibilities, anonymized_at,
             anonymized_request_id
           ) VALUES (
             $1, $2, $3, $4,
             CASE WHEN $17 = 'NATURAL' THEN 'CC' ELSE NULL END,
             CASE WHEN $17 = 'NATURAL' THEN $5 ELSE NULL END,
             CASE WHEN $17 = 'NATURAL' THEN 'Persona' ELSE NULL END,
             CASE WHEN $17 = 'NATURAL' THEN 'Sintética' ELSE NULL END,
             CASE WHEN $17 = 'NATURAL' THEN 2 ELSE NULL END,
             $6, $7,
             CASE WHEN $17 = 'JURIDICA' THEN 'Empresa sintética' ELSE NULL END,
             $8, $9, $10, $11, 'Dirección sintética', $12, $13,
             $14, $15, CASE WHEN $16 THEN now() ELSE NULL END, $18
           )`,
          [
            row.id,
            tenantId,
            row.personType,
            CustomerSegment.RESIDENTIAL,
            row.personType === PersonType.NATURAL
              ? encryptAes256Gcm(`770000${fixture.indexOf(row) + 1}`, encryptionKey)
              : null,
            row.nit,
            row.nitVerificationDigit,
            row.contact ? 'synthetic-contact-cipher' : null,
            null,
            VatTreatment.EXCLUDED,
            row.personType === PersonType.JURIDICA ? TaxRegime.COMMON : TaxRegime.SIMPLIFIED,
            actorId,
            row.status,
            row.vatResponsibility,
            row.rutResponsibilities,
            row.anonymized,
            row.personType,
            row.anonymized ? randomUUID() : null,
          ],
        ),
      );
    }

    const contractFixtures = [
      {
        subscriberId: activeId,
        status: 'ACTIVE',
        startDate: '2023-01-01',
        alias: 'Activo antiguo',
      },
      { subscriberId: activeId, status: 'ACTIVE', startDate: '2024-01-01', alias: 'Activo nuevo' },
      {
        subscriberId: activeId,
        status: 'SUSPENDED',
        startDate: '2020-01-01',
        alias: 'Suspendido antiguo',
      },
      {
        subscriberId: activeId,
        status: 'DRAFT',
        startDate: '2026-01-01',
        alias: 'Borrador reciente',
      },
      {
        subscriberId: suspendedId,
        status: 'SUSPENDED',
        startDate: '2023-01-01',
        alias: 'Suspendido nuevo',
      },
      {
        subscriberId: suspendedId,
        status: 'SUSPENDED',
        startDate: '2022-01-01',
        alias: 'Suspendido antiguo',
      },
      { subscriberId: suspendedId, status: 'DRAFT', startDate: '2026-01-01', alias: 'Borrador' },
    ];
    for (const [index, contract] of contractFixtures.entries()) {
      await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `INSERT INTO contracts (
             id, tenant_id, subscriber_id, plan_id, plan_snapshot_json,
             status, alias, installation_city, start_date, created_at
           ) VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, $6, 'Ciudad sintética', $7, $8)`,
          [
            randomUUID(),
            tenantId,
            contract.subscriberId,
            `00000000-0000-4000-a000-${String(index + 1).padStart(12, '0')}`,
            contract.status,
            contract.alias,
            contract.startDate,
            new Date(`2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
          ],
        ),
      );
    }

    const explainPlan: Array<{ 'QUERY PLAN': string }> = await runInTenantSchema(
      dataSource,
      schemaName,
      (qr) =>
        qr.query(
          `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
           SELECT s.id, ${PRIMARY_SERVICE_PROJECTION_SQL} AS primary_service_projection
             FROM subscribers s
            WHERE s.tenant_id = $1
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT 100`,
          [tenantId],
        ),
    );
    const explainText = explainPlan.map((row) => row['QUERY PLAN']).join('\n');
    const usesExpectedContractIndex = explainText.includes('idx_contracts_tenant_subscriber');
    const hasContractSeqScan = /Seq Scan on contracts/iu.test(explainText);
    expect(usesExpectedContractIndex).toBe(true);
    expect(hasContractSeqScan).toBe(false);
    console.info(
      'B0_LIST_EXPLAIN',
      JSON.stringify({
        query: 'subscriber page with primary-service lateral projection',
        tenantSearchPath: schemaName,
        parameterizedTenantId: true,
        expectedIndex: 'idx_contracts_tenant_subscriber',
        usesExpectedContractIndex,
        hasContractSeqScan,
      }),
    );

    const listed = await TenantContext.run(context(), () =>
      subscribersService.findAll({ page: 1, limit: 100 }),
    );
    const active = listed.data.find((row) => row.id === activeId);
    const suspended = listed.data.find((row) => row.id === suspendedId);
    const cancelled = listed.data.find((row) => row.id === cancelledId);
    const anonymized = listed.data.find((row) => row.id === anonymizedId);
    expect(active?.primaryService).toMatchObject({
      status: 'ACTIVE',
      alias: 'Activo antiguo',
      city: 'Ciudad sintética',
    });
    expect(active?.otherLiveServicesCount).toBe(2);
    expect(suspended?.primaryService).toMatchObject({
      status: 'SUSPENDED',
      alias: 'Suspendido antiguo',
    });
    expect(suspended?.otherLiveServicesCount).toBe(1);
    expect(cancelled?.primaryService).toBeNull();
    expect(anonymized?.anonymizedAt).not.toBeNull();
    const anonymizedProjection = projectSubscriberForList(anonymized!, UserRole.ADMIN);
    expect(anonymizedProjection.primaryService).toBeNull();

    const after = await TenantContext.run(context(), () => subscribersService.getQueueCounts());
    const filteredQueues = await Promise.all([
      TenantContext.run(context(), () =>
        subscribersService.findAll({ status: SubscriberStatus.ACTIVE }),
      ),
      TenantContext.run(context(), () =>
        subscribersService.findAll({ status: SubscriberStatus.SUSPENDED }),
      ),
      TenantContext.run(context(), () => subscribersService.findAll({ contactPending: true })),
      TenantContext.run(context(), () => subscribersService.findAll({ fiscalIncomplete: true })),
      TenantContext.run(context(), () => subscribersService.findAll({ withoutLiveServices: true })),
    ]);
    expect({
      active: filteredQueues[0].total,
      suspended: filteredQueues[1].total,
      contactPending: filteredQueues[2].total,
      fiscalIncomplete: filteredQueues[3].total,
      withoutLiveServices: filteredQueues[4].total,
    }).toEqual(after);
    const nonAnonymized = fixture.filter((row) => !row.anonymized);
    const expectedFiscalIncomplete = nonAnonymized.filter(
      (row) =>
        row.status !== SubscriberStatus.CANCELLED &&
        !evaluateSubscriberFiscalCompleteness(row).complete,
    ).length;
    expect(after.active - before.active).toBe(1);
    expect(after.suspended - before.suspended).toBe(1);
    expect(after.contactPending - before.contactPending).toBe(
      nonAnonymized.filter((row) => !row.contact).length,
    );
    expect(after.fiscalIncomplete - before.fiscalIncomplete).toBe(expectedFiscalIncomplete);
    expect(after.withoutLiveServices - before.withoutLiveServices).toBe(1);
  }, 60_000);

  it('mide los SELECT reales de una página de 100 con party y representante', async () => {
    const subscribersService = makeSubscribersService(makeAuditService());
    const partyRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT party_id FROM subscribers WHERE tenant_id = $1 AND party_id IS NOT NULL LIMIT 1`,
        [tenantId],
      ),
    )) as Array<{ party_id: string }>;
    const partyId = partyRows[0]?.party_id;
    if (!partyId) throw new Error('El fixture integrado no produjo un Party para medir la página.');

    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `WITH inserted AS (
           INSERT INTO subscribers (
             id, tenant_id, party_id, legal_representative_party_id,
             person_type, customer_segment, document_type, document_number_encrypted,
             first_name, last_name, stratum, vat_treatment, tax_regime, address,
             created_by, status, vat_responsibility, rut_responsibilities
           )
           SELECT gen_random_uuid(), $1, $2, $2, 'NATURAL', 'RESIDENTIAL', 'CC', $3,
                  'Persona', 'Fila operativa', 2, 'EXCLUDED', 'SIMPLIFIED',
                  'Dirección sintética', $4, 'ACTIVE', 'RESPONSABLE', ARRAY['O-13']::text[]
             FROM generate_series(1, 100)
           RETURNING id
         )
         INSERT INTO contracts (
           id, tenant_id, subscriber_id, plan_id, plan_snapshot_json,
           status, alias, installation_city, start_date, created_at
         )
         SELECT gen_random_uuid(), $1, inserted.id, $5, '{}'::jsonb,
                'ACTIVE', 'Servicio sintético', 'Ciudad sintética', CURRENT_DATE, now()
           FROM inserted`,
        [
          tenantId,
          partyId,
          encryptAes256Gcm('77000009', encryptionKey),
          actorId,
          '00000000-0000-4000-a000-000000009999',
        ],
      ),
    );

    let selectCount = 0;
    let mainReadCount = 0;
    let partyReadCount = 0;
    let privacyReadCount = 0;
    const createQueryRunner = dataSource.createQueryRunner.bind(dataSource);
    const queryRunnerFactorySpy = jest
      .spyOn(dataSource, 'createQueryRunner')
      .mockImplementation((mode) => {
        const queryRunner = createQueryRunner(mode);
        const queryRunnerQuery = queryRunner.query.bind(queryRunner);
        jest.spyOn(queryRunner, 'query').mockImplementation(async (...args) => {
          const statement = args[0];
          if (typeof statement === 'string' && /^\s*(SELECT|WITH)\b/iu.test(statement)) {
            selectCount += 1;
            if (/\b(?:subscribers|catalog_items)\b/iu.test(statement)) mainReadCount += 1;
            else if (/\bparty\b/iu.test(statement)) partyReadCount += 1;
            else if (/\bparty_privacy_marks\b/iu.test(statement)) privacyReadCount += 1;
          }
          return queryRunnerQuery(...args);
        });
        return queryRunner;
      });

    try {
      const page = await TenantContext.run(context(), () =>
        subscribersService.findAll({ page: 1, limit: 100 }),
      );
      expect(page.data).toHaveLength(100);
      expect(mainReadCount).toBeLessThanOrEqual(3);
      expect(mainReadCount).toBe(3);
      expect(partyReadCount).toBe(1);
      expect(privacyReadCount).toBe(2);
      expect(selectCount).toBe(mainReadCount + partyReadCount + privacyReadCount);
      console.info(
        'B0_LIST_QUERY_COUNTS',
        JSON.stringify({
          total: selectCount,
          main: mainReadCount,
          party: partyReadCount,
          privacy: privacyReadCount,
        }),
      );
    } finally {
      queryRunnerFactorySpy.mockRestore();
    }
  }, 60_000);
});
