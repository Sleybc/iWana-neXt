import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { IBillingStandingReadPort } from './ports/billing-standing-read.port';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hmacPiiValue, resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  AccessPermissionKey,
  DocumentTypeParty,
  normalizeDocumentNumber,
  SubscriberStatus,
} from '@iwana/shared';
import { hmacPii } from '../../../common/crypto/pii-hash-key.util';
import { decryptAes256Gcm, encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { CrmPersonalDataErasureAdapter } from '../../crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { SubscribersController } from '../../crm/subscribers/subscribers.controller';
import { SubscriberLifecycleService } from '../../crm/subscribers/subscriber-lifecycle.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsService } from './requests.service';
import { anonymizeTitularInTenantSchema } from '../../../cli/anonymize-titular';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * Cierra el hueco de evidencia de V1 QA v1.7: la vista previa y la resolución
 * de una supresión se ejercitan por `PrivacyRequestsService` con el adaptador
 * CRM real y sus siete participantes, sobre un schema tenant creado con la
 * cadena de migraciones vigente (tipos enum incluidos), no con tablas a mano.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const documentNumber = '90000123';
const cliKeys = {
  hashKey: Buffer.from(keyHex, 'hex'),
  activeEncryptionKey: Buffer.from(keyHex, 'hex'),
  previousEncryptionKey: null,
};

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function waitForSubscriberLockWait(dataSource: DataSource): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = (await dataSource.query(
      `SELECT COUNT(*)::int AS waiting
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%ORDER BY id::text FOR UPDATE%'`,
    )) as Array<{ waiting: number }>;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error('La supresión no esperó el bloqueo de fila del suscriptor.');
}

