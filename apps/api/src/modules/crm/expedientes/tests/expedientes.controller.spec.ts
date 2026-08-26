import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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

describe('ExpedientesController', () => {
  let controller: ExpedientesController;
  let pipelineController: PipelineController;

  const expedienteServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    getTimelineSummary: jest.fn(),
    getTimelinePage: jest.fn(),
    getDocumentSupports: jest.fn(),
    uploadDocumentSupport: jest.fn(),
    updateDocumentSupportStatus: jest.fn(),
    deleteDocumentSupport: jest.fn(),
    updateSection: jest.fn(),
    transitionStatus: jest.fn(),
    reactivate: jest.fn(),
    createContactAttempt: jest.fn(),
    listConsents: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

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

    const result = (await controller.getTimeline('00000000-0000-4000-a000-000000000001')) as {
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

    const result = await controller.getTimeline('exp-1', {
      page: 2,
      limit: 5,
      filter: 'contact',
    });

    expect(expedienteServiceMock.getTimelinePage).toHaveBeenCalledWith('exp-1', 2, 5, 'contact');
    expect(result).toEqual(
      expect.objectContaining({ meta: expect.objectContaining({ totalPages: 2 }) }),
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

    const result = await controller.getDocumentSupports('00000000-0000-4000-a000-000000000001');

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
