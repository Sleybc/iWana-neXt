import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AcquisitionChannel, ContactChannel, ContactResult, ExpedienteStatus } from '@iwana/shared';
import { ExpedientesController, PipelineController } from '../expedientes.controller';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteService } from '../expediente.service';
import { StatusTransitionService } from '../status-transition.service';

describe('ExpedientesController', () => {
  let controller: ExpedientesController;
  let pipelineController: PipelineController;

  const expedienteServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    getTimelineSummary: jest.fn(),
    getDocumentSupports: jest.fn(),
    uploadDocumentSupport: jest.fn(),
    updateDocumentSupportStatus: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpedientesController],
      providers: [
        { provide: ExpedienteService, useValue: expedienteServiceMock },
        { provide: StatusTransitionService, useValue: statusTransitionServiceMock },
        { provide: CompletenessCalculator, useValue: completenessCalculatorMock },
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

  it('propaga el actor autenticado al crear un expediente', async () => {
    expedienteServiceMock.create.mockResolvedValue({ id: 'exp-1', fullName: 'Cliente Demo' });

    const result = await controller.create(
      {
        fullName: 'Cliente Demo',
        source: 'Manual',
        acquisitionChannel: AcquisitionChannel.OTRO,
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
      changes: [{ id: 'change-1', fromStatus: 'CONTACTADO', toStatus: 'EN_COTIZACION' }],
      activities: [{ id: 'activity-1', type: 'SECTION_UPDATED' }],
      metadata: {
        createdBy: { userId: 'user-1', name: 'Carlos Mejía' },
        lastEditedBy: { userId: 'user-2', name: 'Ana Torres' },
        lastActivityAt: new Date('2026-03-23T10:00:00Z'),
      },
    });

    const result = await controller.getTimeline('00000000-0000-4000-a000-000000000001');

    expect(expedienteServiceMock.getTimelineSummary).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
    );
    expect(result.data.activities).toHaveLength(1);
    expect(result.data.metadata.createdBy.name).toBe('Carlos Mejía');
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
    );
    expect(result.data.items).toHaveLength(1);
  });

  it('propaga upload documental al servicio con el actor autenticado', async () => {
    expedienteServiceMock.uploadDocumentSupport.mockResolvedValue({
      personType: 'PERSONA_NATURAL',
      items: [],
      summary: { requiredCount: 2, uploadedCount: 1, approvedCount: 0, blockStatus: 'EN_REVISION' },
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
    );

    expect(expedienteServiceMock.uploadDocumentSupport).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'identity_document',
      file,
      'user-1',
    );
  });

  it('propaga cambio de estado documental al servicio', async () => {
    expedienteServiceMock.updateDocumentSupportStatus.mockResolvedValue({
      personType: 'PERSONA_NATURAL',
      items: [],
      summary: { requiredCount: 2, uploadedCount: 1, approvedCount: 1, blockStatus: 'EN_REVISION' },
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
    );

    expect(expedienteServiceMock.updateDocumentSupportStatus).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'identity_document',
      'ver-1',
      'APPROVED',
      'user-1',
      null,
    );
  });
});
