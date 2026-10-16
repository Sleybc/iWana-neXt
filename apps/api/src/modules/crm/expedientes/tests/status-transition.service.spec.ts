import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExpedienteStatus } from '@iwana/shared';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { StatusTransitionService } from '../status-transition.service';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

describe('StatusTransitionService', () => {
  let service: StatusTransitionService;

  const completenessCalculatorMock = {
    calculate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({ schemaName: 'tenant_test' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusTransitionService,
        { provide: DataSource, useValue: {} },
        { provide: CompletenessCalculator, useValue: completenessCalculatorMock },
      ],
    }).compile();

    service = module.get<StatusTransitionService>(StatusTransitionService);
  });

  it('permite PRECALIFICADO cuando tiene datos de contacto (absorbe CONTACTADO)', async () => {
    mockExpediente(
      buildExpediente({
        documentType: 'CC',
        documentNumberEncrypted: 'encrypted-doc',
        phonePrimaryEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
        municipality: 'Bogotá',
      }),
    );

    const result = await service.validateTransition('exp-1', ExpedienteStatus.PRECALIFICADO);

    expect(result).toEqual({ valid: true });
  });

  it('rechaza PRECALIFICADO cuando faltan campos obligatorios', async () => {
    mockExpediente(buildExpediente({ documentType: 'CC' }));

    const result = await service.validateTransition('exp-2', ExpedienteStatus.PRECALIFICADO);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(
      expect.arrayContaining(['Número de documento', 'Teléfono o Email', 'Dirección', 'Municipio']),
    );
  });

  it('rechaza EN_COTIZACION cuando no hay plan de interes', async () => {
    mockExpediente(buildExpediente());

    const result = await service.validateTransition('exp-3', ExpedienteStatus.EN_COTIZACION);

    expect(result).toEqual({ valid: false, missingFields: ['Plan de interés seleccionado'] });
  });

  it('permite EN_COTIZACION cuando se eligió un plan', async () => {
    mockExpediente(buildExpediente({ interestedPlanId: 'plan-sintetico' }));

    await expect(
      service.validateTransition('exp-plan', ExpedienteStatus.EN_COTIZACION),
    ).resolves.toEqual({ valid: true });
  });

  it('valida cobertura con coordenadas, dirección o sin ubicación suficiente', async () => {
    mockExpediente(buildExpediente({ latitude: null, longitude: null }));
    await expect(
      service.validateTransition('exp-sin-ubicacion', ExpedienteStatus.VALIDANDO_COBERTURA),
    ).resolves.toEqual({
      valid: false,
      missingFields: ['Coordenadas (lat/lng) o Dirección completa'],
    });

    mockExpediente(
      buildExpediente({ latitude: 4.5, longitude: -74, address: null, municipality: null }),
    );
    await expect(
      service.validateTransition('exp-coordenadas', ExpedienteStatus.VALIDANDO_COBERTURA),
    ).resolves.toEqual({ valid: true });

    mockExpediente(
      buildExpediente({
        latitude: null,
        longitude: null,
        address: 'Dirección de prueba',
        municipality: 'Municipio de prueba',
      }),
    );
    await expect(
      service.validateTransition('exp-direccion', ExpedienteStatus.VALIDANDO_COBERTURA),
    ).resolves.toEqual({ valid: true });
  });

  it('requiere ticket y orden antes de agendar, y permite descartar o volver al estado inicial', async () => {
    mockExpediente(buildExpediente());
    await expect(
      service.validateTransition('exp-sin-vinculos', ExpedienteStatus.INSTALACION_AGENDADA),
    ).resolves.toEqual({
      valid: false,
      missingFields: ['Ticket vinculado', 'Orden de trabajo vinculada'],
    });

    mockExpediente(buildExpediente({ ticketId: 'ticket-sintetico' }));
    await expect(
      service.validateTransition('exp-solo-ticket', ExpedienteStatus.INSTALACION_AGENDADA),
    ).resolves.toEqual({ valid: false, missingFields: ['Orden de trabajo vinculada'] });

    mockExpediente(buildExpediente({ ticketId: 'ticket-sintetico', workOrderId: 'ot-sintetica' }));
    await expect(
      service.validateTransition('exp-listo-agenda', ExpedienteStatus.INSTALACION_AGENDADA),
    ).resolves.toEqual({ valid: true });

    mockExpediente(buildExpediente());
    await expect(
      service.validateTransition('exp-descartado', ExpedienteStatus.DESCARTADO),
    ).resolves.toEqual({ valid: true });
    mockExpediente(buildExpediente({ status: ExpedienteStatus.PRECALIFICADO }));
    await expect(
      service.validateTransition('exp-regreso-nuevo', ExpedienteStatus.NUEVO_POTENCIAL),
    ).resolves.toEqual({ valid: true });
  });

  it('acepta correo como contacto mínimo, rechaza ubicación parcial y permite preparación completa', async () => {
    mockExpediente(
      buildExpediente({
        documentType: 'CC',
        documentNumberEncrypted: 'cipher-documento',
        emailPrimaryEncrypted: 'cipher-correo',
        address: 'Dirección sintética',
        municipality: 'Municipio sintético',
      }),
    );
    await expect(
      service.validateTransition('exp-correo', ExpedienteStatus.PRECALIFICADO),
    ).resolves.toEqual({ valid: true });

    mockExpediente(buildExpediente({ latitude: 4.5, longitude: null, address: 'Dirección' }));
    await expect(
      service.validateTransition('exp-ubicacion-parcial', ExpedienteStatus.VALIDANDO_COBERTURA),
    ).resolves.toEqual({
      valid: false,
      missingFields: ['Coordenadas (lat/lng) o Dirección completa'],
    });

    mockExpediente(buildExpediente());
    completenessCalculatorMock.calculate.mockResolvedValue({
      sectionCompleteness: [],
      missingRequirements: [],
      installationReadiness: {
        status: 'READY_COMPLETE',
        canTransition: true,
        title: 'Completo',
        message: 'Listo para continuar.',
      },
    });
    await expect(
      service.validateTransition('exp-listo-completo', ExpedienteStatus.LISTO_PARA_INSTALACION),
    ).resolves.toEqual({ valid: true });
  });

  it('bloquea CLIENTE_ACTIVO si alguna sección funcional sigue incompleta', async () => {
    mockExpediente(buildExpediente());
    const requirement = {
      sectionKey: 'contact',
      sectionLabel: 'Contacto',
      fieldKey: 'phonePrimary',
      fieldLabel: 'Teléfono principal',
    };
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 70,
      legal: 100,
      technical: 100,
      operational: 100,
      overall: 90,
      sectionCompleteness: [
        {
          key: 'contact',
          label: 'Contacto',
          percentage: 50,
          completedFields: 1,
          totalFields: 2,
          missingFields: [requirement],
        },
      ],
      installationReadiness: {
        status: 'READY_WITH_PENDING',
        canTransition: true,
        title: 'Avance permitido',
        message: 'Hay información pendiente.',
      },
      missingRequirements: [requirement],
    });

    await expect(
      service.validateTransition('exp-incompleto', ExpedienteStatus.CLIENTE_ACTIVO),
    ).resolves.toEqual({
      valid: false,
      missingFields: [
        'Completitud funcional = 100% en las 6 secciones (excluye soportes documentales)',
        'Contacto: Teléfono principal',
      ],
      missingRequirements: [requirement],
    });
  });

  it('permite CLIENTE_ACTIVO con advertencia cuando solo faltan soportes documentales', async () => {
    mockExpediente(buildExpediente({ checklistCompleted: false }));
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 95,
      legal: 80,
      technical: 92,
      operational: 91,
      overall: 86,
      sectionCompleteness: [],
      installationReadiness: {
        status: 'READY_WITH_PENDING',
        canTransition: true,
        title: 'Puedes continuar a instalación con información pendiente',
        message: 'Hay pendientes.',
      },
      missingRequirements: [
        {
          sectionKey: 'documentSupport',
          sectionLabel: 'Soportes documentales',
          fieldKey: 'identity_document',
          fieldLabel: 'Copia de documento de identidad',
        },
      ],
    });

    const result = await service.validateTransition('exp-4', ExpedienteStatus.CLIENTE_ACTIVO);

    expect(result).toEqual({
      valid: true,
      warningTitle: 'Soportes documentales pendientes',
      warningMessage:
        'El expediente puede avanzar a Cliente activo. Los soportes documentales están pendientes y deben gestionarse lo antes posible.',
      missingRequirements: [
        {
          sectionKey: 'documentSupport',
          sectionLabel: 'Soportes documentales',
          fieldKey: 'identity_document',
          fieldLabel: 'Copia de documento de identidad',
        },
      ],
    });
  });

  it('permite CLIENTE_ACTIVO cuando el expediente llega al 100%', async () => {
    mockExpediente(buildExpediente({ checklistCompleted: false }));
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 95,
      legal: 92,
      technical: 91,
      operational: 93,
      overall: 100,
      sectionCompleteness: [],
      installationReadiness: {
        status: 'READY_COMPLETE',
        canTransition: true,
        title: 'Expediente completo para instalación',
        message: 'Todo listo.',
      },
      missingRequirements: [],
    });

    const result = await service.validateTransition('exp-5', ExpedienteStatus.CLIENTE_ACTIVO);

    expect(result).toEqual({ valid: true });
  });

  it('bloquea LISTO_PARA_INSTALACION cuando la completitud general es menor a 75%', async () => {
    mockExpediente(buildExpediente());
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 40,
      legal: 20,
      technical: 60,
      operational: 10,
      overall: 71,
      sectionCompleteness: [],
      installationReadiness: {
        status: 'NOT_READY',
        canTransition: false,
        title: 'Información insuficiente para continuar a instalación',
        message: 'Completa más información.',
      },
      missingRequirements: [
        {
          sectionKey: 'customerInterest',
          sectionLabel: 'Interés del cliente',
          fieldKey: 'interestedPlanId',
          fieldLabel: 'Plan de interés',
        },
      ],
    });

    const result = await service.validateTransition(
      'exp-listo-bloqueado',
      ExpedienteStatus.LISTO_PARA_INSTALACION,
    );

    expect(result).toEqual({
      valid: false,
      errorMessage: 'Completa más información.',
      missingFields: ['Interés del cliente: Plan de interés'],
      missingRequirements: [
        {
          sectionKey: 'customerInterest',
          sectionLabel: 'Interés del cliente',
          fieldKey: 'interestedPlanId',
          fieldLabel: 'Plan de interés',
        },
      ],
    });
  });

  it('permite LISTO_PARA_INSTALACION con advertencia cuando supera el 75% y quedan faltantes', async () => {
    mockExpediente(buildExpediente());
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 90,
      legal: 75,
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

    const result = await service.validateTransition(
      'exp-listo-warning',
      ExpedienteStatus.LISTO_PARA_INSTALACION,
    );

    expect(result).toEqual({
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
  });

  it('permite transicion no-op cuando el target coincide con el estado actual', async () => {
    mockExpediente(
      buildExpediente({
        status: ExpedienteStatus.LISTO_PARA_INSTALACION,
        installationAddress: null,
        siteContactName: null,
      }),
    );

    const result = await service.validateTransition(
      'exp-noop',
      ExpedienteStatus.LISTO_PARA_INSTALACION,
    );

    expect(result).toEqual({ valid: true });
  });

  it('lanza NotFoundException cuando el expediente no existe', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
        },
      }),
    );

    await expect(
      service.validateTransition('exp-missing', ExpedienteStatus.PRECALIFICADO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  function mockExpediente(expediente: ExpedienteRecord): void {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => expediente,
        },
      }),
    );
  }
});

