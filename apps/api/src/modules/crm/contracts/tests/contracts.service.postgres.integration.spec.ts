import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  dataSourceOptions,
  MediaAsset,
  MediaUsage,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import { STORAGE_PORT } from '@iwana/storage';
import {
  AuditAction,
  CustomerSegment,
  DocumentTypeParty,
  NetworkType,
  PersonType,
  ServiceUsage,
  TaxRegime,
  UserRole,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
  normalizeDocumentNumber,
} from '@iwana/shared';
import { hmacPiiValue } from '@iwana/db';
import { decryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import { ContractsController } from '../contracts.controller';
import { MediaController } from '../../../media/media.controller';
import { ContractsService } from '../contracts.service';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { Contract } from '../entities/contract.entity';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import { InternetVatResolverAdapter } from '../../../taxation/ports/internet-vat-resolver.adapter';
import { AuditService } from '../../../audit/audit.service';
import { AuditInterceptor } from '../../../audit/audit.interceptor';
import { PlatformAuditService } from '../../../audit/platform-audit.service';
import { MediaService } from '../../../media/media.service';
import { IPrivacyAuthorizationReadPort } from '../../../privacy/ports/privacy-authorization-read.port';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { AbacGuard } from '../../../auth/guards/abac.guard';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;
const integrationCryptoKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describeWithDb('Contratos: IVA por punto de servicio con PostgreSQL real', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let sourceSchemaName: string;
  let testSchemaName: string;
  let vatConcept: VatConcept | null = VatConcept.INTERNET_ACCESS;
  let uploadedMediaAssetIds: string[] = [];

  const storagePort = {
    putObject: jest.fn().mockResolvedValue(undefined),
    getPublicUrl: jest.fn((objectKey: string) => `https://media.test/${objectKey}`),
    getSignedUrl: jest.fn().mockResolvedValue('https://media.test/signed-support'),
  };
  const integrationPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  ]);
  const integrationPdf = Buffer.from('%PDF-1.7\n%integration fixture\n');

  const actor: JwtPayload = {
    sub: '00000000-0000-4000-8000-000000000041',
    email: 'integration-user-hash',
    role: UserRole.ADMIN,
    tenantId: null,
    schemaName: null,
    jti: '00000000-0000-4000-8000-000000000042',
    type: 'tenant',
  };

  const tenantContext = () => ({
    tenantId,
    schemaName: testSchemaName,
    tenantSlug: integrationTenantSlug!,
  });

  // R7: el alta de contrato exige autorización contractual vigente del titular
  // (A18, `requireContractualAuthorization`). El 422 sin autorización ya lo
  // cubre B5; aquí el puerto devuelve activa para aislar el IVA del spec.
  const privacyAuthorizationReadPort = {
    hasActive: jest.fn().mockResolvedValue({
      active: true,
      authorizationId: 'fixture-authorization-1',
      legalTextVersion: 'fixture-legal-v1',
      legacyUnverified: false,
    }),
  };

  const quoteIdentifier = (value: string) => '"' + value.replace(/"/g, '""') + '"';

  // R7: inserta el suscriptor mínimo que la tabla real exige (NOT NULL sin
  // default + `chk_subscriber_person_fields`): satisface ambas ramas del CHECK
  // con valores sintéticos, sin PII. Devuelve el `party_id` que `create`
  // lee desde `ee5e494d`.
  async function insertSubscriber(
    input: {
      personType?: PersonType | undefined;
    } = {},
  ): Promise<{ id: string; partyId: string }> {
    const subscriberId = randomUUID();
    const partyId = randomUUID();
    const tag = subscriberId.slice(0, 8);
    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        [
          'INSERT INTO subscribers (',
          'id, tenant_id, party_id, person_type, customer_segment,',
          'document_type, document_number_encrypted, first_name, last_name, stratum,',
          'nit, business_name, email_encrypted, phone_encrypted,',
          'vat_treatment, tax_regime, vat_responsibility, rut_responsibilities, address, created_by',
          ') VALUES (',
          '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,',
          "'RESPONSABLE', ARRAY['O-13']::text[], $17, $18",
          ')',
        ].join('\n'),
        [
          subscriberId,
          tenantId,
          partyId,
          input.personType ?? PersonType.NATURAL,
          CustomerSegment.RESIDENTIAL,
          'CC',
          'cifrado-' + tag,
          'Fixture',
          'Contratos',
          2,
          '900000000-' + tag,
          'Fixture Contratos SAS',
          'cifrado-' + tag,
          'cifrado-' + tag,
          VatTreatment.STANDARD,
          TaxRegime.SIMPLIFIED,
          'Dirección sintética de fixture',
          actor.sub,
        ],
      ),
    );
    return { id: subscriberId, partyId };
  }

  async function createContract(input: {
    usage: ServiceUsage | null;
    stratum: number | null;
    support?: string | null;
    personType?: PersonType;
    status?: ContractStatus;
  }): Promise<string> {
    const { id: subscriberId } = await insertSubscriber({ personType: input.personType });
    const contractId = randomUUID();
    await runInTenantSchema(dataSource, testSchemaName, async (qr) => {
      const contract = Object.assign(new Contract(), {
        id: contractId,
        tenantId,
        quoteId: null,
        subscriberId,
        planId: 'plan-integration-fixed',
        planSnapshotJson: { id: 'plan-integration-fixed' },
        status: input.status ?? ContractStatus.DRAFT,
        alias: 'Servicio de integración',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        customerSegment: null,
        serviceUsage: input.usage,
        installationStratum: input.stratum,
        stratumEvidenceMediaId: input.support ?? null,
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
        deletedAt: null,
      });
      await qr.manager.save(Contract, contract);
    });
    return contractId;
  }

  async function activate(id: string) {
    return TenantContext.run(tenantContext(), () => app.get(ContractsService).activate(id));
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Contract, Subscriber, AuditLog, MediaAsset],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 5, min: 1 },
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenants[0]) throw new Error('No existe el tenant de integración configurado.');
    tenantId = tenants[0].id;
    sourceSchemaName = tenants[0].schema_name;
    testSchemaName = 'tenant_iva_contract_' + randomUUID().replace(/-/g, '');
    actor.tenantId = tenantId;
    actor.schemaName = testSchemaName;

    const source = quoteIdentifier(sourceSchemaName);
    const target = quoteIdentifier(testSchemaName);
    await dataSource.query('CREATE SCHEMA ' + target);
    await dataSource.query(
      'CREATE TABLE ' + target + '.audit_logs (LIKE ' + source + '.audit_logs INCLUDING ALL)',
    );
    // R7: las tablas del fixture siguen las migraciones del tenant de origen
    // con `LIKE … INCLUDING ALL` (igual que `audit_logs`): el alta de contrato
    // lee `party_id` desde `ee5e494d` y el DDL manual quedó obsoleto (42703).
    await dataSource.query(
      'CREATE TABLE ' + target + '.subscribers (LIKE ' + source + '.subscribers INCLUDING ALL)',
    );
    await dataSource.query(
      'CREATE TABLE ' + target + '.contracts (LIKE ' + source + '.contracts INCLUDING ALL)',
    );
    // La 145 aporta este índice en el origen migrado; se conserva con
    // `IF NOT EXISTS` para el origen sin migrar (lo exige el test de 23505).
    await dataSource.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_stratum_evidence ON ' +
        target +
        '.contracts (stratum_evidence_media_id) WHERE stratum_evidence_media_id IS NOT NULL',
    );

    const planPort = {
      getPlanById: async (_tenantId: string, _schemaName: string, planId: string) => ({
        id: planId,
        name: 'Plan de integración',
        technology: 'FIBER',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 100,
        basePrice: 100,
        installationFee: 0,
        vatConcept,
        networkType: NetworkType.FIXED,
        isActive: true,
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ContractsController, MediaController],
      providers: [
        ContractsService,
        SubscriberFiscalCompletenessService,
        AuditService,
        // Mismo interceptor global que AppModule: la prueba debe cubrir la ruta de auditoría
        // automática, que es por donde se filtró la PII (S-T7-01).
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MediaAsset), useValue: dataSource.getRepository(MediaAsset) },
        { provide: STORAGE_PORT, useValue: storagePort },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) =>
              key === 'STORAGE_DRIVER'
                ? 'minio'
                : key === 'PII_ENCRYPTION_KEY'
                  ? integrationCryptoKeyHex
                  : fallback,
            getOrThrow: () => integrationCryptoKeyHex,
          },
        },
        MediaService,
        { provide: CommercialCatalogReadPort, useValue: planPort },
        { provide: IInternetVatResolverPort, useClass: InternetVatResolverAdapter },
        { provide: IPrivacyAuthorizationReadPort, useValue: privacyAuthorizationReadPort },
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
      .overrideGuard(AbacGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) {
      if (testSchemaName) {
        await dataSource.query(
          'DROP SCHEMA IF EXISTS ' + quoteIdentifier(testSchemaName) + ' CASCADE',
        );
      }
      if (uploadedMediaAssetIds.length > 0) {
        await dataSource.query('DELETE FROM public.media_assets WHERE id = ANY($1::uuid[])', [
          uploadedMediaAssetIds,
        ]);
      }
      await dataSource.destroy();
    }
  });

  async function uploadEvidence(
    contractId: string,
    file = {
      buffer: integrationPng,
      filename: 'support.png',
      contentType: 'image/png',
    },
  ) {
    return TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .post(`/api/v1/crm/contracts/${contractId}/stratum-evidence`)
        .attach('file', file.buffer, { filename: file.filename, contentType: file.contentType }),
    );
  }

  it('resuelve EXEMPT para estrato 2 con soporte contra PostgreSQL', async () => {
    actor.role = UserRole.SALES;
    const id = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });
    const upload = await uploadEvidence(id);
    expect(upload.status).toBe(201);
    uploadedMediaAssetIds.push(upload.body.data.stratumEvidenceMediaId as string);

    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).post(`/api/v1/crm/contracts/${id}/activate`),
    );
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(ContractStatus.ACTIVE);
    expect(response.body.data.vatSnapshot).toMatchObject({
      treatment: VatTreatment.EXEMPT,
      legalBasis: VatLegalBasis.ET_481_H,
      ratePercent: 0,
    });
  });

  it('resuelve EXCLUDED para estrato 3 con soporte contra PostgreSQL', async () => {
    const id = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 3 });
    const upload = await uploadEvidence(id);
    expect(upload.status).toBe(201);
    uploadedMediaAssetIds.push(upload.body.data.stratumEvidenceMediaId as string);
    const result = await activate(id);
    expect(result.vatSnapshot).toMatchObject({
      treatment: VatTreatment.EXCLUDED,
      legalBasis: VatLegalBasis.ET_476_7,
      ratePercent: 0,
    });
  });

  it('resuelve STANDARD para estrato 2 sin soporte contra PostgreSQL', async () => {
    const id = await createContract({
      usage: ServiceUsage.RESIDENTIAL,
      stratum: 2,
      support: null,
    });
    const result = await activate(id);
    expect(result.vatSnapshot).toMatchObject({
      treatment: VatTreatment.STANDARD,
      legalBasis: VatLegalBasis.ET_468,
      ratePercent: 19,
    });
  });

  it('falla con 422 si el plan no tiene concepto fiscal', async () => {
    vatConcept = null;
    const id = await createContract({ usage: ServiceUsage.NON_RESIDENTIAL, stratum: null });
    await expect(activate(id)).rejects.toMatchObject({ status: 422 });
    vatConcept = VatConcept.INTERNET_ACCESS;
  });

  it('falla con 422 si el contrato no tiene uso', async () => {
    const id = await createContract({ usage: null, stratum: null });
    await expect(activate(id)).rejects.toMatchObject({ status: 422 });
  });

  it('falla con 422 si una persona jurídica usa RESIDENTIAL', async () => {
    const id = await createContract({
      usage: ServiceUsage.RESIDENTIAL,
      stratum: 2,
      personType: PersonType.JURIDICA,
    });
    await expect(activate(id)).rejects.toMatchObject({ status: 422 });
  });

  it('PATCH /service-point recalcula el IVA activo y persiste auditoría sin datos personales', async () => {
    const id = await createContract({
      usage: ServiceUsage.RESIDENTIAL,
      stratum: 3,
      status: ContractStatus.ACTIVE,
    });
    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .patch('/api/v1/crm/contracts/' + id + '/service-point')
        .send({
          serviceUsage: ServiceUsage.RESIDENTIAL,
          installationStratum: 2,
        }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.vatSnapshot).toMatchObject({
      treatment: VatTreatment.STANDARD,
      legalBasis: VatLegalBasis.ET_468,
      ratePercent: 19,
    });

    const auditRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT action::text AS action, old_value, new_value ' +
          'FROM audit_logs WHERE entity_id = $1 AND entity_type = $2',
        [id, 'ContractServicePoint'],
      ),
    )) as Array<{ action: string; old_value: unknown; new_value: unknown }>;
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe(AuditAction.UPDATE);
    const serialized = JSON.stringify(auditRows[0]);
    expect(serialized).toContain('changedFields');
    expect(serialized).toContain('STANDARD');
    expect(serialized).not.toContain('"installationStratum":2');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000');
  });

  it('audita crear, activar y /service-point sin persistir nombre ni documento fiscales', async () => {
    const { id: subscriberId } = await insertSubscriber();

    const fiscalNameMarker = 'synthetic-fiscal-name';
    const fiscalDocumentMarker = 'synthetic-fiscal-created';
    const createResponse = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .post('/api/v1/crm/contracts')
        .send({
          subscriberId,
          planId: 'plan-integration-fixed',
          planSnapshotJson: { id: 'plan-integration-fixed' },
          serviceUsage: ServiceUsage.RESIDENTIAL,
          installationStratum: 2,
          fiscalName: fiscalNameMarker,
          fiscalDocument: fiscalDocumentMarker,
        }),
    );
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.fiscalDocument).toBe(fiscalDocumentMarker);
    const contractId = createResponse.body.data.id as string;

    const createdFiscalRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        `SELECT fiscal_document, fiscal_document_encrypted, fiscal_document_hmac
           FROM contracts WHERE id = $1`,
        [contractId],
      ),
    )) as Array<{
      fiscal_document: string | null;
      fiscal_document_encrypted: string;
      fiscal_document_hmac: string;
    }>;
    expect(createdFiscalRows[0]?.fiscal_document).toBeNull();
    expect(
      decryptAes256Gcm(
        createdFiscalRows[0]!.fiscal_document_encrypted,
        Buffer.from(integrationCryptoKeyHex, 'hex'),
      ),
    ).toBe(fiscalDocumentMarker);
    expect(createdFiscalRows[0]?.fiscal_document_hmac).toBe(
      hmacPiiValue(
        normalizeDocumentNumber(DocumentTypeParty.OTHER, fiscalDocumentMarker),
        Buffer.from(integrationCryptoKeyHex, 'hex'),
      ),
    );

    const updatedFiscalDocumentMarker = 'synthetic-fiscal-updated';
    const updateResponse = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .patch(`/api/v1/crm/contracts/${contractId}`)
        .send({ fiscalDocument: updatedFiscalDocumentMarker }),
    );
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.fiscalDocument).toBe(updatedFiscalDocumentMarker);
    const updatedFiscalRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        `SELECT fiscal_document, fiscal_document_encrypted, fiscal_document_hmac
           FROM contracts WHERE id = $1`,
        [contractId],
      ),
    )) as Array<{
      fiscal_document: string | null;
      fiscal_document_encrypted: string;
      fiscal_document_hmac: string;
    }>;
    expect(updatedFiscalRows[0]?.fiscal_document).toBeNull();
    expect(
      decryptAes256Gcm(
        updatedFiscalRows[0]!.fiscal_document_encrypted,
        Buffer.from(integrationCryptoKeyHex, 'hex'),
      ),
    ).toBe(updatedFiscalDocumentMarker);
    expect(updatedFiscalRows[0]?.fiscal_document_hmac).toBe(
      hmacPiiValue(
        normalizeDocumentNumber(DocumentTypeParty.OTHER, updatedFiscalDocumentMarker),
        Buffer.from(integrationCryptoKeyHex, 'hex'),
      ),
    );

    const activateResponse = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).post(`/api/v1/crm/contracts/${contractId}/activate`),
    );
    expect(activateResponse.status).toBe(200);

    const servicePointResponse = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .patch(`/api/v1/crm/contracts/${contractId}/service-point`)
        .send({ installationStratum: 3 }),
    );
    expect(servicePointResponse.status).toBe(200);

    // Se leen todas las filas del schema, no solo las del contrato: así la aserción cubre
    // cualquier fila nueva de otra entidad que el interceptor pudiera haber escrito.
    const auditRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT action::text AS action, entity_type, entity_id, old_value, new_value ' +
          'FROM audit_logs ORDER BY created_at ASC',
      ),
    )) as Array<{
      action: string;
      entity_type: string;
      entity_id: string;
      old_value: unknown;
      new_value: unknown;
    }>;

    // Una fila por cada alta, edición, activación y cambio del punto de servicio.
    const contractRows = auditRows.filter((row) => row.entity_id === contractId);
    expect(contractRows.map((row) => row.entity_type)).toEqual([
      'Contract',
      'Contract',
      'Contract',
      'ContractServicePoint',
    ]);
    const serialized = JSON.stringify(auditRows);
    expect(serialized).not.toContain(fiscalNameMarker);
    expect(serialized).not.toContain(fiscalDocumentMarker);
    expect(serialized).not.toContain('installationNotes');
  });

  it('SALES carga un PDF válido para estrato 2 y activa con EXEMPT', async () => {
    actor.role = UserRole.SALES;
    const id = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });

    const upload = await uploadEvidence(id, {
      buffer: integrationPdf,
      filename: 'support.pdf',
      contentType: 'application/pdf',
    });
    expect(upload.status).toBe(201);
    const mediaId = upload.body.data.stratumEvidenceMediaId as string;
    expect(mediaId).toMatch(/^[0-9a-f-]{36}$/i);
    uploadedMediaAssetIds.push(mediaId);

    const asset = await dataSource.getRepository(MediaAsset).findOneByOrFail({ id: mediaId });
    expect(asset.usage).toBe(MediaUsage.STRATUM_EVIDENCE);
    expect(asset.mimeType).toBe('application/pdf');

    const activated = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).post(`/api/v1/crm/contracts/${id}/activate`),
    );
    expect(activated.status).toBe(200);
    expect(activated.body.data.vatSnapshot).toMatchObject({
      treatment: VatTreatment.EXEMPT,
      legalBasis: VatLegalBasis.ET_481_H,
      ratePercent: 0,
    });
  });

  it('rechaza un PDF cuyos bytes reales no coinciden con application/pdf con 422', async () => {
    const id = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });
    const response = await uploadEvidence(id, {
      buffer: Buffer.from('not a PDF document'),
      filename: 'support.pdf',
      contentType: 'application/pdf',
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('STRATUM_EVIDENCE_TYPE_NOT_ALLOWED');
  });

  it('rechaza stratum_evidence en el endpoint genérico de carga con 400', async () => {
    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .post('/api/v1/media/upload')
        .field('usage', 'stratum_evidence')
        .attach('file', integrationPdf, {
          filename: 'support.pdf',
          contentType: 'application/pdf',
        }),
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('usage')]),
    );
    expect(response.body.message.join(' ')).not.toContain('stratum_evidence');
  });

  it('responde 404 en signed-url genérico para un soporte de contrato', async () => {
    actor.role = UserRole.SALES;
    const id = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });
    const upload = await uploadEvidence(id, {
      buffer: integrationPdf,
      filename: 'support.pdf',
      contentType: 'application/pdf',
    });
    expect(upload.status).toBe(201);
    const mediaId = upload.body.data.stratumEvidenceMediaId as string;
    uploadedMediaAssetIds.push(mediaId);

    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).get(`/api/v1/media/${mediaId}/signed-url`),
    );

    expect(response.status).toBe(404);
  });

  it('un asset heredado con uso GENERAL recalcula el IVA como STANDARD', async () => {
    const asset = await app.get(MediaService).upload(
      testSchemaName,
      { usage: MediaUsage.GENERAL },
      {
        fieldname: 'file',
        originalname: 'legacy.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: integrationPng,
        size: integrationPng.length,
        stream: null as unknown as NodeJS.ReadableStream,
        destination: '',
        filename: '',
        path: '',
      } as Express.Multer.File,
      actor.sub,
    );
    uploadedMediaAssetIds.push(asset.id);
    const id = await createContract({
      usage: ServiceUsage.RESIDENTIAL,
      stratum: 2,
      support: asset.id,
    });

    const result = await activate(id);

    expect(result.vatSnapshot).toMatchObject({
      treatment: VatTreatment.STANDARD,
      legalBasis: VatLegalBasis.ET_468,
      ratePercent: 19,
    });
  });

  it('rechaza que dos contratos apunten al mismo asset de soporte', async () => {
    actor.role = UserRole.SALES;
    const firstContractId = await createContract({
      usage: ServiceUsage.RESIDENTIAL,
      stratum: 2,
    });
    const upload = await uploadEvidence(firstContractId, {
      buffer: integrationPdf,
      filename: 'support.pdf',
      contentType: 'application/pdf',
    });
    expect(upload.status).toBe(201);
    const mediaId = upload.body.data.stratumEvidenceMediaId as string;
    uploadedMediaAssetIds.push(mediaId);

    await expect(
      createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2, support: mediaId }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
  });

  it('rechaza con 400 stratumEvidenceMediaId en todos los cuerpos de contrato', async () => {
    const targets = [
      { method: 'POST', path: '/api/v1/crm/contracts' },
      {
        method: 'POST',
        path: `/api/v1/crm/subscribers/${randomUUID()}/contracts`,
      },
      {
        method: 'POST',
        path: `/api/v1/crm/subscribers/${randomUUID()}/contracts/from-expediente`,
      },
      { method: 'PATCH', path: `/api/v1/crm/contracts/${randomUUID()}` },
      { method: 'PATCH', path: `/api/v1/crm/contracts/${randomUUID()}/service-point` },
    ] as const;

    for (const target of targets) {
      const response = await TenantContext.run(tenantContext(), () => {
        const httpRequest = request(app.getHttpServer());
        return target.method === 'POST'
          ? httpRequest.post(target.path).send({ stratumEvidenceMediaId: randomUUID() })
          : httpRequest.patch(target.path).send({ stratumEvidenceMediaId: randomUUID() });
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('STRATUM_EVIDENCE_SERVER_MANAGED');
    }
  });

  it('rechaza cargar soporte en un punto no residencial con 422', async () => {
    const id = await createContract({ usage: ServiceUsage.NON_RESIDENTIAL, stratum: null });
    const response = await uploadEvidence(id);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('STRATUM_EVIDENCE_NOT_APPLICABLE');
  });

  it('no entrega URL firmada si el contrato no tiene el asset solicitado', async () => {
    actor.role = UserRole.SALES;
    const ownerContractId = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });
    const upload = await uploadEvidence(ownerContractId);
    expect(upload.status).toBe(201);
    const foreignMediaId = upload.body.data.stratumEvidenceMediaId as string;
    uploadedMediaAssetIds.push(foreignMediaId);

    const signed = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).get(
        `/api/v1/crm/contracts/${ownerContractId}/stratum-evidence/signed-url`,
      ),
    );
    expect(signed.status).toBe(200);
    expect(signed.body.data.signedUrl).toBe('https://media.test/signed-support');
    const expiresAt = new Date(signed.body.data.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(300_000);

    const accessAudit = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT action::text AS action, entity_type, new_value FROM audit_logs ' +
          'WHERE entity_id = $1 AND entity_type = $2',
        [ownerContractId, 'STRATUM_EVIDENCE_ACCESS'],
      ),
    )) as Array<{ action: string; entity_type: string; new_value: unknown }>;
    expect(accessAudit).toHaveLength(1);
    expect(accessAudit[0]).toMatchObject({
      action: AuditAction.RECORD_ACCESS,
      entity_type: 'STRATUM_EVIDENCE_ACCESS',
    });
    expect(JSON.stringify(accessAudit[0]?.new_value)).not.toContain('https://');

    const otherContractId = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });
    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer())
        .get(`/api/v1/crm/contracts/${otherContractId}/stratum-evidence/signed-url`)
        .query({ mediaId: foreignMediaId }),
    );
    expect(response.status).toBe(404);
  });

  it('DELETE en contrato activo elimina el soporte, recalcula STANDARD y audita', async () => {
    actor.role = UserRole.SALES;
    const id = await createContract({ usage: ServiceUsage.RESIDENTIAL, stratum: 2 });
    const upload = await uploadEvidence(id);
    expect(upload.status).toBe(201);
    const mediaId = upload.body.data.stratumEvidenceMediaId as string;
    uploadedMediaAssetIds.push(mediaId);

    const activated = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).post(`/api/v1/crm/contracts/${id}/activate`),
    );
    expect(activated.body.data.vatSnapshot.treatment).toBe(VatTreatment.EXEMPT);

    const response = await TenantContext.run(tenantContext(), () =>
      request(app.getHttpServer()).delete(`/api/v1/crm/contracts/${id}/stratum-evidence`),
    );
    expect(response.status).toBe(200);
    expect(response.body.data.stratumEvidenceMediaId).toBeNull();
    expect(response.body.data.vatSnapshot).toMatchObject({
      treatment: VatTreatment.STANDARD,
      legalBasis: VatLegalBasis.ET_468,
      ratePercent: 19,
    });

    const asset = await dataSource.getRepository(MediaAsset).findOneByOrFail({ id: mediaId });
    expect(asset.deletedAt).toBeInstanceOf(Date);
    const auditRows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT action::text AS action, entity_type, new_value FROM audit_logs ' +
          'WHERE entity_id = $1 AND entity_type = $2',
        [id, 'ContractServicePoint'],
      ),
    )) as Array<{ action: string; entity_type: string; new_value: unknown }>;
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      action: AuditAction.UPDATE,
      entity_type: 'ContractServicePoint',
    });
    expect(JSON.stringify(auditRows[0]?.new_value)).toContain('STANDARD');
    expect(JSON.stringify(auditRows[0]?.new_value)).not.toContain(mediaId);
  });

  it('contrato heredado con id de asset inexistente activa con STANDARD', async () => {
    const id = await createContract({
      usage: ServiceUsage.RESIDENTIAL,
      stratum: 2,
      support: randomUUID(),
    });
    const response = await activate(id);
    expect(response.vatSnapshot).toMatchObject({
      treatment: VatTreatment.STANDARD,
      legalBasis: VatLegalBasis.ET_468,
      ratePercent: 19,
    });
  });
});
