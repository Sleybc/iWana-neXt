import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AcquisitionChannel } from '@iwana/shared';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteSectionCompletenessService } from '../expediente-section-completeness.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { CrmQuoteReadPort } from '../../ports/crm-quote-read.port';

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
  const crmQuoteReadPortMock = {
    findByExpedienteId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    crmQuoteReadPortMock.findByExpedienteId.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompletenessCalculator,
        ExpedienteSectionCompletenessService,
        { provide: CrmQuoteReadPort, useValue: crmQuoteReadPortMock },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<CompletenessCalculator>(CompletenessCalculator);
  });

  it('calcula completitud con arrays vacios cuando sub-tablas CRM aun no existen en el schema', async () => {
    // Cuando la tabla de quotes/consents/coverage no existe (migración pendiente),
    // el servicio continúa el cálculo con arrays vacíos en lugar de usar los valores almacenados.
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

    // Con sub-tablas vacías el cálculo refleja solo los campos del expediente en memoria.
    // El expediente de prueba solo tiene fullName, lo que aporta ~20% en comercial.
    await expect(service.calculate('exp-1')).resolves.toEqual(
      expect.objectContaining({
        commercial: 20,
        legal: 0,
        technical: 0,
        operational: 0,
        overall: 7,
        installationReadiness: expect.objectContaining({
          status: 'NOT_READY',
          canTransition: false,
        }),
      }),
    );
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

    await expect(service.calculate('exp-1')).resolves.toEqual(
      expect.objectContaining({
        commercial: 20,
        legal: 0,
        technical: 100,
        operational: 0,
        overall: 18,
        sectionCompleteness: expect.arrayContaining([
          expect.objectContaining({
            key: 'technicalFeasibility',
            percentage: 75,
          }),
        ]),
      }),
    );
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
    acquisitionChannel: AcquisitionChannel.WEB,
    sourceDetail: null,
    interestedPlanId: null,
    additionalProductIds: null,
    additionalServiceIds: [],
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
    currentResponsibleUserId: null,
    currentResponsibleAssignedAt: null,
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