function buildExpediente(overrides: Partial<ExpedienteRecord> = {}): ExpedienteRecord {
  return {
    id: 'exp-base',
    tenantId: 'ten-1',
    status: ExpedienteStatus.NUEVO_POTENCIAL,
    previousStatus: null,
    statusChangedAt: new Date('2026-03-23T00:00:00Z'),
    discardReason: null,
    fullName: 'Cliente Demo',
    documentType: null,
    documentNumberEncrypted: null,
    documentNumberHash: null,
    gender: null,
    birthDate: null,
    personType: null,
    companyName: null,
    phonePrimaryEncrypted: null,
    phoneSecondaryEncrypted: null,
    emailPrimaryEncrypted: null,
    emailSecondary: null,
    altContactName: null,
    altContactPhoneEncrypted: null,
    contactPreference: null,
    bestContactTime: null,
    address: null,
    municipality: null,
    department: null,
    postalCode: null,
    stratum: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfidence: null,
    accessReferences: null,
    zoneType: null,
    source: 'Web',
    interestedPlanId: null,
    campaign: null,
    casePriority: null,
    estimatedBudget: null,
    commercialNotes: null,
    coverageResult: null,
    availableTechnology: null,
    estimatedDistanceM: null,
    feasibility: null,
    technicalObservations: null,
    estimatedEquipment: null,
    identityVerified: null,
    legalComplianceStatus: null,
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    rutReference: null,
    installationAddress: null,
    availabilityWindow: null,
    siteContactName: null,
    siteContactPhoneEncrypted: null,
    specialAccessNotes: null,
    requiredMaterials: null,
    ticketId: null,
    workOrderId: null,
    inventoryAssignmentRef: null,
    expansionRequestId: null,
    executionPolicyRef: null,
    checklistCompleted: false,
    evidenceMode: null,
    conformityEvidenceRef: null,
    lastRescheduleReason: null,
    lastRescheduleNotes: null,
    completenessCommercial: 0,
    completenessLegal: 0,
    completenessTechnical: 0,
    completenessOperational: 0,
    createdBy: 'user-base',
    createdAt: new Date('2026-03-23T00:00:00Z'),
    updatedAt: new Date('2026-03-23T00:00:00Z'),
    deletedAt: null,
    contactAttempts: [],
    consents: [],
    coverageChecks: [],
    statusChanges: [],
    ...overrides,
  } as ExpedienteRecord;
}
