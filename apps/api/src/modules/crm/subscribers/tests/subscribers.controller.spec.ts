import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  VatTreatment,
  TaxRegime,
  DocumentType,
  UserRole,
  ConsentChannel,
  AccessPermissionKey,
  VatResponsibility,
  ExpedienteStatus,
  type RutResponsibility,
  type ContractResponse,
  type Subscriber360Response,
} from '@iwana/shared';
import { SubscribersController } from '../subscribers.controller';
import { SubscribersService } from '../subscribers.service';
import { AuditService } from '../../../audit/audit.service';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { SubscriberTagsService } from '../tags/subscriber-tags.service';
import { Subscriber } from '../entities/subscriber.entity';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import type { Request } from 'express';
import { TenantContext } from '@iwana/db';
import { SubscribersBlockedTitularGuard } from '../guards/subscribers-blocked-titular.guard';
import { SubscriberLifecycleService } from '../subscriber-lifecycle.service';

type OpenApiSchemaShape = {
  $ref?: string;
  type?: string;
  format?: string;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, OpenApiSchemaShape>;
  items?: OpenApiSchemaShape;
};

/**
 * Tests unitarios del SubscribersController.
 * Se mockea SubscribersService para probar la lógica del controlador
 * (sanitización de respuesta, delegación al servicio, manejo de parámetros).
 */
