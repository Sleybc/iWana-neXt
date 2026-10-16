import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  AccessPermissionKey,
  PlatformRole,
  AcquisitionChannel,
  ContactChannel,
  ContactResult,
  CustomerSegment,
  ExpedienteStatus,
  UserRole,
} from '@iwana/shared';
import { ExpedientesController, PipelineController } from '../expedientes.controller';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteService } from '../expediente.service';
import { PipelineRecommendationService } from '../pipeline-recommendation.service';
import { StatusTransitionService } from '../status-transition.service';
import { ExpedienteDetailBootstrapService } from '../expediente-detail-bootstrap.service';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { AuditService } from '../../../audit/audit.service';
import { TenantContext } from '@iwana/db';
import { ExpedientesBlockedTitularGuard } from '../guards/expedientes-blocked-titular.guard';

describe('ExpedientesController', () => {
  let controller: ExpedientesController;
  let pipelineController: PipelineController;
  const guardTargetId = '00000000-0000-4000-a000-000000000102';

  const expedienteServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    getPrivacyMarksForExpediente: jest.fn().mockResolvedValue([]),
    getTimelineSummary: jest.fn(),
    getTimelinePage: jest.fn(),
    getDocumentSupports: jest.fn(),
    getDocumentSupportFile: jest.fn(),
    uploadDocumentSupport: jest.fn(),
    updateDocumentSupportStatus: jest.fn(),
    deleteDocumentSupport: jest.fn(),
    updateSection: jest.fn(),
    transitionStatus: jest.fn(),
    reactivate: jest.fn(),
    retryConversionEvent: jest.fn(),
    createContactAttempt: jest.fn(),
    listContactAttempts: jest.fn(),
    createConsent: jest.fn(),
    listConsents: jest.fn(),
    listCoverageChecks: jest.fn(),
    getPipelineSummary: jest.fn(),
  };

  const statusTransitionServiceMock = {
    validateTransition: jest.fn(),
  };

  const completenessCalculatorMock = {
    calculate: jest.fn(),
  };

  const pipelineRecommendationServiceMock = {
    getRecommendation: jest.fn(),
  };
  const detailBootstrapServiceMock = {
    getDetailBootstrap: jest.fn(),
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
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_test', tenantSlug: 'test' }, run);
  const effectivePermissionsMock = {
    getEffectivePermissionsForUser: jest
      .fn()
      .mockResolvedValue([AccessPermissionKey.CRM_EXPEDIENTES_READ]),
  };
  const authenticatedReader = {
    sub: 'reader-001',
    email: 'reader@example.invalid',
    role: UserRole.ADMIN,
    tenantId: 'tenant-1',
    schemaName: 'tenant_1',
    jti: 'reader-jti',
    type: 'tenant' as const,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue([]);
    effectivePermissionsMock.getEffectivePermissionsForUser
      .mockReset()
      .mockResolvedValue([AccessPermissionKey.CRM_EXPEDIENTES_READ]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpedientesController],
      providers: [
        { provide: ExpedienteService, useValue: expedienteServiceMock },
        { provide: StatusTransitionService, useValue: statusTransitionServiceMock },
        { provide: CompletenessCalculator, useValue: completenessCalculatorMock },
        {
          provide: PipelineRecommendationService,
          useValue: pipelineRecommendationServiceMock,
        },
        { provide: ExpedienteDetailBootstrapService, useValue: detailBootstrapServiceMock },
        {
          provide: EffectivePermissionsService,
          useValue: effectivePermissionsMock,
        },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
      ],
    }).compile();

    controller = module.get<ExpedientesController>(ExpedientesController);
    pipelineController = new PipelineController(expedienteServiceMock as never);
  });

  it('propaga assignedTo y documentNumber al listado de expedientes', async () => {
    expedienteServiceMock.findAll.mockResolvedValue({ data: [], total: 0 });

    await (controller as any).findAll(
      undefined,
      undefined,
      'Cliente demo',
      1,
      20,
      '00000000-0000-4000-a000-000000000111',
      '900123456',
    );

    expect(expedienteServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Cliente demo',
        assignedTo: '00000000-0000-4000-a000-000000000111',
        documentNumber: '900123456',
        page: 1,
        limit: 20,
      }),
    );
  });

  it('permite rol NOC en el listado de expedientes para soporte operativo', () => {
    const roles = Reflect.getMetadata('roles', controller.findAll as object) as
      | UserRole[]
      | undefined;
    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.ADMIN,
        UserRole.NOC,
        UserRole.SALES,
        UserRole.SUPPORT,
        PlatformRole.SYSTEM_ADMIN,
      ]),
    );
  });

  // La precedencia de view sobre includeCompleted se aplica en la capa de servicio y está cubierta en expediente.service.spec.ts
  it('propaga view e includeCompleted al servicio', async () => {
    expedienteServiceMock.findAll.mockResolvedValue({ data: [], total: 0 });

    await (controller as any).findAll(
      undefined,
      undefined,
      'Cliente demo',
      1,
      20,
      undefined,
      '900123456',
      'true',
      'converted',
    );

    expect(expedienteServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Cliente demo',
        documentNumber: '900123456',
        includeCompleted: true,
        view: 'converted',
      }),
    );
  });

  it('propaga view=all cuando se consulta búsqueda operativa', async () => {
    expedienteServiceMock.findAll.mockResolvedValue({ data: [], total: 0 });

    await (controller as any).findAll(
      undefined,
      undefined,
      'luis',
      1,
      6,
      undefined,
      undefined,
      'false',
      'all',
    );

    expect(expedienteServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'luis',
        page: 1,
        limit: 6,
        view: 'all',
      }),
    );
  });

  it('obtiene el resumen del pipeline desde el servicio dedicado', async () => {
    expedienteServiceMock.getPipelineSummary.mockResolvedValue({
      data: { [ExpedienteStatus.NUEVO_POTENCIAL]: 2 },
      total: 2,
    });

    const result = await pipelineController.getSummary();

    expect(expedienteServiceMock.getPipelineSummary).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: { [ExpedienteStatus.NUEVO_POTENCIAL]: 2 },
      total: 2,
    });
  });

  it('expone el bootstrap del detalle con el expediente dentro de data', async () => {
    const bootstrap = {
      expediente: {
        id: 'exp-1',
        fullName: 'Cliente Demo',
        dataConsentRevoked: false,
        additionalProductIds: null,
        additionalServiceIds: [],
      },
      completeness: {
        commercial: 40,
        legal: 30,
        technical: 20,
        operational: 10,
        overall: 30,
        sectionCompleteness: [],
        installationReadiness: {
          status: 'NOT_READY',
          canTransition: false,
          title: 'No listo para instalación',
          message: 'Completa viabilidad técnica.',
        },
        missingRequirements: [],
      },
      pipelineRecommendation: {
        currentStatus: 'NUEVO_POTENCIAL',
        suggestedStatus: 'PRECALIFICADO',
        recommendationReason: 'Completa validación de contacto para avanzar.',
        blockingRequirements: [],
        informationalRequirements: [],
      },
      operationalMetadata: {
        createdBy: { userId: 'user-1', name: 'Laura Comercial' },
        lastEditedBy: { userId: 'user-1', name: 'Laura Comercial' },
        lastActivityAt: '2026-06-02T10:00:00.000Z',
      },
      currentAttribution: null,
      responsibility: null,
      subscriberSummary: null,
    };
    detailBootstrapServiceMock.getDetailBootstrap.mockResolvedValue({
      ...bootstrap,
    });

    const bootstrapController = controller as ExpedientesController & {
      getBootstrap: (
        id: string,
        user: { sub: string },
      ) => Promise<{ data: Record<string, unknown> }>;
    };
    const roles = Reflect.getMetadata('roles', controller.getBootstrap as object) as
      | Array<UserRole | PlatformRole>
      | undefined;

    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.ADMIN,
        UserRole.SALES,
        UserRole.SUPPORT,
        PlatformRole.SYSTEM_ADMIN,
      ]),
    );

    const result = await bootstrapController.getBootstrap('exp-1', { sub: 'actor-1' });

    expect(detailBootstrapServiceMock.getDetailBootstrap).toHaveBeenCalledWith('exp-1', 'actor-1');
    expect(detailBootstrapServiceMock.getDetailBootstrap).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ data: expect.any(Object) }));
    expect(Object.keys(result.data).sort()).toEqual(
      [
        'completeness',
        'currentAttribution',
        'expediente',
        'operationalMetadata',
        'pipelineRecommendation',
        'responsibility',
        'subscriberSummary',
      ].sort(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          expediente: expect.objectContaining({
            id: 'exp-1',
            dataConsentRevoked: false,
            additionalProductIds: null,
            additionalServiceIds: [],
          }),
          completeness: expect.objectContaining({ overall: 30 }),
          pipelineRecommendation: expect.objectContaining({
            suggestedStatus: 'PRECALIFICADO',
          }),
          operationalMetadata: expect.objectContaining({
            lastActivityAt: '2026-06-02T10:00:00.000Z',
          }),
          currentAttribution: null,
          responsibility: null,
          subscriberSummary: null,
        }),
      }),
    );
  });

  it('redacta la identidad y el contenido derivado del bootstrap bloqueado', async () => {
    expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);
    detailBootstrapServiceMock.getDetailBootstrap.mockResolvedValue({
      expediente: {
        id: 'exp-1',
        tenantId: 'tenant-1',
        fullName: 'Identidad sintética',
        anonymizedAt: null,
        anonymizedRequestId: null,
        privacyMarks: [],
        privacyRestricted: false,
        status: 'PRECALIFICADO',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      completeness: { overall: 88 },
      pipelineRecommendation: { suggestedStatus: 'EN_COTIZACION' },
      operationalMetadata: { createdBy: { name: 'Usuario sintético' } },
      currentAttribution: { actorName: 'Actor sintético' },
      responsibility: { assigneeName: 'Responsable sintético' },
      subscriberSummary: { fullName: 'Suscriptor sintético' },
      conversionFailure: { errorCode: 'SAFE_CODE' },
    });

    const result = await controller.getBootstrap('exp-1', { sub: 'actor-1' } as never);

    expect(result.data.expediente).toMatchObject({
      id: 'exp-1',
      privacyRestricted: true,
      privacyMarks: ['DATOS_BLOQUEADOS'],
      anonymizedAt: null,
      anonymizedRequestId: null,
      fullName: null,
    });
    expect(result.data).toMatchObject({
      completeness: null,
      pipelineRecommendation: null,
      operationalMetadata: null,
      currentAttribution: null,
      responsibility: null,
      subscriberSummary: null,
      conversionFailure: null,
    });
  });

  it('responde 409 al editar una sección de un expediente bloqueado', async () => {
    expedienteServiceMock.findById.mockResolvedValue({ id: guardTargetId, anonymizedAt: null });
    expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);
    const guard = new ExpedientesBlockedTitularGuard(
      new Reflector(),
      expedienteServiceMock as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => ExpedientesController.prototype.updateSection,
        switchToHttp: () => ({ getRequest: () => ({ params: { id: guardTargetId } }) }),
      } as never),
    ).rejects.toThrow(ConflictException);

    expect(expedienteServiceMock.updateSection).not.toHaveBeenCalled();
  });

  it('responde 409 al reintentar conversión de un expediente bloqueado', async () => {
    expedienteServiceMock.findById.mockResolvedValue({ id: guardTargetId, anonymizedAt: null });
    expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);
    const guard = new ExpedientesBlockedTitularGuard(
      new Reflector(),
      expedienteServiceMock as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => ExpedientesController.prototype.retryConversion,
        switchToHttp: () => ({ getRequest: () => ({ params: { id: guardTargetId } }) }),
      } as never),
    ).rejects.toThrow(ConflictException);

    expect(expedienteServiceMock.retryConversionEvent).not.toHaveBeenCalled();
  });

  describe('lecturas de subrecursos de un titular bloqueado', () => {
    it.each([
      'timeline',
      'document-supports',
      'document-support-file',
      'contact-attempts',
      'consents',
      'coverage-checks',
    ] as const)('audita %s dentro de una transacción antes de responder', async (route) => {
      const user = { ...authenticatedReader, role: UserRole.ACCOUNTANT };
      expedienteServiceMock.findById.mockResolvedValue({ id: 'exp-1', anonymizedAt: null });
      expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
        AccessPermissionKey.CRM_BLOCKED_DATA_READ,
      ]);

      let response: unknown;
      const fileResponse = {
        setHeader: jest.fn(),
        download: jest.fn(() => {
          expect(auditServiceMock.logWithin).toHaveBeenCalledTimes(1);
        }),
      };
      switch (route) {
        case 'timeline':
          expedienteServiceMock.getTimelineSummary.mockResolvedValue({
            changes: [],
            activities: [],
          });
          response = await withTenantContext(() => controller.getTimeline('exp-1', user));
          break;
        case 'document-supports':
          expedienteServiceMock.getDocumentSupports.mockResolvedValue([]);
          response = await withTenantContext(() => controller.getDocumentSupports('exp-1', user));
          break;
        case 'document-support-file':
          expedienteServiceMock.getDocumentSupportFile.mockResolvedValue({
            mimeType: 'application/pdf',
            filePath: 'synthetic-path',
            fileName: 'synthetic.pdf',
          });
          response = await withTenantContext(() =>
            controller.getDocumentSupportFile(
              'exp-1',
              'identity',
              'version-1',
              user,
              fileResponse as never,
            ),
          );
          break;
        case 'contact-attempts':
          expedienteServiceMock.listContactAttempts.mockResolvedValue([]);
          response = await withTenantContext(() => controller.listContactAttempts('exp-1', user));
          break;
        case 'consents':
          expedienteServiceMock.listConsents.mockResolvedValue([]);
          response = await withTenantContext(() => controller.listConsents('exp-1', user));
          break;
        case 'coverage-checks':
          expedienteServiceMock.listCoverageChecks.mockResolvedValue([]);
          response = await withTenantContext(() => controller.listCoverageChecks('exp-1', user));
          break;
      }

      if (route === 'document-support-file') {
        expect(fileResponse.download).toHaveBeenCalledTimes(1);
      } else {
        expect(response).toBeDefined();
      }
      const auditEntry = auditServiceMock.logWithin.mock.calls[0]?.[0];
      expect(auditEntry).toMatchObject({
        action: route === 'document-support-file' ? 'RECORD_ACCESS' : 'LIST_ACCESS',
        entityId: 'exp-1',
        newValue: {
          privacyMark: 'DATOS_BLOQUEADOS',
          grantedBy: 'CRM_BLOCKED_DATA_READ',
        },
      });
    });

    it('no entrega datos de consentimientos si falla la auditoría', async () => {
      const user = { ...authenticatedReader, role: UserRole.ACCOUNTANT };
      expedienteServiceMock.findById.mockResolvedValue({ id: 'exp-1', anonymizedAt: null });
      expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);
      expedienteServiceMock.listConsents.mockResolvedValue([{ id: 'synthetic-consent' }]);
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
        AccessPermissionKey.CRM_BLOCKED_DATA_READ,
      ]);
      auditServiceMock.logWithin.mockRejectedValueOnce(new Error('synthetic audit failure'));

      const error = await withTenantContext(() => controller.listConsents('exp-1', user)).catch(
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'PRIVACY_AUDIT_UNAVAILABLE',
      });
    });
  });

  it('acepta pipelineRecommendation nula según el contrato del bootstrap', async () => {
    detailBootstrapServiceMock.getDetailBootstrap.mockResolvedValue({
      expediente: { id: 'exp-1', fullName: 'Cliente Demo' },
      completeness: {},
      pipelineRecommendation: null,
      operationalMetadata: {},
      currentAttribution: null,
      responsibility: null,
      subscriberSummary: null,
    });

    const result = await (
      controller.getBootstrap as unknown as (
        id: string,
        user: { sub: string },
      ) => Promise<{ data: { pipelineRecommendation: unknown } }>
    )('exp-1', {
      sub: 'actor-1',
    });

    expect(result.data.pipelineRecommendation).toBeNull();
  });

  it('propaga el actor autenticado al crear un expediente', async () => {
    expedienteServiceMock.create.mockResolvedValue({ id: 'exp-1', fullName: 'Cliente Demo' });

    const result = await controller.create(
      {
        fullName: 'Cliente Demo',
        source: 'Manual',
        acquisitionChannel: AcquisitionChannel.OTRO,
        customerSegment: CustomerSegment.RESIDENTIAL,
      },
      {
        sub: 'user-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
    );

    expect(expedienteServiceMock.create).toHaveBeenCalledWith(
      {
        fullName: 'Cliente Demo',
        source: 'Manual',
        acquisitionChannel: AcquisitionChannel.OTRO,
        customerSegment: CustomerSegment.RESIDENTIAL,
      },
      'user-1',
    );
    expect(result.data.id).toBe('exp-1');
  });

  it('rechaza transiciones inválidas con error HTTP consistente', async () => {
    statusTransitionServiceMock.validateTransition.mockResolvedValue({
      valid: false,
      missingFields: ['Plan de interés seleccionado'],
    });

    await expect(
      controller.transitionStatus(
        '00000000-0000-4000-a000-000000000001',
        { targetStatus: ExpedienteStatus.EN_COTIZACION },
        {
          sub: 'user-1',
          email: 'hash',
          role: 'ADMIN',
          tenantId: 'tenant-1',
          schemaName: 'tenant_1',
          jti: 'jti-1',
          type: 'tenant',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usa un mensaje genérico cuando la validación rechaza sin faltantes específicos', async () => {
    statusTransitionServiceMock.validateTransition.mockResolvedValue({ valid: false });

    await expect(
      controller.transitionStatus(
        '00000000-0000-4000-a000-000000000001',
        { targetStatus: ExpedienteStatus.EN_COTIZACION },
        { sub: 'user-synthetic' } as never,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_STATUS_TRANSITION',
        message: 'La transición solicitada no está permitida para el expediente.',
        missingFields: [],
      },
    });
  });

  it('devuelve advertencia nula cuando la transición válida no tiene advertencia', async () => {
    statusTransitionServiceMock.validateTransition.mockResolvedValue({ valid: true });
    expedienteServiceMock.transitionStatus.mockResolvedValue({ id: 'exp-synthetic' });
    completenessCalculatorMock.calculate.mockResolvedValue({
      sectionCompleteness: [],
      installationReadiness: null,
      missingRequirements: [],
    });
    pipelineRecommendationServiceMock.getRecommendation.mockResolvedValue(null);

    const result = await controller.transitionStatus(
      '00000000-0000-4000-a000-000000000001',
      { targetStatus: ExpedienteStatus.PRECALIFICADO },
      { sub: 'user-synthetic' } as never,
    );

    expect(result.transitionWarning).toBeNull();
  });

  it('usa una lista vacía si la advertencia no trae faltantes', async () => {
    statusTransitionServiceMock.validateTransition.mockResolvedValue({
      valid: true,
      warningTitle: 'Pendientes informativos',
      warningMessage: 'Puedes continuar.',
    });
    expedienteServiceMock.transitionStatus.mockResolvedValue({ id: 'exp-synthetic' });
    completenessCalculatorMock.calculate.mockResolvedValue({
      sectionCompleteness: [],
      installationReadiness: null,
      missingRequirements: [],
    });
    pipelineRecommendationServiceMock.getRecommendation.mockResolvedValue(null);

    const result = await controller.transitionStatus(
      '00000000-0000-4000-a000-000000000001',
      { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
      { sub: 'user-synthetic' } as never,
    );

    expect(result.transitionWarning).toEqual({
      title: 'Pendientes informativos',
      message: 'Puedes continuar.',
      missingRequirements: [],
    });
  });

  it.each([
    {
      label: 'cabecera array',
      forwardedFor: ['203.0.113.10'],
      ip: '192.0.2.10',
      expected: '203.0.113.10',
    },
    {
      label: 'array vacío con IP de request',
      forwardedFor: [],
      ip: '192.0.2.11',
      expected: '192.0.2.11',
    },
    { label: 'array vacío sin IP', forwardedFor: [], ip: undefined, expected: null },
    {
      label: 'lista de proxies',
      forwardedFor: '198.51.100.10, 198.51.100.11',
      ip: '192.0.2.12',
      expected: '198.51.100.10',
    },
    { label: 'sin cabecera ni IP', forwardedFor: undefined, ip: undefined, expected: null },
  ])('extrae la IP del consentimiento desde $label', async ({ forwardedFor, ip, expected }) => {
    expedienteServiceMock.createConsent.mockResolvedValue({ id: 'consent-synthetic' });

    await controller.createConsent(
      '00000000-0000-4000-a000-000000000001',
      {} as never,
      { sub: 'user-synthetic' } as never,
      { headers: { 'x-forwarded-for': forwardedFor }, ip } as never,
    );

    expect(expedienteServiceMock.createConsent).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      {},
      'user-synthetic',
      expected,
    );
  });

  it('devuelve advertencia estructurada cuando la transición a instalación avanza con pendientes', async () => {
    statusTransitionServiceMock.validateTransition.mockResolvedValue({
      valid: true,
      warningTitle: 'Puedes continuar a instalación con información pendiente',
      warningMessage: 'Hay faltantes por cerrar.',
      missingRequirements: [
        {
          sectionKey: 'documentSupport',
          sectionLabel: 'Soportes documentales',
          fieldKey: 'utility_bill',
          fieldLabel: 'Recibo de servicio público',
        },
      ],
    });
    expedienteServiceMock.transitionStatus.mockResolvedValue({ id: 'exp-1' });
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 90,
      legal: 70,
      technical: 100,
      operational: 60,
      overall: 82,
      sectionCompleteness: [],
      installationReadiness: {
        status: 'READY_WITH_PENDING',
        canTransition: true,
        title: 'Puedes continuar a instalación con información pendiente',
        message: 'Hay faltantes por cerrar.',
      },
      missingRequirements: [
        {
          sectionKey: 'documentSupport',
          sectionLabel: 'Soportes documentales',
          fieldKey: 'utility_bill',
          fieldLabel: 'Recibo de servicio público',
        },
      ],
    });

    const result = await controller.transitionStatus(
      '00000000-0000-4000-a000-000000000001',
      { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
      {
        sub: 'user-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
    );

    expect(result.transitionWarning).toEqual({
      title: 'Puedes continuar a instalación con información pendiente',
      message: 'Hay faltantes por cerrar.',
      missingRequirements: [
        {
          sectionKey: 'documentSupport',
          sectionLabel: 'Soportes documentales',
          fieldKey: 'utility_bill',
          fieldLabel: 'Recibo de servicio público',
        },
      ],
    });
    expect(result.installationReadiness).toEqual(
      expect.objectContaining({ status: 'READY_WITH_PENDING' }),
    );
  });

  it('rechaza secciones fuera del contrato del expediente', async () => {
    await expect(
      controller.updateSection(
        '00000000-0000-4000-a000-000000000001',
        'unsupported_section',
        { data: { foo: 'bar' } },
        {
          sub: 'user-1',
          email: 'hash',
          role: 'ADMIN',
          tenantId: 'tenant-1',
          schemaName: 'tenant_1',
          jti: 'jti-1',
          type: 'tenant',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('expone timeline enriquecido con actividad y metadata operativa', async () => {
    expedienteServiceMock.getTimelineSummary.mockResolvedValue({
      changes: [{ id: 'change-1', fromStatus: 'PRECALIFICADO', toStatus: 'EN_COTIZACION' }],
      activities: [{ id: 'activity-1', type: 'SECTION_UPDATED' }],
      metadata: {
        createdBy: { userId: 'user-1', name: 'Carlos Mejía' },
        lastEditedBy: { userId: 'user-2', name: 'Ana Torres' },
        lastActivityAt: new Date('2026-03-23T10:00:00Z'),
      },
    });

    const result = (await controller.getTimeline(
      '00000000-0000-4000-a000-000000000001',
      authenticatedReader,
    )) as {
      data: { activities: Array<{ type: string }>; metadata: { createdBy: { name: string } } };
    };

    expect(expedienteServiceMock.getTimelineSummary).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
    );
    expect(result.data.activities).toHaveLength(1);
    expect(result.data.metadata.createdBy.name).toBe('Carlos Mejía');
  });

  it('usa el envelope paginado cuando recibe query de timeline', async () => {
    expedienteServiceMock.getTimelinePage.mockResolvedValue({
      data: { events: [{ kind: 'contact', id: 'contact-1' }], metadata: {} },
      meta: {
        page: 2,
        limit: 5,
        total: 6,
        totalPages: 2,
        truncated: false,
        hasMore: false,
      },
    });

    const result = await controller.getTimeline('exp-1', authenticatedReader, {
      page: 2,
      limit: 5,
      filter: 'contact',
    });

    expect(expedienteServiceMock.getTimelinePage).toHaveBeenCalledWith('exp-1', 2, 5, 'contact');
    expect(result).toEqual(
      expect.objectContaining({ meta: expect.objectContaining({ totalPages: 2 }) }),
    );
  });

  it('usa el filtro all cuando el timeline paginado no especifica filtro', async () => {
    expedienteServiceMock.getTimelinePage.mockResolvedValue({ data: { events: [] }, meta: {} });

    await controller.getTimeline('exp-synthetic', authenticatedReader, { page: 1, limit: 10 });

    expect(expedienteServiceMock.getTimelinePage).toHaveBeenCalledWith(
      'exp-synthetic',
      1,
      10,
      'all',
    );
  });

  it('propaga el actor autenticado al registrar un intento de contacto', async () => {
    expedienteServiceMock.createContactAttempt.mockResolvedValue({ id: 'attempt-1' });

    const result = await controller.createContactAttempt(
      '00000000-0000-4000-a000-000000000001',
      {
        channel: ContactChannel.TELEFONO,
        result: ContactResult.EXITOSO,
        notes: 'Confirmo llamada',
      },
      {
        sub: 'user-9',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
    );

    expect(expedienteServiceMock.createContactAttempt).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      {
        channel: ContactChannel.TELEFONO,
        result: ContactResult.EXITOSO,
        notes: 'Confirmo llamada',
      },
      'user-9',
    );
    expect(result.data.id).toBe('attempt-1');
  });

  it('expone la lista de consentimientos por expediente', async () => {
    expedienteServiceMock.listConsents.mockResolvedValue([
      { id: 'consent-1', consentType: 'TRATAMIENTO_DATOS', ipAddress: '10.0.0.1' },
    ]);

    const result = await controller.listConsents('00000000-0000-4000-a000-000000000001', {
      sub: 'user-2',
      email: 'hash',
      role: 'SUPPORT',
      tenantId: 'tenant-1',
      schemaName: 'tenant_1',
      jti: 'jti-1',
      type: 'tenant',
    });

    expect(expedienteServiceMock.listConsents).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.ipAddress).toBeNull();
  });

  it('preserva ipAddress de consentimientos para roles autorizados', async () => {
    expedienteServiceMock.listConsents.mockResolvedValue([
      { id: 'consent-2', consentType: 'TRATAMIENTO_DATOS', ipAddress: '10.0.0.2' },
    ]);

    const result = await controller.listConsents('00000000-0000-4000-a000-000000000001', {
      sub: 'user-1',
      email: 'hash',
      role: 'ADMIN',
      tenantId: 'tenant-1',
      schemaName: 'tenant_1',
      jti: 'jti-1',
      type: 'tenant',
    });

    expect(result.data[0]!.ipAddress).toBe('10.0.0.2');
  });

  it('expone soportes documentales del expediente', async () => {
    expedienteServiceMock.getDocumentSupports.mockResolvedValue({
      personType: 'PERSONA_NATURAL',
      items: [{ key: 'identity_document', label: 'Documento', hint: 'Hint', versions: [] }],
      summary: { requiredCount: 2, uploadedCount: 0, approvedCount: 0, blockStatus: 'PENDIENTE' },
    });

    const result = await controller.getDocumentSupports(
      '00000000-0000-4000-a000-000000000001',
      authenticatedReader,
    );

    expect(expedienteServiceMock.getDocumentSupports).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      undefined,
    );
    expect(result.data.items).toHaveLength(1);
  });

  it('propaga upload documental al servicio con override de personType y actor autenticado', async () => {
    expedienteServiceMock.uploadDocumentSupport.mockResolvedValue({
      personType: 'PERSONA_JURIDICA',
      items: [],
      summary: { requiredCount: 3, uploadedCount: 1, approvedCount: 0, blockStatus: 'EN_REVISION' },
    });

    const file = {
      originalname: 'cedula.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      buffer: Buffer.from('pdf'),
    };

    await controller.uploadDocumentSupport(
      '00000000-0000-4000-a000-000000000001',
      'identity_document',
      file,
      {
        sub: 'user-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
      'PERSONA_JURIDICA',
    );

    expect(expedienteServiceMock.uploadDocumentSupport).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'identity_document',
      file,
      'user-1',
      'PERSONA_JURIDICA',
    );
  });

  it('propaga cambio de estado documental al servicio con override de personType', async () => {
    expedienteServiceMock.updateDocumentSupportStatus.mockResolvedValue({
      personType: 'PERSONA_JURIDICA',
      items: [],
      summary: { requiredCount: 3, uploadedCount: 1, approvedCount: 1, blockStatus: 'EN_REVISION' },
    });

    await controller.updateDocumentSupportStatus(
      '00000000-0000-4000-a000-000000000001',
      'identity_document',
      'ver-1',
      { status: 'APPROVED', note: null },
      {
        sub: 'user-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
      'PERSONA_JURIDICA',
    );

    expect(expedienteServiceMock.updateDocumentSupportStatus).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'identity_document',
      'ver-1',
      'APPROVED',
      'user-1',
      null,
      'PERSONA_JURIDICA',
    );
  });

  it('propaga eliminacion documental al servicio con actor y personType override', async () => {
    expedienteServiceMock.deleteDocumentSupport.mockResolvedValue({
      personType: 'PERSONA_JURIDICA',
      items: [],
      summary: { requiredCount: 3, uploadedCount: 1, approvedCount: 1, blockStatus: 'EN_REVISION' },
    });

    await controller.deleteDocumentSupport(
      '00000000-0000-4000-a000-000000000001',
      'rut',
      'ver-2',
      {
        sub: 'user-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
      'PERSONA_JURIDICA',
    );

    expect(expedienteServiceMock.deleteDocumentSupport).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'rut',
      'ver-2',
      'user-1',
      'PERSONA_JURIDICA',
    );
  });
});
