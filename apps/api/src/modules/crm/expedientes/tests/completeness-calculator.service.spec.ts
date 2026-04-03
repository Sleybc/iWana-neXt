import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AcquisitionChannel } from '@iwana/shared';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';

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

describe('CompletenessCalculator', () => {
  let service: CompletenessCalculator;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [CompletenessCalculator, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<CompletenessCalculator>(CompletenessCalculator);
  });

  it('retorna completitud almacenada si una tabla hija del esquema tenant aun no existe', async () => {
    const expediente = buildExpediente({
      completenessCommercial: 75,
      completenessLegal: 50,
      completenessTechnical: 25,
      completenessOperational: 0,
    });

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      )
      .mockImplementationOnce(async () => {
        const error = new Error('relation "quotes" does not exist') as Error & {
          driverError?: { code?: string };
        };
        error.driverError = { code: '42P01' };
        throw error;
      });

    await expect(service.calculate('exp-1')).resolves.toEqual({
      commercial: 75,
      legal: 50,
      technical: 25,
      operational: 0,
      overall: 38,
    });
  });

  it('re-lanza errores no atribuibles a compatibilidad de esquema', async () => {
    const expediente = buildExpediente({});
    const failure = new Error('database unavailable');

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      )
      .mockImplementationOnce(async () => {
        throw failure;
      });

    await expect(service.calculate('exp-1')).rejects.toThrow(failure);
  });

  it('usa completitud tecnica estructurada cuando supera el calculo tradicional', async () => {
    const expediente = buildExpediente({
      feasibility: 'VALIDATION_REQUIRED',
      candidateTechnologies: ['RADIO'],
      technicalConfidence: 'MEDIUM',
      evaluationSource: 'TECHNICAL_SITE_VISIT',
      availableTechnology: null,
      estimatedEquipment: null,
    });

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            find: async () => [],
          },
        }),
      );

    await expect(service.calculate('exp-1')).resolves.toEqual({
      commercial: 20,
      legal: 0,
      technical: 100,
      operational: 0,
      overall: 30,
    });
  });
});

function buildExpediente(overrides: Partial<ExpedienteRecord>): ExpedienteRecord {
  return {
    id: 'exp-1',
    tenantId: 'ten-1',
    status: 'NUEVO_POTENCIAL' as ExpedienteRecord['status'],
    previousStatus: null,
    statusChangedAt: new Date('2026-03-23T00:00:00Z'),
    discardReason: null,
    fullName: 'Cliente Demo',
    documentType: null,
    documentNumberEncrypted: null,
    gender: null,
    birthDate: null,
    personType: null,
    firstName: null,
    lastName: null,
    companyName: null,
    primaryContactName: null,
    primaryContactRole: null,
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
    stratum: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfidence: null,
    accessReferences: null,
    zoneType: null,
    source: 'Web',
    acquisitionChannel: AcquisitionChannel.WEB,
    sourceDetail: null,
    interestedPlanId: null,
    additionalProductIds: null,
    campaign: null,
    casePriority: null,
    estimatedBudget: null,
    commercialNotes: null,
    coverageResult: null,
    availableTechnology: null,
    estimatedDistanceM: null,
    feasibility: null,
    candidateTechnologies: null,
    technicalConfidence: null,
    evaluationSource: null,
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
    createdBy: 'user-1',
    createdAt: new Date('2026-03-23T00:00:00Z'),
    updatedAt: new Date('2026-03-23T00:00:00Z'),
    deletedAt: null,
    contactAttempts: [],
    consents: [],
    coverageChecks: [],
    statusChanges: [],
    salesAttributions: [],
    ...overrides,
  };
}
