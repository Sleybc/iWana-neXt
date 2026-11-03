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
import { PlanCatalogReadPort } from '../../commercial/ports/plan-catalog-read.port';
import { Subscriber } from './entities/subscriber.entity';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscriberLifecycleService } from './subscriber-lifecycle.service';
import { VatTreatmentService } from './vat-treatment.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('B2 — PATCH subscriber audit PII en PostgreSQL real', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tenantId = randomUUID();
  const tenantSlug = `b2-audit-${tenantId.slice(0, 8)}`;
  const testSchemaName = `tenant_b2_audit_${randomUUID().replace(/-/g, '')}`;
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
    tenantSlug,
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

    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Subscriber audit synthetic',
        tenantSlug,
        testSchemaName,
        'subscriber-audit@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${testSchemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, testSchemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    actor.tenantId = tenantId;

    actor.schemaName = testSchemaName;

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
          provide: PlanCatalogReadPort,
          useValue: {
            getActivePlans: jest.fn().mockResolvedValue([]),
            getPlansByIds: jest.fn().mockResolvedValue(new Map()),
            getPlanById: jest.fn().mockResolvedValue(null),
            createSnapshot: jest.fn(),
          },
        },
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
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
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
