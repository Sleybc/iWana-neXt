import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  TaxRegime,
  UserRole,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditService } from '../../audit/audit.service';
import { PlatformAuditService } from '../../audit/platform-audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { encryptAes256Gcm, parseEncryptionKeyHex } from '../../../common/crypto/aes-gcm.util';
import { IPartyWritePort } from '../../parties/ports/party-write.port';
import { Subscriber } from './entities/subscriber.entity';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscriberLifecycleService } from './subscriber-lifecycle.service';
import { VatTreatmentService } from './vat-treatment.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

describeWithDb('B2 — PATCH subscriber audit PII en PostgreSQL real', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let sourceSchemaName: string;
  let testSchemaName: string;
  const encryptionKey = parseEncryptionKeyHex(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  const piiValueDocument = '900111222-1';
  const piiValueAddress = 'Calle PII B2 123';
  const actor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000031',
    email: 'b2-audit-integration@example.test',
    role: UserRole.ADMIN,
    tenantId: '',
    schemaName: '',
    jti: '00000000-0000-4000-8000-000000000032',
    type: 'tenant',
  };

  const tenantContext = () => ({
    tenantId,
    schemaName: testSchemaName,
    tenantSlug: integrationTenantSlug!,
  });

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Subscriber, AuditLog],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenants[0]) throw new Error(`No existe el tenant '${integrationTenantSlug}'.`);
    tenantId = tenants[0].id;
    sourceSchemaName = tenants[0].schema_name;
    actor.tenantId = tenantId;

    testSchemaName = `tenant_b2_audit_${randomUUID().replace(/-/g, '')}`;
    actor.schemaName = testSchemaName;
    const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const sourceSchema = quoteIdentifier(sourceSchemaName);
    const testSchema = quoteIdentifier(testSchemaName);
    await dataSource.query(`CREATE SCHEMA ${testSchema}`);
    await dataSource.query(
      `CREATE TABLE ${testSchema}.subscribers (LIKE ${sourceSchema}.subscribers INCLUDING ALL)`,
    );
    await dataSource.query(
      `CREATE TABLE ${testSchema}.audit_logs (LIKE ${sourceSchema}.audit_logs INCLUDING ALL)`,
    );
    // The development tenant predates the already-merged B1 DDL; keep this
    // isolated fixture compatible with the current entity without migrating it.
    await dataSource.query(
      `ALTER TABLE ${testSchema}.subscribers
         ADD COLUMN IF NOT EXISTS whatsapp_encrypted varchar(500),
         ADD COLUMN IF NOT EXISTS whatsapp_hmac varchar(64)`,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        SubscribersService,
        AuditService,
        VatTreatmentService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'MFA_ENCRYPTION_KEY')
                return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
              if (key === 'PII_HASH_KEY')
                return 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
              throw new Error(`Configuración no esperada: ${key}`);
            },
            get: () => undefined,
          },
        },
        { provide: SubscriberStatusTransitionService, useValue: {} },
        {
          provide: SubscriberLifecycleService,
          useValue: {
            suspend: jest.fn(),
            reactivate: jest.fn(),
            terminate: jest.fn(),
            cancelSubscriber: jest.fn(),
            listHistory: jest.fn(),
            preview: jest.fn(),
            transitionContract: jest.fn(),
          },
        },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: IPrivacyMarksReadPort,
          useValue: {
            activeMarks: jest.fn().mockResolvedValue({}),
            partyIdsWithActiveMark: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: IPartyWritePort, useValue: { ensurePartyWithRole: jest.fn() } },
        {
          provide: PlatformAuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
        }) => {
          context.switchToHttp().getRequest().user = actor;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const subscriber = new Subscriber();
    subscriber.id = randomUUID();
    subscriber.tenantId = tenantId;
    subscriber.userId = null;
    subscriber.partyId = null;
    subscriber.personType = PersonType.NATURAL;
    subscriber.customerSegment = CustomerSegment.RESIDENTIAL;
    subscriber.documentType = DocumentType.CC;
    subscriber.documentNumberEncrypted = encryptAes256Gcm('12345678', encryptionKey);
    subscriber.documentNumberHash = null;
    subscriber.emailHash = null;
    subscriber.phoneHash = null;
    subscriber.firstName = 'B2';
    subscriber.lastName = 'Audit';
    subscriber.stratum = 3;
    subscriber.birthDate = null;
    subscriber.nit = '900123456-7';
    subscriber.nitVerificationDigit = '7';
    subscriber.businessName = null;
    subscriber.commercialName = null;
    subscriber.legalRepresentativeId = null;
    subscriber.emailEncrypted = encryptAes256Gcm('b2@example.test', encryptionKey);
    subscriber.phoneEncrypted = encryptAes256Gcm('3001112222', encryptionKey);
    subscriber.altContactName = null;
    subscriber.altContactPhoneEncrypted = null;
    subscriber.whatsapp = null;
    subscriber.whatsappEncrypted = null;
    subscriber.whatsappHmac = null;
    subscriber.vatTreatment = VatTreatment.EXCLUDED;
    subscriber.vatResponsibility = VatResponsibility.RESPONSABLE;
    subscriber.taxRegime = TaxRegime.SIMPLIFIED;
    subscriber.address = 'Calle inicial';
    subscriber.neighborhood = null;
    subscriber.city = null;
    subscriber.department = null;
    subscriber.postalCode = null;
    subscriber.latitude = null;
    subscriber.longitude = null;
    subscriber.coverageNodeId = null;
    subscriber.expedienteId = null;
    subscriber.convertedAt = null;
    subscriber.activatedAt = null;
    subscriber.manualOverrideReason = null;
    subscriber.status = SubscriberStatus.ACTIVE;
    subscriber.externalId = null;
    subscriber.createdBy = actor.sub;

    await runInTenantSchema(dataSource, testSchemaName, async (qr) => {
      await qr.manager.save(Subscriber, subscriber);
    });
  });

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) {
      if (testSchemaName) {
        const quotedSchema = `"${testSchemaName.replace(/"/g, '""')}"`;
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      }
      await dataSource.destroy();
    }
  });

  it('persiste el PATCH HTTP en audit_logs sin valores personales', async () => {
    const subscriberId = await runInTenantSchema(dataSource, testSchemaName, async (qr) => {
      const rows = (await qr.query('SELECT id FROM subscribers WHERE first_name = $1 LIMIT 1', [
        'B2',
      ])) as Array<{ id: string }>;
      return rows[0]?.id;
    });
    if (!subscriberId) throw new Error('No se sembró el suscriptor de integración B2.');

    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .patch(`/api/v1/crm/subscribers/${subscriberId}`)
        .send({ nit: piiValueDocument, address: piiValueAddress }),
    );
    expect(response.status).toBe(200);

    const auditRows = await runInTenantSchema(dataSource, testSchemaName, async (qr) =>
      qr.query(
        `SELECT old_value, new_value
           FROM audit_logs
          WHERE entity_id = $1 AND entity_type = 'Subscriber' AND action::text = 'UPDATE'`,
        [subscriberId],
      ),
    );
    expect(auditRows).toHaveLength(1);
    const serializedAuditRow = JSON.stringify(auditRows[0]);
    expect(serializedAuditRow).toContain('changedFields');
    expect(serializedAuditRow).not.toContain(piiValueDocument);
    expect(serializedAuditRow).not.toContain(piiValueAddress);
  });
});