describeWithDb('Privacy erasure por la API — adaptador CRM real en PostgreSQL', () => {
  const schemaName = `tenant_privacy_erasure_${randomBytes(5).toString('hex')}`;
  const q = quoteIdentifier(schemaName);
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const technicianId = randomUUID();
  const ids = {
    expediente: randomUUID(),
    party: randomUUID(),
    subscriber: randomUUID(),
    contract: randomUUID(),
    consent: randomUUID(),
    visit: randomUUID(),
    event: randomUUID(),
    workOrder: randomUUID(),
    executionOrder: randomUUID(),
    operationalTask: randomUUID(),
    otherSubscriber: randomUUID(),
  };
  const configService = {
    getOrThrow: (key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return keyHex;
      throw new Error('Clave sintética no configurada.');
    },
    get: (key: string) => (key === 'PII_ENCRYPTION_KEY' ? keyHex : undefined),
  } as unknown as ConfigService;
  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
    logWithin: jest.fn().mockResolvedValue(undefined),
  };
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest
      .fn()
      .mockResolvedValue([AccessPermissionKey.PRIVACY_READ, AccessPermissionKey.PRIVACY_MANAGE]),
  };

  let dataSource: DataSource;
  let service: PrivacyRequestsService;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'privacy-erasure-it' }, operation);

  async function seedProspectWithFieldWork(): Promise<void> {
    const documentHmac = hmacPii(
      normalizeDocumentNumber(DocumentTypeParty.CC, documentNumber),
      Buffer.from(keyHex, 'hex'),
    );
    const syntheticFiscalDocument = 'synthetic-fiscal-fixture';
    const encryptedFiscalDocument = encryptAes256Gcm(
      syntheticFiscalDocument,
      Buffer.from(keyHex, 'hex'),
    );
    const fiscalDocumentHmac = hmacPiiValue(
      normalizeDocumentNumber(DocumentTypeParty.OTHER, syntheticFiscalDocument),
      Buffer.from(keyHex, 'hex'),
    );
    // El expediente se localiza por HMAC; Party permite verificar contratos enlazados.
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
         (id, tenant_id, full_name, document_type, document_number_hmac,
          fiscal_document_encrypted, fiscal_document_hmac, address, municipality, created_by)
       VALUES ($1, $2, 'Prospecto ficticio', 'CC', $3, $4, $5,
         'Calle ficticia 1', 'Municipio ficticio', $6)`,
      [
        ids.expediente,
        tenantId,
        documentHmac,
        encryptedFiscalDocument,
        fiscalDocumentHmac,
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party
         (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular ficticio')`,
      [ids.party, encryptAes256Gcm('synthetic-party-document', Buffer.from(keyHex, 'hex'))],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4,
         'Nombre ficticio', 'Apellido ficticio', 2, $5, $6, 'STANDARD', 'COMMON',
         'RESPONSABLE', 'Dirección ficticia', $7)`,
      [
        ids.subscriber,
        tenantId,
        ids.party,
        encryptAes256Gcm('synthetic-subscriber-document', Buffer.from(keyHex, 'hex')),
        encryptAes256Gcm('synthetic-email', Buffer.from(keyHex, 'hex')),
        encryptAes256Gcm('synthetic-phone', Buffer.from(keyHex, 'hex')),
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json,
          fiscal_name, fiscal_document_encrypted, fiscal_document_hmac)
       VALUES ($1, $2, $3, 'synthetic-plan', '{}'::jsonb,
         'Nombre fiscal ficticio', $4, $5)`,
      [ids.contract, tenantId, ids.subscriber, encryptedFiscalDocument, fiscalDocumentHmac],
    );
    await dataSource.query(
      `INSERT INTO ${q}.consent_records
         (id, tenant_id, expediente_id, consent_type, status, channel, legal_text_version,
          ip_address)
       VALUES ($1, $2, $3, 'DATA_PROCESSING', 'ACCEPTED', 'PRESENCIAL', 'v-fixture', '192.0.2.10')`,
      [ids.consent, tenantId, ids.expediente],
    );
    await dataSource.query(
      `INSERT INTO ${q}.execution_orders
         (id, tenant_id, execution_order_number, origin_context, customer_display_label,
          work_type, work_summary, service_address)
       VALUES ($1, $2, 'EO-IT-0001', 'CRM', 'Prospecto ficticio', 'INSTALLATION',
         'Instalación para prospecto ficticio', 'Calle ficticia 1')`,
      [ids.executionOrder, tenantId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.schedule_events
         (id, tenant_id, type, title, address, scheduled_start_at, scheduled_end_at,
          assigned_user_id, created_by, expediente_id, execution_order_id)
       VALUES ($1, $2, 'INSTALLATION', 'Visita prospecto ficticio', 'Calle ficticia 1',
         now() + interval '1 day', now() + interval '1 day 2 hours', $3, $4, $5, $6)`,
      [ids.event, tenantId, technicianId, actorId, ids.expediente, ids.executionOrder],
    );
    await dataSource.query(
      `INSERT INTO ${q}.work_orders
         (id, tenant_id, code, type, assigned_user_id, source_context, source_ref, summary,
          notes, created_by, scheduled_event_id)
       VALUES ($1, $2, 'WO-IT-0001', 'INSTALLATION', $3, 'CRM', $4,
         'Instalación prospecto ficticio', 'Nota ficticia', $5, $6)`,
      [ids.workOrder, tenantId, technicianId, ids.expediente, actorId, ids.event],
    );
    await dataSource.query(
      `INSERT INTO ${q}.visit_requests
         (id, tenant_id, status, origin_context, work_type, priority, title, address,
          requested_by_user_id, expediente_id, schedule_event_id, work_order_id,
          execution_order_id)
       VALUES ($1, $2, 'SCHEDULED', 'CRM', 'INSTALLATION', 'NORMAL', 'Visita prospecto ficticio',
         'Calle ficticia 1', $3, $4, $5, $6, $7)`,
      [ids.visit, tenantId, actorId, ids.expediente, ids.event, ids.workOrder, ids.executionOrder],
    );
    // `operational_tasks` guarda sus referencias a WFM como varchar, no uuid.
    await dataSource.query(
      `INSERT INTO ${q}.operational_tasks
         (id, tenant_id, task_number, type, title, description, origin_context,
          responsible_type, responsible_ref_id, recipient_type, execution_mode,
          work_order_id, schedule_event_id)
       VALUES ($1, $2, 'TSK-IT-0001', 'INSTALLATION', 'Tarea prospecto ficticio',
         'Descripción ficticia', 'WFM', 'USER', $3, 'INTERNAL_USER', 'FIELD_SERVICE', $4, $5)`,
      [ids.operationalTask, tenantId, technicianId, ids.workOrder, ids.event],
    );
  }

  async function createVerifiedSuppression(): Promise<string> {
    const created = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId: ids.party,
          requesterKind: 'TITULAR',
          requesterName: 'Titular ficticio de integración',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: documentNumber,
          requesterContact: 'titular@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        },
        actorId,
      ),
    );
    await inTenant(() => service.transition(created.request.id, 'complete', {}, actorId));
    return created.request.id;
  }

  async function insertLifecycleChange(input: {
    subscriberId: string;
    entityType: 'SUBSCRIBER' | 'CONTRACT';
    entityId: string;
    note: string;
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${q}.crm_lifecycle_changes
        (id, tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
         reason_code, note_encrypted, source, batch_id, actor_id)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'CANCELLED',
         'SOLICITUD_TITULAR', $6, 'MANUAL', $7, $8)`,
      [
        id,
        tenantId,
        input.entityType,
        input.entityId,
        input.subscriberId,
        encryptAes256Gcm(input.note, Buffer.from(keyHex, 'hex')),
        randomUUID(),
        actorId,
      ],
    );
    return id;
  }

  async function insertOtherSubscriber(): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, email_encrypted,
         phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', $3,
         'Otra persona sintética', 'Apellido sintético', 2, $4, $5, 'STANDARD', 'COMMON',
         'RESPONSABLE', 'Dirección sintética', $6)`,
      [
        ids.otherSubscriber,
        tenantId,
        encryptAes256Gcm('synthetic-other-document', Buffer.from(keyHex, 'hex')),
        encryptAes256Gcm('synthetic-other-email', Buffer.from(keyHex, 'hex')),
        encryptAes256Gcm('synthetic-other-phone', Buffer.from(keyHex, 'hex')),
        actorId,
      ],
    );
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración privacy erasure API: DB_NAME debe ser test o iwana_it_*; nunca la base de desarrollo.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
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
    await dataSource.query(`CREATE SCHEMA ${q}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Privacy erasure sintético', $2, $3, 'ACTIVE', 'privacy-it@example.invalid')`,
      [tenantId, `privacy-erasure-${schemaName.slice(-10)}`, schemaName],
    );
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `privacy-erasure-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
        {
          provide: IContractImpersonationPort,
          useValue: { suspendForImpersonation: jest.fn() },
        },
        {
          provide: IContractStandingReadPort,
          useValue: {
            standing: jest.fn().mockResolvedValue({
              subscriberIds: [],
              openContractIds: [],
              lastTerminatedAt: null,
            }),
          },
        },
        { provide: MediaService, useValue: { findOne: jest.fn() } },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsService },
        CrmTitularErasureParticipant,
        PartyTitularErasureParticipant,
        UserAccountErasureParticipant,
        WfmTitularErasureParticipant,
        ExecutionOrderTitularErasureParticipant,
        OperationalTaskTitularErasureParticipant,
        MediaTitularErasureParticipant,
        BillingTitularErasureParticipant,
        BillingStandingReadAdapter,
        { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
        AssuranceTitularErasureParticipant,
        NetworkTitularErasureParticipant,
        SupplierProfileReadAdapter,
        CrmPersonalDataErasureAdapter,
        { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
        {
          provide: PrivacyRequestsService,
          inject: [
            getDataSourceToken(),
            ConfigService,
            AuditService,
            IContractImpersonationPort,
            IContractStandingReadPort,
            MediaService,
            EffectivePermissionsService,
            IPersonalDataErasurePort,
            IBillingStandingReadPort,
          ],
          useFactory: (...deps: ConstructorParameters<typeof PrivacyRequestsService>) =>
            new PrivacyRequestsService(...deps),
        },
      ],
    }).compile();
    service = moduleRef.get(PrivacyRequestsService);
    expect(moduleRef.get(IPersonalDataErasurePort)).toBeInstanceOf(CrmPersonalDataErasureAdapter);
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('previsualiza y resuelve la supresión de un prospecto con trabajo de campo', async () => {
    await seedProspectWithFieldWork();
    await insertOtherSubscriber();
    const subscriberEventId = await insertLifecycleChange({
      subscriberId: ids.subscriber,
      entityType: 'SUBSCRIBER',
      entityId: ids.subscriber,
      note: 'synthetic subscriber lifecycle note',
    });
    const contractEventId = await insertLifecycleChange({
      subscriberId: ids.subscriber,
      entityType: 'CONTRACT',
      entityId: ids.contract,
      note: 'synthetic contract lifecycle note',
    });
    const otherEventId = await insertLifecycleChange({
      subscriberId: ids.otherSubscriber,
      entityType: 'SUBSCRIBER',
      entityId: ids.otherSubscriber,
      note: 'synthetic unrelated lifecycle note',
    });
    const requestId = await createVerifiedSuppression();
    const cancellationKey = `privacy-erasure-it-${randomUUID()}`;
    const lifecycleService = new SubscriberLifecycleService(
      dataSource,
      auditService as never,
      { findOpenContractIds: jest.fn().mockResolvedValue([]) } as never,
      { hasOpenWithdrawalOrders: jest.fn().mockResolvedValue(false) } as never,
      configService,
    );
    const cancellation = await inTenant(() =>
      lifecycleService.cancelSubscriber(
        ids.subscriber,
        {
          targetStatus: SubscriberStatus.CANCELLED,
          reasonCode: 'SOLICITUD_TITULAR',
          note: 'synthetic idempotent lifecycle note',
        },
        actorId,
        cancellationKey,
      ),
    );
    expect(cancellation.status).toBe(SubscriberStatus.CANCELLED);

    let controllerAnonymizedAt: Date | null = null;
    const subscriberReadModel = {
      findById: jest.fn().mockImplementation(async () => ({
        id: ids.subscriber,
        partyId: ids.party,
        anonymizedAt: controllerAnonymizedAt,
      })),
    };
    const privacyMarksReadPort = {
      activeMarks: jest.fn().mockResolvedValue({ [ids.party]: ['DATOS_BLOQUEADOS'] }),
      partyIdsWithActiveMark: jest.fn().mockResolvedValue([ids.party]),
    };
    const subscribersController = new SubscribersController(
      subscriberReadModel as never,
      auditService as never,
      effectivePermissionsService as never,
      lifecycleService,
      privacyMarksReadPort as never,
      dataSource,
    );
    auditService.log.mockClear();
    auditService.logWithin.mockClear();
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValueOnce([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    await expect(
      inTenant(() =>
        subscribersController.lifecycleChanges(ids.subscriber, { sub: actorId } as never),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'Subscriber', entityId: ids.subscriber }),
    );
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValueOnce([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
      AccessPermissionKey.PRIVACY_READ,
    ]);
    const blockedHistory = await inTenant(() =>
      subscribersController.lifecycleChanges(ids.subscriber, { sub: actorId } as never),
    );
    expect(blockedHistory.data.map((event) => event.note)).toEqual(
      expect.arrayContaining([
        'synthetic subscriber lifecycle note',
        'synthetic contract lifecycle note',
      ]),
    );
    expect(auditService.logWithin).toHaveBeenCalled();

    const preview = await inTenant(() => service.erasurePreview(requestId));

    expect(preview.eligible).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.candidateExpedienteIds).toEqual([ids.expediente]);
    expect(preview.counts.IDENTIFICACION).toBeGreaterThan(0);
    expect(preview.counts.FISCAL).toBeGreaterThan(0);
    expect(preview.counts.EVIDENCIA_CONSENTIMIENTO).toBeGreaterThan(0);
    expect(preview.counts.OPERACION_CAMPO).toBeGreaterThan(0);
    expect(preview.categories).toEqual(
      expect.arrayContaining([
        'IDENTIFICACION',
        'FISCAL',
        'EVIDENCIA_CONSENTIMIENTO',
        'OPERACION_CAMPO',
      ]),
    );

    const noteBeforeRejectedSuppression = (await dataSource.query(
      `SELECT note_encrypted FROM ${q}.crm_lifecycle_changes WHERE id = $1`,
      [subscriberEventId],
    )) as Array<{ note_encrypted: string | null }>;
    const rejectedSuppression = await inTenant(() =>
      service.transition(
        requestId,
        'resolve',
        {
          responseText: 'Respuesta sintética de rechazo.',
          responseChannel: 'EMAIL',
          erasure: { confirm: true, expedienteIds: [randomUUID()] },
        },
        actorId,
      ),
    ).catch((error: unknown) => error);
    expect(rejectedSuppression).toBeInstanceOf(ConflictException);
    expect((rejectedSuppression as ConflictException).getResponse()).toMatchObject({
      code: 'PRIVACY_ERASURE_CANDIDATES_CHANGED',
    });
    expect(
      await dataSource.query(
        `SELECT note_encrypted FROM ${q}.crm_lifecycle_changes WHERE id = $1`,
        [subscriberEventId],
      ),
    ).toEqual(noteBeforeRejectedSuppression);

    const writer = dataSource.createQueryRunner();
    let suppression: Promise<unknown> | undefined;
    let beforeSnapshot: unknown;
    try {
      await writer.connect();
      await writer.startTransaction();
      await writer.query(`SET LOCAL search_path TO ${q}`);
      await writer.query(`SELECT id FROM subscribers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [
        ids.subscriber,
        tenantId,
      ]);
      suppression = inTenant(() =>
        service.transition(
          requestId,
          'resolve',
          {
            responseText: 'Supresión aplicada en la integración.',
            responseChannel: 'EMAIL',
            erasure: { confirm: true, expedienteIds: preview.candidateExpedienteIds },
          },
          actorId,
        ),
      );
      await waitForSubscriberLockWait(dataSource);
      const concurrentEventId = randomUUID();
      await writer.query(
        `INSERT INTO crm_lifecycle_changes
          (id, tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
           reason_code, note_encrypted, source, batch_id, actor_id)
         VALUES ($1, $2, 'SUBSCRIBER', $3, $3, 'ACTIVE', 'CANCELLED',
           'SOLICITUD_TITULAR', $4, 'MANUAL', $5, $6)`,
        [
          concurrentEventId,
          tenantId,
          ids.subscriber,
          encryptAes256Gcm(
            'synthetic note written while suppression waits',
            Buffer.from(keyHex, 'hex'),
          ),
          randomUUID(),
          actorId,
        ],
      );
      beforeSnapshot = await writer.query(
        `SELECT to_jsonb(change_row) - 'note_encrypted' AS event
           FROM crm_lifecycle_changes AS change_row
          WHERE subscriber_id = $1 ORDER BY id`,
        [ids.subscriber],
      );
      await writer.commitTransaction();
      await suppression;
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      if (suppression) await suppression.catch(() => undefined);
      if (!writer.isReleased) await writer.release();
    }

    const [request] = (await dataSource.query(
      `SELECT status, erased_at IS NOT NULL AS erased, erasure_categories
         FROM ${q}.data_subject_requests WHERE id = $1`,
      [requestId],
    )) as Array<{ status: string; erased: boolean; erasure_categories: string[] }>;
    expect(request?.status).toBe('RESUELTA');
    expect(request?.erased).toBe(true);
    expect(request?.erasure_categories).toEqual(
      expect.arrayContaining(['IDENTIFICACION', 'OPERACION_CAMPO']),
    );

    const lifecycleSnapshotAfter = await dataSource.query(
      `SELECT to_jsonb(change_row) - 'note_encrypted' AS event
         FROM ${q}.crm_lifecycle_changes AS change_row
        WHERE subscriber_id = $1 ORDER BY id`,
      [ids.subscriber],
    );
    expect(lifecycleSnapshotAfter).toEqual(beforeSnapshot);
    const targetLifecycleRows = (await dataSource.query(
      `SELECT entity_type, note_encrypted FROM ${q}.crm_lifecycle_changes
        WHERE subscriber_id = $1 ORDER BY id`,
      [ids.subscriber],
    )) as Array<{ entity_type: string; note_encrypted: string | null }>;
    expect(targetLifecycleRows).toHaveLength(4);
    expect(targetLifecycleRows.map(({ entity_type }) => entity_type)).toEqual(
      expect.arrayContaining(['SUBSCRIBER', 'CONTRACT']),
    );
    expect(targetLifecycleRows.every(({ note_encrypted }) => note_encrypted === null)).toBe(true);
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS total
           FROM ${q}.crm_lifecycle_changes AS change_row
           JOIN ${q}.subscribers AS subscriber ON subscriber.id = change_row.subscriber_id
          WHERE subscriber.anonymized_at IS NOT NULL AND change_row.note_encrypted IS NOT NULL`,
      ),
    ).toEqual([{ total: 0 }]);
    const [otherLifecycleRow] = (await dataSource.query(
      `SELECT note_encrypted FROM ${q}.crm_lifecycle_changes WHERE id = $1`,
      [otherEventId],
    )) as Array<{ note_encrypted: string | null }>;
    expect(otherLifecycleRow?.note_encrypted).not.toBeNull();
    expect(decryptAes256Gcm(otherLifecycleRow!.note_encrypted!, Buffer.from(keyHex, 'hex'))).toBe(
      'synthetic unrelated lifecycle note',
    );

    controllerAnonymizedAt = new Date();
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValueOnce([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);
    const anonymizedHistory = await inTenant(() =>
      subscribersController.lifecycleChanges(ids.subscriber, { sub: actorId } as never),
    );
    expect(anonymizedHistory.data).toHaveLength(4);
    expect(anonymizedHistory.data.every((event) => event.note === null)).toBe(true);

    for (const idempotencyKey of [cancellationKey, `privacy-erasure-after-${randomUUID()}`]) {
      const rejectedWriter = await inTenant(() =>
        lifecycleService.cancelSubscriber(
          ids.subscriber,
          {
            targetStatus: SubscriberStatus.CANCELLED,
            reasonCode: 'SOLICITUD_TITULAR',
            note: 'synthetic idempotent lifecycle note',
          },
          actorId,
          idempotencyKey,
        ),
      ).catch((error: unknown) => error);
      expect(rejectedWriter).toBeInstanceOf(ConflictException);
      expect((rejectedWriter as ConflictException).getResponse()).toMatchObject({
        code: 'PRIVACY_TITULAR_ANONYMIZED',
      });
    }

    const cliParity = await anonymizeTitularInTenantSchema(
      dataSource,
      schemaName,
      requestId,
      [ids.expediente],
      false,
      cliKeys,
      'apply',
    );
    expect(cliParity.verification.residualFields).toBe(0);
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS total FROM ${q}.crm_lifecycle_changes
          WHERE subscriber_id = $1 AND note_encrypted IS NOT NULL`,
        [ids.subscriber],
      ),
    ).toEqual([{ total: 0 }]);

    expect(
      await dataSource.query(
        `SELECT full_name, document_number_hmac, fiscal_document,
                fiscal_document_encrypted, fiscal_document_hmac, address,
                anonymized_at IS NOT NULL AS marked, anonymized_request_id::text AS request_id
           FROM ${q}.expediente_records WHERE id = $1`,
        [ids.expediente],
      ),
    ).toEqual([
      {
        full_name: 'ANONIMIZADO',
        document_number_hmac: null,
        fiscal_document: null,
        fiscal_document_encrypted: null,
        fiscal_document_hmac: null,
        address: null,
        marked: true,
        request_id: requestId,
      },
    ]);
    expect(
      await dataSource.query(
        `SELECT fiscal_document, fiscal_document_encrypted, fiscal_document_hmac
           FROM ${q}.contracts WHERE id = $1`,
        [ids.contract],
      ),
    ).toEqual([
      { fiscal_document: null, fiscal_document_encrypted: null, fiscal_document_hmac: null },
    ]);
    expect(
      await dataSource.query(`SELECT ip_address FROM ${q}.consent_records WHERE id = $1`, [
        ids.consent,
      ]),
    ).toEqual([{ ip_address: null }]);
    expect(
      await dataSource.query(`SELECT title, address FROM ${q}.visit_requests WHERE id = $1`, [
        ids.visit,
      ]),
    ).toEqual([{ title: 'ANONIMIZADO', address: null }]);
    expect(
      await dataSource.query(`SELECT title, address FROM ${q}.schedule_events WHERE id = $1`, [
        ids.event,
      ]),
    ).toEqual([{ title: 'ANONIMIZADO', address: null }]);
    expect(
      await dataSource.query(`SELECT summary, notes FROM ${q}.work_orders WHERE id = $1`, [
        ids.workOrder,
      ]),
    ).toEqual([{ summary: 'ANONIMIZADO', notes: null }]);
    expect(
      await dataSource.query(
        `SELECT customer_display_label, work_summary, service_address
           FROM ${q}.execution_orders WHERE id = $1`,
        [ids.executionOrder],
      ),
    ).toEqual([
      {
        customer_display_label: 'ANONIMIZADO',
        work_summary: 'ANONIMIZADO',
        service_address: null,
      },
    ]);
    expect(
      await dataSource.query(
        `SELECT title, description FROM ${q}.operational_tasks WHERE id = $1`,
        [ids.operationalTask],
      ),
    ).toEqual([{ title: 'ANONIMIZADO', description: null }]);
  });
});
