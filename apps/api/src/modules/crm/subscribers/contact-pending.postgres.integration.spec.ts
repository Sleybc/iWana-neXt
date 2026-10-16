import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  ConsentStatus,
  ConsentType,
  ExpedienteStatus,
  SubscriberStatus,
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
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscriberCreationService } from './subscriber-creation.service';
import { SubscribersService } from './subscribers.service';
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
      new SubscriberStatusTransitionService(dataSource, auditService),
      auditService,
      new PartyWriteAdapter(testConfig),
      privacyAuthorizationAdapter,
      privacyAuthorizationAdapter,
      new LegalTextsService(dataSource, auditService),
      new PrivacyMarksAdapter(dataSource),
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
    ).rejects.toMatchObject({ response: { code: 'SUBSCRIBER_CONTACT_REQUIRED' } });
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
      subscribersService.update(subscriberId, { email: 'synthetic-contact@example.test' }, actorId),
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
});