describe('SubscribersController', () => {
  let controller: SubscribersController;
  const guardTargetId = '00000000-0000-4000-a000-000000000101';

  // Mock del servicio con todos los métodos necesarios
  const subscribersServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    transitionStatus: jest.fn(),
    search: jest.fn(),
    getQueueCounts: jest.fn(),
    createFromExpediente: jest.fn(),
    updateSection: jest.fn(),
    get360View: jest.fn(),
  };
  const auditServiceMock = {
    log: jest.fn().mockResolvedValue(undefined),
    logWithin: jest.fn().mockResolvedValue(undefined),
  };
  const dataSourceMock = {
    createQueryRunner: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {},
    })),
  };
  const withTenantContext = <T>(run: () => Promise<T>) =>
    TenantContext.run(
      { tenantId: 'tenant-001', schemaName: 'tenant_test', tenantSlug: 'test' },
      run,
    );
  const privacyMarksReadPortMock = {
    activeMarks: jest.fn().mockResolvedValue({}),
    partyIdsWithActiveMark: jest.fn().mockResolvedValue([]),
  };
  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]),
  };
  const subscriberLifecycleServiceMock = {
    cancelSubscriber: jest.fn().mockResolvedValue({
      id: 'sub-001',
      status: SubscriberStatus.CANCELLED,
      fromStatus: SubscriberStatus.PROSPECT,
    }),
    listHistory: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  };
  const mockRequest = { ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' } } as Request;

  // Usuario autenticado de prueba
  const mockUser = {
    sub: 'user-001',
    email: 'hash',
    role: UserRole.ADMIN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_test',
    jti: 'jti-001',
    type: 'tenant' as const,
  };

  // Suscriptor de prueba con campos descifrados
  const mockSubscriber = {
    id: 'sub-001',
    tenantId: 'tenant-001',
    partyId: 'party-test-001',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumberEncrypted: 'enc:doc',
    firstName: 'Juan',
    lastName: 'Pérez',
    stratum: 3,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    legalRepresentativeId: null,
    legalRepresentativePartyId: null,
    legalRepresentativeDisplayName: null,
    emailEncrypted: 'enc:email',
    phoneEncrypted: 'enc:phone',
    whatsapp: null,
    vatTreatment: VatTreatment.EXCLUDED,
    vatResponsibility: VatResponsibility.RESPONSABLE,
    rutResponsibilities: ['O-13'],
    taxRegime: TaxRegime.SIMPLIFIED,
    address: 'Calle 1 #2-3',
    neighborhood: null,
    city: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    expedienteId: 'exp-001',
    convertedAt: new Date('2026-04-16T00:00:00Z'),
    activatedAt: null,
    manualOverrideReason: null,
    status: SubscriberStatus.LEAD,
    externalId: null,
    createdBy: 'user-001',
    createdAt: new Date('2026-04-16T00:00:00Z'),
    updatedAt: new Date('2026-04-16T00:00:00Z'),
    deletedAt: null,
    // Campos descifrados (agregados por decryptSubscriberFields)
    documentNumber: '12345678',
    email: 'juan@example.com',
    phone: '3001234567',
  };

  const mockContractResponse: ContractResponse = {
    id: '00000000-0000-4000-a000-000000000201',
    tenantId: '00000000-0000-4000-a000-000000000101',
    quoteId: null,
    subscriberId: '00000000-0000-4000-a000-000000000102',
    planId: 'plan-300',
    planSnapshotJson: {},
    status: 'ACTIVE',
    statusReasonCode: null,
    statusChangedAt: null,
    alias: 'Servicio sintético',
    installationAddress: 'Calle sintética 123',
    installationCity: 'Bogotá',
    installationDepartment: 'Cundinamarca',
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
    billingCycleDay: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    titularAnonymizedAt: null,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    deletedAt: null,
  };

  const mockProvisioningReadiness = {
    status: 'PENDIENTE_DE_DATOS',
    title: 'Preparación pendiente',
    message: 'Faltan datos mínimos.',
    canProvision: false,
    retryable: false,
    missingRequirements: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    privacyMarksReadPortMock.activeMarks.mockResolvedValue({});
    effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    subscriberLifecycleServiceMock.cancelSubscriber.mockClear();
    subscriberLifecycleServiceMock.listHistory.mockClear();
    subscribersServiceMock.getQueueCounts.mockResolvedValue({
      active: 1,
      suspended: 2,
      contactPending: 3,
      fiscalIncomplete: 4,
      withoutLiveServices: 5,
    });
    subscribersServiceMock.findById.mockResolvedValue(mockSubscriber);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
        {
          provide: EffectivePermissionsService,
          useValue: effectivePermissionsServiceMock,
        },
        { provide: SubscriberLifecycleService, useValue: subscriberLifecycleServiceMock },
        { provide: IPrivacyMarksReadPort, useValue: privacyMarksReadPortMock },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
      ],
    }).compile();

    controller = module.get<SubscribersController>(SubscribersController);
  });

  it('permite rol NOC en el listado de suscriptores para uso operativo', () => {
    const roles = Reflect.getMetadata('roles', controller.findAll as object) as
      | UserRole[]
      | undefined;
    expect(roles).toEqual([
      UserRole.ADMIN,
      UserRole.NOC,
      UserRole.SALES,
      UserRole.SUPPORT,
      UserRole.ACCOUNTANT,
    ]);
    expect(roles).not.toContain(UserRole.TECHNICIAN);
    expect(roles).not.toContain(UserRole.AUDITOR);
  });

  it('permite solo los cinco roles ratificados en la búsqueda de suscriptores', () => {
    const roles = Reflect.getMetadata('roles', controller.search as object) as
      | UserRole[]
      | undefined;
    expect(roles).toEqual([
      UserRole.ADMIN,
      UserRole.NOC,
      UserRole.SALES,
      UserRole.SUPPORT,
      UserRole.ACCOUNTANT,
    ]);
  });

  it('documenta el envelope y el contrato completo de los resultados del listado', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsServiceMock },
        { provide: SubscriberLifecycleService, useValue: subscriberLifecycleServiceMock },
        { provide: IPrivacyMarksReadPort, useValue: privacyMarksReadPortMock },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('CRM subscribers test').setVersion('1.0').build(),
      );
      const searchResponse = document.paths['/crm/subscribers/search']?.post?.responses?.['200'] as
        | { content?: Record<string, { schema?: OpenApiSchemaShape }> }
        | undefined;
      const responseSchema = searchResponse?.content?.['application/json']?.schema;
      const itemSchema = responseSchema?.properties?.data?.items;

      expect(itemSchema?.required).toContain('hasLiveContracts');
      expect(itemSchema?.required).toContain('anonymizedAt');
      expect(itemSchema?.required).toContain('primaryService');
      expect(itemSchema?.required).toContain('otherLiveServicesCount');
      expect(itemSchema?.properties?.hasLiveContracts).toEqual({ type: 'boolean' });
      expect(itemSchema?.properties?.vatTreatment).not.toHaveProperty('nullable');
      expect(itemSchema?.properties?.anonymizedAt).toEqual({
        type: 'string',
        format: 'date-time',
        nullable: true,
      });
      expect(itemSchema?.properties?.primaryService).toMatchObject({
        type: 'object',
        nullable: true,
      });
      expect(itemSchema?.properties?.otherLiveServicesCount).toEqual({
        type: 'integer',
        minimum: 0,
      });
      expect(itemSchema?.properties).not.toHaveProperty('fiscalCompleteness');

      const listResponse = document.paths['/crm/subscribers']?.get?.responses?.['200'] as
        | { content?: Record<string, { schema?: OpenApiSchemaShape }> }
        | undefined;
      const listSchema = listResponse?.content?.['application/json']?.schema;
      expect(listSchema?.required).toEqual(expect.arrayContaining(['data', 'total', 'meta']));
      expect(listSchema?.properties?.total).toMatchObject({ type: 'integer', minimum: 0 });
      expect(listSchema?.properties?.meta?.$ref).toContain('ListMetaDto');
      const listItem = listSchema?.properties?.data?.items;
      expect(listItem?.properties?.vatTreatment).not.toHaveProperty('nullable');
      expect(listItem?.required).toEqual([
        'id',
        'tenantId',
        'partyId',
        'userId',
        'privacyRestricted',
        'anonymizedAt',
        'anonymizedRequestId',
        'status',
        'personType',
        'customerSegment',
        'stratum',
        'vatTreatment',
        'taxRegime',
        'vatResponsibility',
        'rutResponsibilities',
        'legalRepresentative',
        'expedienteId',
        'convertedAt',
        'activatedAt',
        'documentType',
        'firstName',
        'lastName',
        'businessName',
        'commercialName',
        'createdAt',
        'updatedAt',
        'contactPending',
        'hasLiveContracts',
        'primaryService',
        'otherLiveServicesCount',
        'documentNumberRestricted',
      ]);
      expect(Object.keys(listItem?.properties ?? {}).sort()).toEqual(
        [
          'privacyMarks',
          // ADR-110 D8: etiquetas manuales (campo opcional nuevo).
          'tags',
          'documentNumber',
          'documentNumberRestricted',
          'nit',
          'nitVerificationDigit',
          'phone',
          'altContactPhone',
          'whatsapp',
          'email',
          'address',
          'neighborhood',
          'city',
          'department',
          'latitude',
          'longitude',
          'id',
          'tenantId',
          'partyId',
          'userId',
          'privacyRestricted',
          'anonymizedAt',
          'anonymizedRequestId',
          'status',
          'personType',
          'customerSegment',
          'stratum',
          'vatTreatment',
          'taxRegime',
          'vatResponsibility',
          'rutResponsibilities',
          'legalRepresentative',
          'expedienteId',
          'convertedAt',
          'activatedAt',
          'documentType',
          'firstName',
          'lastName',
          'businessName',
          'commercialName',
          'createdAt',
          'updatedAt',
          'contactPending',
          'hasLiveContracts',
          'primaryService',
          'otherLiveServicesCount',
        ].sort(),
      );
      expect(itemSchema).toEqual(listItem);

      const listOperation = document.paths['/crm/subscribers']?.get as
        | { parameters?: Array<{ name: string; in: string }> }
        | undefined;
      expect(listOperation?.parameters?.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['contactPending', 'fiscalIncomplete', 'withoutLiveServices']),
      );
      const queueSchema = document.paths['/crm/subscribers/queue-counts']?.get?.responses?.[
        '200'
      ] as { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> };
      expect(queueSchema.content?.['application/json']?.schema?.properties).toEqual(
        expect.objectContaining({
          active: expect.objectContaining({ type: 'integer' }),
          suspended: expect.objectContaining({ type: 'integer' }),
          contactPending: expect.objectContaining({ type: 'integer' }),
          fiscalIncomplete: expect.objectContaining({ type: 'integer' }),
          withoutLiveServices: expect.objectContaining({ type: 'integer' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  // ── POST /crm/subscribers ──

  describe('create', () => {
    it('crea un suscriptor persona natural y delega al servicio', async () => {
      subscribersServiceMock.create.mockResolvedValue(mockSubscriber);
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
        AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ,
      ]);

      const dto = {
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        documentType: DocumentType.CC,
        documentNumber: '12345678',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        email: 'juan@example.com',
        phone: '3001234567',
        address: 'Calle 1 #2-3',
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'] as RutResponsibility[],
        authorizationChannel: ConsentChannel.TELEFONO,
        authorizations: [
          {
            purpose: 'TRATAMIENTO_CONTRACTUAL' as const,
            granted: true,
            legalTextId: '00000000-0000-4000-8000-000000000099',
          },
        ],
      };

      const result = await controller.create(dto, mockUser, mockRequest);

      expect(subscribersServiceMock.create).toHaveBeenCalledWith(dto, 'user-001', {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });
      expect(result.data.id).toBe('sub-001');
      // Verificar que la respuesta sanitizada NO incluye campos cifrados internos
      expect(result.data).not.toHaveProperty('documentNumberEncrypted');
      expect(result.data).not.toHaveProperty('emailEncrypted');
      expect(result.data).not.toHaveProperty('phoneEncrypted');
      // Verificar que incluye campos descifrados
      expect(result.data.email).toBe('juan@example.com');
      expect(result.data.phone).toBe('3001234567');
      expect(result.data.documentNumber).toBe('12345678');
      expect(result.data.fiscalCompleteness).toEqual({ complete: true, missing: [] });
    });

    it('crea un suscriptor persona jurídica y delega al servicio', async () => {
      const juridicaSubscriber = {
        ...mockSubscriber,
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.PYME,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        vatTreatment: VatTreatment.STANDARD,
        taxRegime: TaxRegime.COMMON,
      };

      subscribersServiceMock.create.mockResolvedValue(juridicaSubscriber);

      const dto = {
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.PYME,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        email: 'contacto@empresa.co',
        phone: '6011234567',
        address: 'Av. El Dorado #50-20',
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'] as RutResponsibility[],
        authorizationChannel: ConsentChannel.EMAIL,
        authorizations: [
          {
            purpose: 'TRATAMIENTO_CONTRACTUAL' as const,
            granted: true,
            legalTextId: '00000000-0000-4000-8000-000000000099',
          },
        ],
      };

      const result = await controller.create(dto, mockUser, mockRequest);

      expect(subscribersServiceMock.create).toHaveBeenCalledWith(dto, 'user-001', {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });
      expect(result.data.personType).toBe(PersonType.JURIDICA);
      expect(result.data.vatTreatment).toBe(VatTreatment.STANDARD);
    });
  });

  // ── GET /crm/subscribers ──

  describe('findAll', () => {
    it('lista suscriptores con filtros y paginación', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          nextCursor: null,
          totalIsEstimate: false,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });

      const result = await controller.findAll(
        mockUser,
        SubscriberStatus.LEAD,
        PersonType.NATURAL,
        CustomerSegment.RESIDENTIAL,
        3,
        1,
        20,
      );

      expect(subscribersServiceMock.findAll).toHaveBeenCalledWith({
        status: SubscriberStatus.LEAD,
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        stratum: 3,
        page: 1,
        limit: 20,
        sortBy: undefined,
        sortDir: undefined,
        contactPending: undefined,
        fiscalIncomplete: undefined,
        withoutLiveServices: undefined,
        canSeeBlocked: false,
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('lista suscriptores sin filtros', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          nextCursor: null,
          totalIsEstimate: false,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });

      const result = await controller.findAll(
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(subscribersServiceMock.findAll).toHaveBeenCalledWith({
        status: undefined,
        personType: undefined,
        customerSegment: undefined,
        stratum: undefined,
        page: undefined,
        limit: undefined,
        sortBy: undefined,
        sortDir: undefined,
        contactPending: undefined,
        fiscalIncomplete: undefined,
        withoutLiveServices: undefined,
        canSeeBlocked: false,
      });
      expect(result.data).toHaveLength(1);
    });

    it('redacta PII de suscriptores anonimizados en listado y búsqueda exacta', async () => {
      const anonymizedAt = new Date('2026-10-14T00:00:00.000Z');
      const anonymizedSubscriber = {
        ...mockSubscriber,
        anonymizedAt,
        privacyMarks: ['DATOS_BLOQUEADOS'],
        documentNumber: 'DOCUMENT-SENTINEL',
        firstName: 'FIRSTNAME-SENTINEL',
        email: 'EMAIL-SENTINEL',
        stratum: 5,
        primaryService: {
          contractId: '00000000-0000-4000-8000-000000000102',
          planName: 'Plan permitido',
          status: 'ACTIVE',
          city: 'CITY-SENTINEL',
          alias: 'ALIAS-SENTINEL',
        },
      } as unknown as Subscriber;
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [anonymizedSubscriber],
        total: 1,
        meta: {},
      });
      subscribersServiceMock.search.mockResolvedValue([anonymizedSubscriber]);

      const listResult = await controller.findAll(
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      const searchResult = await controller.search({ nit: 'NIT-SENTINEL' }, mockUser);

      for (const result of [listResult, searchResult]) {
        expect(result.data[0]).toMatchObject({
          privacyRestricted: false,
          anonymizedAt: anonymizedAt.toISOString(),
          documentNumber: null,
          firstName: null,
          email: null,
          stratum: null,
          primaryService: {
            planName: 'Plan permitido',
            status: 'ACTIVE',
            city: null,
            alias: null,
          },
        });
        expect(JSON.stringify(result.data[0])).not.toContain('SENTINEL');
      }
    });

    it('acepta y delega los filtros operativos booleanos', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({ data: [], total: 0, meta: {} });
      await controller.findAll(
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        false,
        true,
      );

      expect(subscribersServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          contactPending: true,
          fiscalIncomplete: false,
          withoutLiveServices: true,
          canSeeBlocked: false,
        }),
      );
    });
  });

  it('devuelve conteos globales y protege el endpoint con el permiso de lectura', async () => {
    const result = await controller.getQueueCounts();
    expect(result).toEqual({
      active: 1,
      suspended: 2,
      contactPending: 3,
      fiscalIncomplete: 4,
      withoutLiveServices: 5,
    });
    expect(subscribersServiceMock.getQueueCounts).toHaveBeenCalledTimes(1);
    expect(Reflect.getMetadata('permissions', controller.getQueueCounts as object)).toEqual([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
  });

  // ── GET /crm/subscribers/search ──

  describe('search', () => {
    it('busca suscriptor por NIT', async () => {
      subscribersServiceMock.search.mockResolvedValue([
        { ...mockSubscriber, hasLiveContracts: true },
      ]);
      const user = { ...mockUser, role: UserRole.ADMIN } as JwtPayload;

      const result = await controller.search({ nit: '900123456-7' }, user);

      expect(subscribersServiceMock.search).toHaveBeenCalledWith({
        nit: '900123456-7',
        excludeBlocked: true,
        canSeeBlocked: false,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('hasLiveContracts', true);
      expect(result.data[0]).toHaveProperty('email', 'juan@example.com');
      expect(result.data[0]).toHaveProperty('tenantId', 'tenant-001');
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LIST_ACCESS',
          newValue: expect.objectContaining({
            filters: expect.objectContaining({ exactCriteria: '(aplicado)' }),
          }),
        }),
      );
    });

    it('busca suscriptor por email', async () => {
      subscribersServiceMock.search.mockResolvedValue([mockSubscriber]);
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ,
      ]);
      const user = { ...mockUser, role: UserRole.ACCOUNTANT } as JwtPayload;

      const result = await controller.search({ email: 'juan@example.com' }, user);

      expect(subscribersServiceMock.search).toHaveBeenCalledWith({
        email: 'juan@example.com',
        excludeBlocked: true,
        canSeeBlocked: false,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('email');
      expect(result.data[0]).toHaveProperty('documentNumber', '12345678');
    });

    it('busca libremente y registra solo marcador, nunca el texto', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: { page: 1, limit: 20, total: 1 },
      });
      const user = { ...mockUser, role: UserRole.ADMIN } as JwtPayload;

      const result = await controller.search({ search: 'Ana Privada' }, user);

      expect(subscribersServiceMock.findAll).toHaveBeenCalledWith({
        status: undefined,
        personType: undefined,
        customerSegment: undefined,
        stratum: undefined,
        page: undefined,
        limit: undefined,
        sortBy: undefined,
        sortDir: undefined,
        contactPending: undefined,
        fiscalIncomplete: undefined,
        withoutLiveServices: undefined,
        search: 'Ana Privada',
        excludeBlocked: true,
        canSeeBlocked: false,
      });
      expect(result.data[0]).toHaveProperty('id', 'sub-001');
      const auditEntry = JSON.stringify(auditServiceMock.log.mock.calls.at(-1)?.[0]);
      expect(auditEntry).toContain('(aplicado)');
      expect(auditEntry).not.toContain('Ana Privada');
    });
  });

  // ── GET /crm/subscribers/:id ──

  describe('findById', () => {
    it('obtiene suscriptor por ID con PII descifrado', async () => {
      subscribersServiceMock.findById.mockResolvedValue(mockSubscriber);

      const result = await controller.findById('sub-001', mockUser);

      expect(subscribersServiceMock.findById).toHaveBeenCalledWith('sub-001', false);
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECORD_ACCESS', entityId: 'sub-001' }),
      );
      expect(result.data.id).toBe('sub-001');
      expect(result.data.email).toBe('juan@example.com');
      expect(result.data.partyId).toBe('party-test-001');
      const auditPayload = JSON.stringify(auditServiceMock.log.mock.calls.at(-1)?.[0]);
      expect(auditPayload).not.toContain('partyId');
      expect(auditPayload).not.toContain('party-test-001');
    });

    it('incluye partyId nulo para un suscriptor heredado y no lo agrega a auditoría', async () => {
      subscribersServiceMock.findById.mockResolvedValue({ ...mockSubscriber, partyId: null });

      const result = await controller.findById('sub-001', mockUser);

      expect(result.data).toHaveProperty('partyId', null);
      const auditPayload = JSON.stringify(auditServiceMock.log.mock.calls.at(-1)?.[0]);
      expect(auditPayload).not.toContain('partyId');
    });

    it('redacta una lectura individual bloqueada sin permiso especial', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });

      const result = await controller.findById('sub-001', mockUser);

      expect(result.data).toMatchObject({
        privacyRestricted: true,
        firstName: null,
        documentNumber: null,
        email: null,
        address: null,
        contactPending: false,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
        fiscalCompleteness: { complete: true, missing: [] },
      });
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECORD_ACCESS', entityId: 'sub-001' }),
      );
    });

    it('permite lectura bloqueada y audita el permiso CRM dedicado', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        'crm.blocked_data.read',
      ]);

      const result = await withTenantContext(() => controller.findById('sub-001', mockUser));

      expect(result.data).toMatchObject({ privacyRestricted: false, firstName: 'Juan' });
      expect(auditServiceMock.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          newValue: expect.objectContaining({
            privacyMark: 'DATOS_BLOQUEADOS',
            grantedBy: 'CRM_BLOCKED_DATA_READ',
          }),
        }),
        expect.any(Object),
      );
    });

    it('no entrega la lectura privilegiada bloqueada si falla la auditoría transaccional', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_BLOCKED_DATA_READ,
      ]);
      auditServiceMock.logWithin.mockRejectedValueOnce(new Error('synthetic audit failure'));

      const request = withTenantContext(() => controller.findById('sub-001', mockUser));
      const error = await request.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'PRIVACY_AUDIT_UNAVAILABLE',
      });
    });
  });

  // ── PATCH /crm/subscribers/:id ──

  describe('update', () => {
    it('actualiza suscriptor y recalcula IVA si cambia personType', async () => {
      const updatedSubscriber = {
        ...mockSubscriber,
        personType: PersonType.JURIDICA,
        vatTreatment: VatTreatment.STANDARD,
        taxRegime: TaxRegime.COMMON,
      };

      subscribersServiceMock.update.mockResolvedValue(updatedSubscriber);

      const dto = { personType: PersonType.JURIDICA };
      const result = await controller.update('sub-001', dto, mockUser);

      expect(subscribersServiceMock.update).toHaveBeenCalledWith('sub-001', dto, 'user-001');
      expect(result.data.personType).toBe(PersonType.JURIDICA);
      expect(result.data.vatTreatment).toBe(VatTreatment.STANDARD);
    });

    it('actualiza solo campos parciales', async () => {
      const updatedSubscriber = {
        ...mockSubscriber,
        city: 'Medellín',
      };

      subscribersServiceMock.update.mockResolvedValue(updatedSubscriber);

      const dto = { city: 'Medellín' };
      const result = await controller.update('sub-001', dto, mockUser);

      expect(subscribersServiceMock.update).toHaveBeenCalledWith('sub-001', dto, 'user-001');
      expect(result.data.city).toBe('Medellín');
    });

    it('rechaza con 409 la edición de un titular bloqueado', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      const guard = new SubscribersBlockedTitularGuard(
        new Reflector(),
        subscribersServiceMock as never,
        privacyMarksReadPortMock as never,
      );

      await expect(
        guard.canActivate({
          getHandler: () => SubscribersController.prototype.update,
          switchToHttp: () => ({ getRequest: () => ({ params: { id: guardTargetId } }) }),
        } as never),
      ).rejects.toThrow(ConflictException);
      expect(subscribersServiceMock.update).not.toHaveBeenCalled();
    });

    it('permite actualizar una sección cuando no hay marca activa', async () => {
      subscribersServiceMock.updateSection.mockResolvedValue(mockSubscriber);

      const result = await controller.updateSection(
        'sub-001',
        'contact',
        { email: 'contact-test@example.invalid' },
        mockUser,
      );

      expect(subscribersServiceMock.updateSection).toHaveBeenCalledWith(
        'sub-001',
        'contact',
        { email: 'contact-test@example.invalid' },
        'user-001',
      );
      expect(result.data.id).toBe('sub-001');
    });

    it('rechaza con 409 la edición por sección de un titular bloqueado sin devolver sus datos', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      const guard = new SubscribersBlockedTitularGuard(
        new Reflector(),
        subscribersServiceMock as never,
        privacyMarksReadPortMock as never,
      );

      let responseBody: unknown;
      try {
        await guard.canActivate({
          getHandler: () => SubscribersController.prototype.updateSection,
          switchToHttp: () => ({ getRequest: () => ({ params: { id: guardTargetId } }) }),
        } as never);
      } catch (error) {
        responseBody = (error as ConflictException).getResponse();
      }

      expect(responseBody).toMatchObject({ code: 'PRIVACY_DATA_BLOCKED' });
      expect(responseBody).not.toHaveProperty('firstName');
      expect(responseBody).not.toHaveProperty('documentNumber');
      expect(subscribersServiceMock.updateSection).not.toHaveBeenCalled();
    });
  });

  // ── DELETE /crm/subscribers/:id ──

  describe('remove', () => {
    it('ejecuta soft delete del suscriptor', async () => {
      subscribersServiceMock.remove.mockResolvedValue(undefined);

      const result = await controller.remove('sub-001', mockUser);

      expect(subscribersServiceMock.remove).toHaveBeenCalledWith('sub-001', 'user-001');
      expect(result.data.id).toBe('sub-001');
      expect(result.data.deleted).toBe(true);
    });
  });

  // ── PATCH /crm/subscribers/:id/status ──

  describe('transitionStatus', () => {
    it('transiciona estado del suscriptor con motivo', async () => {
      const transitionedSubscriber = {
        ...mockSubscriber,
        status: SubscriberStatus.PROSPECT,
      };

      subscribersServiceMock.transitionStatus.mockResolvedValue(transitionedSubscriber);

      const dto = {
        targetStatus: SubscriberStatus.PROSPECT as const,
        reason: 'Documentación completa',
      };

      const result = await controller.transitionStatus('sub-001', dto, mockUser);

      expect(subscribersServiceMock.transitionStatus).toHaveBeenCalledWith(
        'sub-001',
        SubscriberStatus.PROSPECT,
        'Documentación completa',
        'user-001',
      );
      expect(result.data.status).toBe(SubscriberStatus.PROSPECT);
    });

    it('rechaza cambios directos a estados derivados', async () => {
      const dto = { targetStatus: SubscriberStatus.SUSPENDED as const };

      await expect(controller.transitionStatus('sub-001', dto, mockUser)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SUBSCRIBER_STATUS_DERIVED' }),
      });
      expect(subscribersServiceMock.transitionStatus).not.toHaveBeenCalled();
    });
  });

  // ── GET /crm/subscribers/:id/lifecycle-changes ──

  describe('lifecycleChanges', () => {
    it('expone la nota a CRM_SUBSCRIBERS_MANAGE para un suscriptor no bloqueado y audita acceso', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
      ]);

      const result = await withTenantContext(() =>
        controller.lifecycleChanges('sub-001', mockUser, 1, 10),
      );

      expect(result).toEqual({ data: [], meta: {} });
      expect(subscribersServiceMock.findById).toHaveBeenCalledWith('sub-001', false);
      expect(subscriberLifecycleServiceMock.listHistory).toHaveBeenCalledWith('sub-001', {
        page: 1,
        limit: 10,
        canReadNote: true,
      });
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECORD_ACCESS', entityId: 'sub-001' }),
      );
    });

    it('audita y deniega todo el historial bloqueado sin permiso de privacidad aunque tenga gestión CRM', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
      ]);

      await expect(
        withTenantContext(() => controller.lifecycleChanges('sub-001', mockUser)),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(subscriberLifecycleServiceMock.listHistory).not.toHaveBeenCalled();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          entityId: 'sub-001',
          newValue: expect.objectContaining({ role: UserRole.ADMIN }),
        }),
      );
      expect(auditServiceMock.logWithin).not.toHaveBeenCalled();
    });

    it('permite historial bloqueado con PRIVACY_READ y audita DATOS_BLOQUEADOS', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
        AccessPermissionKey.PRIVACY_READ,
      ]);

      await withTenantContext(() => controller.lifecycleChanges('sub-001', mockUser));

      expect(subscribersServiceMock.findById).toHaveBeenCalledWith('sub-001', true);
      expect(subscriberLifecycleServiceMock.listHistory).toHaveBeenCalledWith('sub-001', {
        canReadNote: true,
      });
      expect(auditServiceMock.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          entityId: 'sub-001',
          newValue: expect.objectContaining({
            privacyMark: 'DATOS_BLOQUEADOS',
            grantedBy: 'PRIVACY_READ',
          }),
        }),
        expect.any(Object),
      );
    });

    it('permite historial bloqueado con CRM_BLOCKED_DATA_READ y audita el permiso dedicado', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
        AccessPermissionKey.CRM_BLOCKED_DATA_READ,
      ]);

      await withTenantContext(() => controller.lifecycleChanges('sub-001', mockUser));

      expect(subscribersServiceMock.findById).toHaveBeenCalledWith('sub-001', true);
      expect(subscriberLifecycleServiceMock.listHistory).toHaveBeenCalledWith('sub-001', {
        canReadNote: true,
      });
      expect(auditServiceMock.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          entityId: 'sub-001',
          newValue: expect.objectContaining({
            privacyMark: 'DATOS_BLOQUEADOS',
            grantedBy: 'CRM_BLOCKED_DATA_READ',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  // ── GET /crm/subscribers/:id/360 ──

  describe('get360View', () => {
    it.each([
      { permissions: [] as string[] },
      { permissions: [AccessPermissionKey.CRM_BLOCKED_DATA_READ] },
      { permissions: [AccessPermissionKey.PRIVACY_READ] },
    ])('filtra detalles según permiso efectivo $permissions', async ({ permissions }) => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(permissions);
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [{ id: 'authorization-synthetic' }],
        arcoRequests: [{ id: 'request-synthetic' }],
        privacyMarks: ['DATOS_BLOQUEADOS'],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });
      const { data } = await withTenantContext(() => controller.get360View('sub-001', mockUser));
      const allowed = permissions.includes(AccessPermissionKey.PRIVACY_READ);
      expect(data).toHaveProperty('privacyDetailsRestricted', !allowed);
      expect(data.habeasData).toHaveLength(allowed ? 1 : 0);
      expect(data.arcoRequests).toHaveLength(allowed ? 1 : 0);
      expect(data.privacyMarks).toEqual(['DATOS_BLOQUEADOS']);
    });

    it('retorna ficha 360° del suscriptor', async () => {
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        contacts: [],
        contracts: [mockContractResponse],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });

      const result = await withTenantContext(() => controller.get360View('sub-001', mockUser));
      const response: Subscriber360Response = result.data;

      expect(subscribersServiceMock.get360View).toHaveBeenCalledWith('sub-001', false);
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECORD_ACCESS', entityId: 'sub-001' }),
      );
      expect(response.subscriber).toBeDefined();
      expect(response.subscriber.id).toBe('sub-001');
      expect(response.subscriber).toHaveProperty('hasLiveContracts', true);
      expect(response.subscriber.partyId).toBe('party-test-001');
      expect(response.subscriber.createdAt).toBe('2026-04-16T00:00:00.000Z');
      const auditPayload = JSON.stringify(auditServiceMock.log.mock.calls.at(-1)?.[0]);
      expect(auditPayload).not.toContain('partyId');
      expect(auditPayload).not.toContain('party-test-001');
      expect(response.contacts).toEqual([]);
      expect(response.contracts).toMatchObject([
        {
          id: mockContractResponse.id,
          status: 'ACTIVE',
          alias: 'Servicio sintético',
          titularAnonymizedAt: null,
        },
      ]);
      expect(response.quotes).toEqual([]);
      expect(response.habeasData).toEqual([]);
      expect(response.arcoRequests).toEqual([]);
      expect(JSON.parse(JSON.stringify(response)).subscriber.createdAt).toBe(
        '2026-04-16T00:00:00.000Z',
      );
    });

    it('conserva partyId nulo en la ficha 360° sin incorporarlo a auditoría', async () => {
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: { ...mockSubscriber, partyId: null },
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });

      const result = await withTenantContext(() => controller.get360View('sub-001', mockUser));
      const response: Subscriber360Response = result.data;

      expect(response.subscriber).toHaveProperty('partyId', null);
      const auditPayload = JSON.stringify(auditServiceMock.log.mock.calls.at(-1)?.[0]);
      expect(auditPayload).not.toContain('partyId');
    });

    it('redacta suscriptor y campos personales de contratos bloqueados en la ficha 360°', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        privacyMarks: ['DATOS_BLOQUEADOS'],
        contacts: [],
        contracts: [
          {
            ...mockContractResponse,
            alias: 'Datos bloqueados',
            installationAddress: null,
            installationCity: null,
            installationDepartment: null,
            installationPostalCode: null,
            installationNotes: null,
            installationStratum: null,
            stratumEvidenceMediaId: null,
            vatSnapshot: null,
            fiscalName: null,
            fiscalDocument: null,
            fiscalAddress: null,
          },
        ],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        expedienteSummary: {
          id: 'exp-1',
          fullName: 'Identidad expediente',
          status: ExpedienteStatus.EN_COTIZACION,
          source: 'REFERIDO',
          createdAt: '2026-04-16T00:00:00.000Z',
          statusChangedAt: '2026-04-16T00:00:00.000Z',
          paymentMethod: 'TRANSFERENCIA',
          billingCycle: 'MENSUAL',
          fiscalName: 'Identidad expediente',
          interestedPlanId: 'plan-300',
          additionalProductIds: ['producto-1'],
          additionalServiceIds: ['servicio-1'],
          commercialNotes: 'Nota comercial',
        },
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });

      const result = await controller.get360View('sub-001', mockUser);
      const response: Subscriber360Response = result.data;

      expect(response.subscriber).toMatchObject({ privacyRestricted: true, firstName: null });
      expect(response.contracts[0]).toMatchObject({
        alias: 'Datos bloqueados',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        installationStratum: null,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        fiscalName: null,
        fiscalDocument: null,
        fiscalAddress: null,
      });
      expect(response.expedienteSummary).toEqual({
        id: 'exp-1',
        fullName: null,
        status: ExpedienteStatus.EN_COTIZACION,
        source: 'REFERIDO',
        createdAt: '2026-04-16T00:00:00.000Z',
        statusChangedAt: '2026-04-16T00:00:00.000Z',
        paymentMethod: null,
        billingCycle: null,
        fiscalName: null,
        interestedPlanId: null,
        additionalProductIds: null,
        additionalServiceIds: null,
        commercialNotes: null,
      });
      expect(JSON.parse(JSON.stringify(response)).expedienteSummary).toEqual(
        response.expedienteSummary,
      );
    });

    it('permite la lectura privilegiada bloqueada y registra PRIVACY_READ', async () => {
      privacyMarksReadPortMock.activeMarks.mockResolvedValue({
        'party-test-001': ['DATOS_BLOQUEADOS'],
      });
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.PRIVACY_READ,
      ]);
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        privacyMarks: ['DATOS_BLOQUEADOS'],
        contacts: [],
        contracts: [mockContractResponse],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });

      const result = await withTenantContext(() => controller.get360View('sub-001', mockUser));
      const response: Subscriber360Response = result.data;

      expect(response.subscriber.privacyRestricted).toBe(false);
      expect(response.subscriber.firstName).not.toBeNull();
      expect(response.contracts[0]).toMatchObject({ alias: 'Servicio sintético' });
      expect(auditServiceMock.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          newValue: expect.objectContaining({
            privacyMark: 'DATOS_BLOQUEADOS',
            grantedBy: 'PRIVACY_READ',
          }),
        }),
        expect.any(Object),
      );
    });

    it('serializa la ficha anonimizada conforme al contrato compartido', async () => {
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: {
          ...mockSubscriber,
          anonymizedAt: new Date('2026-04-20T12:30:00.000Z'),
          anonymizedRequestId: 'request-001',
        },
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        privacyMarks: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });

      const result = await withTenantContext(() => controller.get360View('sub-001', mockUser));
      const response: Subscriber360Response = result.data;

      expect(response.subscriber).toMatchObject({
        anonymizedAt: '2026-04-20T12:30:00.000Z',
        anonymizedRequestId: 'request-001',
        privacyRestricted: false,
        firstName: null,
      });
      expect(JSON.parse(JSON.stringify(response)).subscriber).toEqual(response.subscriber);
    });
  });

  // ── Sanitización de respuesta ──

  describe('sanitizeResponse', () => {
    it('serializa birthDate Date con sus componentes UTC, sin publicar el instante', () => {
      const subscriber = {
        ...mockSubscriber,
        birthDate: new Date('1990-05-02T01:30:00.000Z'),
      };

      expect(sanitizeResponse(subscriber).birthDate).toBe('1990-05-02');
    });

    it('elimina campos cifrados internos de la respuesta', () => {
      const subscriber = {
        ...mockSubscriber,
        documentNumberEncrypted: 'iv:authTag:ciphertext',
        emailEncrypted: 'iv:authTag:ciphertext',
        phoneEncrypted: 'iv:authTag:ciphertext',
      };

      const result = sanitizeResponse(subscriber);

      // No debe incluir campos cifrados internos
      expect(result).not.toHaveProperty('documentNumberEncrypted');
      expect(result).not.toHaveProperty('emailEncrypted');
      expect(result).not.toHaveProperty('phoneEncrypted');

      // Debe incluir campos descifrados
      expect(result.documentNumber).toBe('12345678');
      expect(result.email).toBe('juan@example.com');
      expect(result.phone).toBe('3001234567');

      // Debe incluir campos públicos
      expect(result.id).toBe('sub-001');
      expect(result.personType).toBe(PersonType.NATURAL);
      expect(result.customerSegment).toBe(CustomerSegment.RESIDENTIAL);
      expect(result.vatTreatment).toBe(VatTreatment.EXCLUDED);
      expect(result.taxRegime).toBe(TaxRegime.SIMPLIFIED);
      expect(result.status).toBe(SubscriberStatus.LEAD);
    });

    it('incluye campos de persona jurídica cuando existen', () => {
      const juridicaSubscriber = {
        ...mockSubscriber,
        personType: PersonType.JURIDICA,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        commercialName: 'Empresa XYZ Comercial',
        legalRepresentativeId: null,
        legalRepresentativePartyId: 'rep-001',
        legalRepresentativeDisplayName: 'Representante sintético',
      };

      const result = sanitizeResponse(juridicaSubscriber);

      expect(result.nit).toBe('900123456-7');
      expect(result.businessName).toBe('Empresa XYZ');
      expect(result.commercialName).toBe('Empresa XYZ Comercial');
      expect(result.legalRepresentative).toEqual({
        partyId: 'rep-001',
        displayName: 'Representante sintético',
      });
      expect(result.legalRepresentative).not.toHaveProperty('documentNumber');
    });

    it('no incluye campos descifrados si no existen en el objeto', () => {
      const {
        documentNumber: _documentNumber,
        email: _email,
        phone: _phone,
        ...subscriberWithoutDecrypted
      } = mockSubscriber;

      const result = sanitizeResponse(subscriberWithoutDecrypted);

      expect(result).not.toHaveProperty('documentNumber');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
    });

    it('redacta PII de titulares anonimizados aunque no estén bloqueados', () => {
      const anonymizedSubscriber = {
        ...mockSubscriber,
        anonymizedAt: new Date('2026-10-19T12:00:00.000Z'),
        anonymizedRequestId: 'request-anonymization-001',
        firstName: 'CENTINELA_NOMBRE',
        lastName: 'CENTINELA_APELLIDO',
        documentNumber: 'CENTINELA_DOCUMENTO',
        email: 'centinela@example.invalid',
        phone: 'CENTINELA_TELEFONO',
        altContactPhone: 'CENTINELA_TELEFONO_ALT',
        nit: 'CENTINELA_NIT',
        businessName: 'CENTINELA_RAZON_SOCIAL',
        commercialName: 'CENTINELA_NOMBRE_COMERCIAL',
        legalRepresentativePartyId: 'party-representative-001',
        legalRepresentativeDisplayName: 'CENTINELA_REPRESENTANTE',
        altContactName: 'CENTINELA_CONTACTO',
        whatsapp: 'CENTINELA_WHATSAPP',
        address: 'CENTINELA_DIRECCION',
        neighborhood: 'CENTINELA_BARRIO',
        city: 'CENTINELA_CIUDAD',
        department: 'CENTINELA_DEPARTAMENTO',
        externalId: 'CENTINELA_IDENTIFICADOR',
        manualOverrideReason: 'CENTINELA_MOTIVO',
      };

      const result = sanitizeResponse(anonymizedSubscriber);

      expect(result.privacyRestricted).toBe(false);
      expect(result.anonymizedAt).toBe('2026-10-19T12:00:00.000Z');
      expect(result.anonymizedRequestId).toBe('request-anonymization-001');
      expect(result.contactPending).toBe(false);
      expect(result).toMatchObject({
        firstName: null,
        lastName: null,
        documentNumber: null,
        email: null,
        phone: null,
        altContactPhone: null,
        nit: null,
        businessName: null,
        commercialName: null,
        legalRepresentative: null,
        altContactName: null,
        whatsapp: null,
        address: null,
        neighborhood: null,
        city: null,
        department: null,
        externalId: null,
        manualOverrideReason: null,
      });
    });
  });

  // ── Permiso crm.subscribers.document.read (decisión 2026-11-10) ──

  describe('número de documento del titular', () => {
    const withDocument = [
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
      AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ,
    ];
    const withoutDocument = [
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ];

    function lastAuditValue(): Record<string, unknown> | undefined {
      return (auditServiceMock.log.mock.calls.at(-1)?.[0] as { newValue?: Record<string, unknown> })
        ?.newValue;
    }

    it('detalle sin permiso: enmascarado, indicador en true y auditoría MASKED', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );
      subscribersServiceMock.findById.mockResolvedValue(mockSubscriber);

      const result = await controller.findById('sub-001', mockUser);

      expect(result.data.documentNumber).toBe('••••5678');
      expect(result.data.documentNumberRestricted).toBe(true);
      expect(JSON.stringify(result)).not.toContain('12345678');
      expect(lastAuditValue()).toMatchObject({ documentNumberAccess: 'MASKED' });
    });

    it('detalle con permiso: completo, indicador en false y auditoría FULL sin el número', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withDocument,
      );
      subscribersServiceMock.findById.mockResolvedValue(mockSubscriber);

      const result = await controller.findById('sub-001', mockUser);

      expect(result.data.documentNumber).toBe('12345678');
      expect(result.data.documentNumberRestricted).toBe(false);
      expect(lastAuditValue()).toMatchObject({ documentNumberAccess: 'FULL' });
      expect(JSON.stringify(auditServiceMock.log.mock.calls.at(-1)?.[0])).not.toContain('12345678');
    });

    it('ficha 360° sin permiso enmascara el documento del titular', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        privacyMarks: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: {},
      });

      const result = await controller.get360View('sub-001', mockUser);

      expect(result.data.subscriber.documentNumber).toBe('••••5678');
      expect(result.data.subscriber.documentNumberRestricted).toBe(true);
      expect(JSON.stringify(result)).not.toContain('12345678');
      expect(lastAuditValue()).toMatchObject({ documentNumberAccess: 'MASKED' });
    });

    it('lookup exacto por documento sin permiso: encuentra, pero responde enmascarado', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );
      subscribersServiceMock.search.mockResolvedValue([mockSubscriber]);

      const result = await controller.search({ documentNumber: '12345678' }, mockUser);

      expect(subscribersServiceMock.search).toHaveBeenCalledWith(
        expect.objectContaining({ documentNumber: '12345678' }),
      );
      expect(result.data[0]).toMatchObject({
        documentNumber: '••••5678',
        documentNumberRestricted: true,
      });
      expect(lastAuditValue()).toMatchObject({ documentNumberAccess: 'MASKED' });
    });

    it('listado con permiso entrega el documento completo y lo registra como FULL', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withDocument,
      );
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: { page: 1, limit: 20, total: 1 },
      });

      const result = await controller.findAll(mockUser);

      expect(result.data[0]).toMatchObject({
        documentNumber: '12345678',
        documentNumberRestricted: false,
      });
      expect(lastAuditValue()).toMatchObject({ documentNumberAccess: 'FULL' });
    });

    it('alta con documento sin permiso: 403 SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN sin llamar al servicio', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );

      await expect(
        controller.create(
          {
            personType: PersonType.NATURAL,
            customerSegment: CustomerSegment.RESIDENTIAL,
            documentType: DocumentType.CC,
            documentNumber: '12345678',
          } as never,
          mockUser,
          mockRequest,
        ),
      ).rejects.toMatchObject({
        response: { code: 'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN' },
      });
      expect(subscribersServiceMock.create).not.toHaveBeenCalled();
    });

    it('alta sin documento (persona jurídica) no exige el permiso y responde restringido', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );
      subscribersServiceMock.create.mockResolvedValue({ ...mockSubscriber, documentNumber: null });

      const result = await controller.create(
        { personType: PersonType.JURIDICA, nit: '900111222' } as never,
        mockUser,
        mockRequest,
      );

      expect(subscribersServiceMock.create).toHaveBeenCalled();
      expect(result.data.documentNumberRestricted).toBe(true);
    });

    it('usuario de plataforma: el alta no consulta permisos tenant y ve el documento', async () => {
      subscribersServiceMock.create.mockResolvedValue(mockSubscriber);
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockClear();

      const result = await controller.create(
        { personType: PersonType.NATURAL, documentNumber: '12345678' } as never,
        { ...mockUser, type: 'platform' as const, role: 'SYSTEM_ADMIN' },
        mockRequest,
      );

      expect(effectivePermissionsServiceMock.getEffectivePermissionsForUser).not.toHaveBeenCalled();
      expect(result.data.documentNumber).toBe('12345678');
    });

    it('edición que cambia el documento sin permiso: 403 y no actualiza', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );

      await expect(
        controller.update('sub-001', { documentNumber: '87654321' } as never, mockUser),
      ).rejects.toMatchObject({ response: { code: 'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN' } });
      expect(subscribersServiceMock.update).not.toHaveBeenCalled();
    });

    it('edición que vacía el documento (null) sin permiso también es 403', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );

      await expect(
        controller.update('sub-001', { documentNumber: null } as never, mockUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(subscribersServiceMock.update).not.toHaveBeenCalled();
    });

    it('edición sin tocar el documento sigue permitida sin el permiso y responde enmascarado', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );
      subscribersServiceMock.update.mockResolvedValue(mockSubscriber);

      const result = await controller.update('sub-001', { firstName: 'Juana' } as never, mockUser);

      expect(subscribersServiceMock.update).toHaveBeenCalled();
      expect(result.data.documentNumber).toBe('••••5678');
    });

    it('guardado por sección de identificación con documento sin permiso: 403', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withoutDocument,
      );

      await expect(
        controller.updateSection(
          'sub-001',
          'identification',
          { documentNumber: '87654321' },
          mockUser,
        ),
      ).rejects.toMatchObject({ response: { code: 'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN' } });
      expect(subscribersServiceMock.updateSection).not.toHaveBeenCalled();
    });

    it('guardado por sección con permiso delega y devuelve el documento completo', async () => {
      effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockResolvedValue(
        withDocument,
      );
      subscribersServiceMock.updateSection.mockResolvedValue(mockSubscriber);

      const result = await controller.updateSection(
        'sub-001',
        'identification',
        { documentNumber: '12345678' },
        mockUser,
      );

      expect(subscribersServiceMock.updateSection).toHaveBeenCalled();
      expect(result.data.documentNumber).toBe('12345678');
      expect(result.data.documentNumberRestricted).toBe(false);
    });
  });

  /** Por defecto con el permiso del documento: estas pruebas validan la sanitización. */
  function sanitizeResponse<T extends Record<string, unknown>>(
    subscriber: T,
    canReadDocument = true,
  ): Record<string, unknown> {
    const controllerWithSanitizer = controller as unknown as {
      sanitizeResponse: (
        value: Subscriber,
        privacyMarks: undefined,
        canSeeBlocked: boolean,
        canReadDocument: boolean,
      ) => Record<string, unknown>;
    };
    return controllerWithSanitizer.sanitizeResponse(
      subscriber as unknown as Subscriber,
      undefined,
      false,
      canReadDocument,
    );
  }

  describe('etiquetas manuales (ADR-110 D8)', () => {
    const chip = { id: '70000000-0000-4000-8000-000000000001', name: 'VIP', color: '#123456' };
    const tagsServiceMock = { tagsFor: jest.fn() };
    let tagged: SubscribersController;

    beforeEach(async () => {
      tagsServiceMock.tagsFor.mockImplementation(
        async (ids: string[]) => new Map(ids.map((id) => [id, [chip]])),
      );
      const module: TestingModule = await Test.createTestingModule({
        controllers: [SubscribersController],
        providers: [
          { provide: SubscribersService, useValue: subscribersServiceMock },
          { provide: AuditService, useValue: auditServiceMock },
          { provide: EffectivePermissionsService, useValue: effectivePermissionsServiceMock },
          { provide: SubscriberLifecycleService, useValue: subscriberLifecycleServiceMock },
          { provide: IPrivacyMarksReadPort, useValue: privacyMarksReadPortMock },
          { provide: getDataSourceToken(), useValue: dataSourceMock },
          { provide: SubscriberTagsService, useValue: tagsServiceMock },
        ],
      }).compile();
      tagged = module.get<SubscribersController>(SubscribersController);
    });

    it('findAll agrega las etiquetas de cada fila', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          nextCursor: null,
          totalIsEstimate: false,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });
      const result = await withTenantContext(() => tagged.findAll(mockUser));
      expect(tagsServiceMock.tagsFor).toHaveBeenCalledWith(['sub-001']);
      expect(result.data[0]).toHaveProperty('tags', [chip]);
    });

    it('search agrega las etiquetas', async () => {
      subscribersServiceMock.search.mockResolvedValue([mockSubscriber]);
      const result = await withTenantContext(() =>
        tagged.search({ nit: '900123456-7' }, { ...mockUser, role: UserRole.ADMIN } as JwtPayload),
      );
      expect(result.data[0]).toHaveProperty('tags', [chip]);
    });

    it('findById agrega las etiquetas', async () => {
      subscribersServiceMock.findById.mockResolvedValue(mockSubscriber);
      const result = await withTenantContext(() => tagged.findById('sub-001', mockUser));
      expect(result.data).toHaveProperty('tags', [chip]);
    });

    it('la vista 360 consulta las etiquetas del titular', async () => {
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        privacyMarks: [],
        expedienteSummary: null,
        timelineSeed: [],
        provisioningReadiness: mockProvisioningReadiness,
      });
      const { data } = await withTenantContext(() => tagged.get360View('sub-001', mockUser));
      expect(tagsServiceMock.tagsFor).toHaveBeenCalledWith(['sub-001']);
      expect(JSON.stringify(data)).toContain(chip.id);
    });
  });
});
