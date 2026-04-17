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

  it('rechaza CLIENTE_ACTIVO si la completitud no cumple', async () => {
    mockExpediente(buildExpediente({ checklistCompleted: false }));
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 95,
      legal: 80,
      technical: 92,
      operational: 91,
      overall: 90,
    });

    const result = await service.validateTransition('exp-4', ExpedienteStatus.CLIENTE_ACTIVO);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(
      expect.arrayContaining(['Completitud >= 90% en las 4 dimensiones', 'Checklist completo']),
    );
  });

  it('permite CLIENTE_ACTIVO cuando las cuatro dimensiones cumplen (aunque checklist esté en false)', async () => {
    mockExpediente(buildExpediente({ checklistCompleted: false }));
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 95,
      legal: 92,
      technical: 91,
      operational: 93,
      overall: 93,
    });

    const result = await service.validateTransition('exp-5', ExpedienteStatus.CLIENTE_ACTIVO);

    expect(result).toEqual({ valid: true });
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
