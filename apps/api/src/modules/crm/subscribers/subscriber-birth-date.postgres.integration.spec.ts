import { randomBytes, randomUUID } from 'node:crypto';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  UserRole,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import { resolveMigrationDbCredentials, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SubscriberLifecycleService } from './subscriber-lifecycle.service';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { Contract } from '../contracts/entities/contract.entity';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { Subscriber } from './entities/subscriber.entity';
import { Quote } from '../quotes/entities/quote.entity';

const SCHEMA = `tenant_mod05_birth_date_${randomBytes(4).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración birth_date 360°: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Fecha de nacimiento 360° — hidratación de columna date en PostgreSQL real', () => {
  let dataSource: DataSource;
  let testingModule: TestingModule;
  let controller: SubscribersController;
  let service: SubscribersService;
  const tenantId = randomUUID();
  const subscriberId = randomUUID();
  const birthDate = '1990-05-01';
  const actor: JwtPayload = {
    sub: randomUUID(),
    email: 'integration@example.invalid',
    jti: randomUUID(),
    role: UserRole.ADMIN,
    tenantId,
    schemaName: SCHEMA,
    type: 'tenant',
  };
  const tenantContext = { tenantId, schemaName: SCHEMA, tenantSlug: 'birth-date-360' };

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [Subscriber, Contract, Quote],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Birth date synthetic fixture', $2, $3, 'ACTIVE', 'birth-date@example.invalid')`,
      [tenantId, `birth-date-${SCHEMA.slice(-8)}`, SCHEMA],
    );
    // El esquema lo crea la cadena de migraciones del tenant completa (subscribers con su
    // birth_date date real, contracts y quotes), no la 028 sola más un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    const tenantDataSource = createTenantDataSource(dataSource, SCHEMA, `birth-date-${SCHEMA}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await runInTenantSchema(dataSource, SCHEMA, async (queryRunner) => {
      // Columnas obligatorias del esquema migrado (persona natural con documento y estrato).
      await queryRunner.query(
        `INSERT INTO subscribers
          (id, birth_date, deleted_at, tenant_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
           created_by)
         VALUES ($1, $2::date, NULL, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
                 'Synthetic', 'DateOnly', 3, 'STANDARD', 'Calle sintética', $4)`,
        [subscriberId, birthDate, tenantId, actor.sub],
      );
    });

    service = Object.create(SubscribersService.prototype) as SubscribersService;
    Object.defineProperty(service, 'dataSource', { value: dataSource });
    Object.defineProperty(service, 'findById', {
      value: async () => {
        const persisted = await runInTenantSchema(dataSource, SCHEMA, (queryRunner) =>
          queryRunner.manager.findOne(Subscriber, {
            where: { id: subscriberId },
            select: { id: true, birthDate: true },
          }),
        );
        if (!persisted) throw new Error('No se encontró el suscriptor sintético de integración.');
        return Object.assign(new Subscriber(), {
          id: persisted.id,
          tenantId,
          userId: null,
          partyId: null,
          personType: PersonType.NATURAL,
          customerSegment: CustomerSegment.RESIDENTIAL,
          documentType: DocumentType.CC,
          documentNumberEncrypted: null,
          documentNumberHash: null,
          emailHash: null,
          phoneHash: null,
          firstName: 'Synthetic',
          lastName: 'DateOnly',
          stratum: 3,
          birthDate: persisted.birthDate,
          nit: null,
          nitVerificationDigit: null,
          businessName: null,
          commercialName: null,
          legalRepresentativeId: null,
          legalRepresentativePartyId: null,
          legalRepresentativeDisplayName: null,
          emailEncrypted: null,
          phoneEncrypted: null,
          altContactName: null,
          altContactPhoneEncrypted: null,
          whatsapp: null,
          whatsappEncrypted: null,
          whatsappHmac: null,
          vatTreatment: VatTreatment.STANDARD,
          vatResponsibility: VatResponsibility.RESPONSABLE,
          rutResponsibilities: ['O-13'],
          taxRegime: null,
          address: 'Calle sintética',
          neighborhood: null,
          city: null,
          department: null,
          postalCode: null,
          latitude: null,
          longitude: null,
          coverageNodeId: null,
          expedienteId: null,
          convertedAt: null,
          anonymizedAt: null,
          anonymizedRequestId: null,
          activatedAt: null,
          manualOverrideReason: null,
          status: SubscriberStatus.ACTIVE,
          externalId: null,
          createdBy: actor.sub,
          createdAt: new Date('2026-10-31T12:00:00.000Z'),
          updatedAt: new Date('2026-10-31T12:00:00.000Z'),
          deletedAt: null,
        });
      },
    });
    Object.defineProperty(service, 'get360View', {
      value: async () => ({
        subscriber: await service.findById(subscriberId),
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        privacyMarks: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: {},
      }),
    });

    testingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        { provide: SubscribersService, useValue: service },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
        { provide: SubscriberLifecycleService, useValue: {} },
        {
          provide: IPrivacyMarksReadPort,
          useValue: {
            activeMarks: jest.fn().mockResolvedValue({}),
            partyIdsWithActiveMark: jest.fn(),
          },
        },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    controller = testingModule.get(SubscribersController);
  }, 180_000);

  afterAll(async () => {
    await testingModule?.close();
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('serializa birth_date como YYYY-MM-DD en detalle y 360° después de hidratar Subscriber real', async () => {
    const hydrated = await runInTenantSchema(dataSource, SCHEMA, (queryRunner) =>
      queryRunner.manager.findOne(Subscriber, {
        where: { id: subscriberId },
        select: { id: true, birthDate: true },
      }),
    );
    expect(hydrated).not.toBeNull();
    expect(
      hydrated?.birthDate instanceof Date
        ? hydrated.birthDate.toISOString().slice(0, 10)
        : hydrated?.birthDate,
    ).toBe(birthDate);

    const detail = await TenantContext.run(tenantContext, () =>
      controller.findById(subscriberId, actor),
    );
    const view360 = await TenantContext.run(tenantContext, () =>
      controller.get360View(subscriberId, actor),
    );

    expect({
      detail: detail.data.birthDate,
      ficha360: view360.data.subscriber.birthDate,
    }).toEqual({ detail: birthDate, ficha360: birthDate });
  });
});
