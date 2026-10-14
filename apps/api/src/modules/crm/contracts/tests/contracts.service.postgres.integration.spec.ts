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
  NetworkType,
  PersonType,
  ServiceUsage,
  UserRole,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import { ContractsController } from '../contracts.controller';
import { MediaController } from '../../../media/media.controller';
import { ContractsService } from '../contracts.service';
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
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { AbacGuard } from '../../../auth/guards/abac.guard';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

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

  const quoteIdentifier = (value: string) => '"' + value.replace(/"/g, '""') + '"';

  async function createContract(input: {
    usage: ServiceUsage | null;
    stratum: number | null;
    support?: string | null;
    personType?: PersonType;
    status?: ContractStatus;
  }): Promise<string> {
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    await runInTenantSchema(dataSource, testSchemaName, async (qr) => {
      await qr.query('INSERT INTO subscribers (id, tenant_id, person_type) VALUES ($1, $2, $3)', [
        subscriberId,
        tenantId,
        input.personType ?? PersonType.NATURAL,
      ]);
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
    await dataSource.query(
      [
        'CREATE TABLE ' + target + '.subscribers (',
        'id uuid PRIMARY KEY,',
        'tenant_id uuid NOT NULL,',
        'person_type varchar(30) NOT NULL,',
        'deleted_at timestamptz NULL',
        ')',
      ].join('\n'),
    );
    await dataSource.query(
      [
        'CREATE TABLE ' + target + '.contracts (',
        'id uuid PRIMARY KEY DEFAULT gen_random_uuid(),',
        'tenant_id uuid NOT NULL,',
        'quote_id uuid NULL,',
        'subscriber_id uuid NOT NULL,',
        'plan_id varchar(120) NOT NULL,',
        'plan_snapshot_json jsonb NOT NULL,',
        'status varchar(20) NOT NULL,',
        'alias varchar(120) NOT NULL,',
        'installation_address varchar(255) NULL,',
        'installation_city varchar(120) NULL,',
        'installation_department varchar(120) NULL,',
        'installation_postal_code varchar(20) NULL,',
        'installation_notes text NULL,',
        'customer_segment varchar(20) NULL,',
        "service_usage varchar(20) NULL CHECK (service_usage IN ('RESIDENTIAL','NON_RESIDENTIAL')) ,",
        'installation_stratum smallint NULL CHECK (installation_stratum BETWEEN 1 AND 6),',
        'stratum_evidence_media_id uuid NULL,',
        'vat_snapshot jsonb NULL,',
        "additional_product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,",
        "additional_service_ids jsonb NOT NULL DEFAULT '[]'::jsonb,",
        'payment_method varchar(30) NULL,',
        'billing_cycle varchar(20) NULL,',
        'fiscal_name varchar(200) NULL,',
        'fiscal_document varchar(30) NULL,',
        'fiscal_address varchar(255) NULL,',
        'start_date date NULL,',
        'end_date date NULL,',
        'created_at timestamptz NOT NULL DEFAULT now(),',
        'updated_at timestamptz NOT NULL DEFAULT now(),',
        'deleted_at timestamptz NULL,',
        "CHECK (service_usage IS DISTINCT FROM 'RESIDENTIAL' OR installation_stratum IS NOT NULL)",
        ')',
      ].join('\n'),
    );
    await dataSource.query(
      'CREATE UNIQUE INDEX uq_contracts_stratum_evidence ON ' +
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
              key === 'STORAGE_DRIVER' ? 'minio' : fallback,
          },
        },
        MediaService,
        { provide: CommercialCatalogReadPort, useValue: planPort },
        { provide: IInternetVatResolverPort, useClass: InternetVatResolverAdapter },
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
    const subscriberId = randomUUID();
    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('INSERT INTO subscribers (id, tenant_id, person_type) VALUES ($1, $2, $3)', [
        subscriberId,
        tenantId,
        PersonType.NATURAL,
      ]),
    );

    const fiscalNameMarker = 'pii-name-marker';
    const fiscalDocumentMarker = 'pii-document-marker';
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
    const contractId = createResponse.body.data.id as string;

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

    // Exactamente una fila por operación: ni el interceptor ni la respuesta duplican la auditoría.
    const contractRows = auditRows.filter((row) => row.entity_id === contractId);
    expect(contractRows.map((row) => row.entity_type)).toEqual([
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
