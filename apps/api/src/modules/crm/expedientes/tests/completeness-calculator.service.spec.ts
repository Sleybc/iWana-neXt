import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AcquisitionChannel } from '@iwana/shared';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteSectionCompletenessService } from '../expediente-section-completeness.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { ConsentRecord } from '../entities/consent-record-v2.entity';
import { CoverageCheck } from '../entities/coverage-check.entity';
import { CrmQuoteReadPort } from '../../ports/crm-quote-read.port';
import type { ExpedienteSensitiveFieldPresence } from '../expediente-section-completeness.types';

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
  let sectionCompletenessService: ExpedienteSectionCompletenessService;
  const crmQuoteReadPortMock = {
    findByExpedienteId: jest.fn(),
    findByExpedienteIds: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
          find: async () => [],
        },
      }),
    );

    crmQuoteReadPortMock.findByExpedienteId.mockResolvedValue([]);
    crmQuoteReadPortMock.findByExpedienteIds.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompletenessCalculator,
        ExpedienteSectionCompletenessService,
        { provide: CrmQuoteReadPort, useValue: crmQuoteReadPortMock },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<CompletenessCalculator>(CompletenessCalculator);
    sectionCompletenessService = module.get<ExpedienteSectionCompletenessService>(
      ExpedienteSectionCompletenessService,
    );
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
        overall: 11,
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

  it('conserva consents y coverage cuando solo quotes no es compatible todavía', async () => {
    const consents = [{ id: 'consent-1', expedienteId: 'exp-1' } as ConsentRecord];
    const coverageChecks = [{ id: 'coverage-1', expedienteId: 'exp-1' } as CoverageCheck];
    const quoteCompatibilityError = new Error('relation "quotes" does not exist') as Error & {
      driverError?: { code?: string };
    };
    quoteCompatibilityError.driverError = { code: '42P01' };

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({
        manager: {
          find: jest
            .fn()
            .mockImplementation(async (entity: typeof ConsentRecord | typeof CoverageCheck) =>
              entity === ConsentRecord ? consents : coverageChecks,
            ),
        },
      }),
    );
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({ manager: { find: async () => coverageChecks } }),
    );
    crmQuoteReadPortMock.findByExpedienteId.mockRejectedValueOnce(quoteCompatibilityError);

    await expect(service.loadRelatedContext('exp-1', 'tenant_test')).resolves.toEqual({
      consents,
      coverageChecks,
      quotes: [],
    });
  });

  it('conserva coverage y quotes cuando solo consents no es compatible todavía', async () => {
    const coverageChecks = [{ id: 'coverage-1', expedienteId: 'exp-1' } as CoverageCheck];
    const quote = { id: 'quote-1', expedienteId: 'exp-1' };
    const consentCompatibilityError = Object.assign(
      new Error('relation "consent_records" does not exist'),
      { driverError: { code: '42P01' } },
    );

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({
        manager: {
          find: jest
            .fn()
            .mockImplementation(async (entity: typeof ConsentRecord | typeof CoverageCheck) => {
              if (entity === ConsentRecord) {
                throw consentCompatibilityError;
              }
              return coverageChecks;
            }),
        },
      }),
    );
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({ manager: { find: async () => coverageChecks } }),
    );
    crmQuoteReadPortMock.findByExpedienteId.mockResolvedValueOnce([quote]);

    await expect(service.loadRelatedContext('exp-1', 'tenant_test')).resolves.toEqual({
      consents: [],
      coverageChecks,
      quotes: [quote],
    });
  });

  it('conserva consents y quotes cuando solo coverageChecks no es compatible todavía', async () => {
    const consents = [{ id: 'consent-1', expedienteId: 'exp-1' } as ConsentRecord];
    const quote = { id: 'quote-1', expedienteId: 'exp-1' };
    const coverageCompatibilityError = Object.assign(
      new Error('relation "coverage_checks" does not exist'),
      { driverError: { code: '42P01' } },
    );

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({ manager: { find: async () => consents } }),
    );
    mockRunInTenantSchema.mockImplementationOnce(async () => {
      throw coverageCompatibilityError;
    });
    crmQuoteReadPortMock.findByExpedienteId.mockResolvedValueOnce([quote]);

    await expect(service.loadRelatedContext('exp-1', 'tenant_test')).resolves.toEqual({
      consents,
      coverageChecks: [],
      quotes: [quote],
    });
  });

  it('mantiene el fallback independiente de tablas ausentes en calculateBatch', async () => {
    const expediente = buildExpediente({ id: 'exp-1' });
    const coverageChecks = [
      { id: 'coverage-1', expedienteId: 'exp-1', result: 'VIABLE' } as CoverageCheck,
    ];
    const consentCompatibilityError = Object.assign(
      new Error('relation "consent_records" does not exist'),
      { driverError: { code: '42P01' } },
    );
    const quoteCompatibilityError = Object.assign(
      new Error('column "legacy_quote" does not exist'),
      { driverError: { code: '42703' } },
    );
    const manager = {
      find: jest
        .fn()
        .mockImplementation(
          async (entity: typeof ExpedienteRecord | typeof ConsentRecord | typeof CoverageCheck) => {
            if (entity === ExpedienteRecord) return [expediente];
            if (entity === ConsentRecord) throw consentCompatibilityError;
            return coverageChecks;
          },
        ),
    };
    crmQuoteReadPortMock.findByExpedienteIds.mockRejectedValueOnce(quoteCompatibilityError);

    const result = await service.calculateBatch(manager as never, 'tenant_test', ['exp-1']);

    expect(result.get('exp-1')).toEqual(expect.objectContaining({ technical: 50 }));
    expect(manager.find).toHaveBeenCalledWith(
      ConsentRecord,
      expect.objectContaining({ select: ['id', 'expedienteId', 'consentType', 'status'] }),
    );
    expect(manager.find).toHaveBeenCalledWith(
      CoverageCheck,
      expect.objectContaining({ select: ['id', 'expedienteId', 'result'] }),
    );
  });

  it('usa completitud tecnica estructurada cuando supera el calculo tradicional', async () => {
    const expediente = buildExpediente({
      feasibility: 'VALIDATION_REQUIRED',
      candidateTechnologies: ['RADIO'],
      technicalConfidence: 'MEDIUM',
      evaluationSource: 'TECHNICAL_SITE_VISIT',
      latitude: 4.58,
      longitude: -74.44,
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
        overall: 25,
        sectionCompleteness: expect.arrayContaining([
          expect.objectContaining({
            key: 'technicalFeasibility',
            percentage: 100,
          }),
        ]),
      }),
    );
  });

  it('no marca Viabilidad técnica al 100% si faltan coordenadas', async () => {
    const expediente = buildExpediente({
      feasibility: 'VALIDATION_REQUIRED',
      candidateTechnologies: ['RADIO'],
      technicalConfidence: 'MEDIUM',
      evaluationSource: 'TECHNICAL_SITE_VISIT',
      latitude: null,
      longitude: null,
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
        sectionCompleteness: expect.arrayContaining([
          expect.objectContaining({
            key: 'technicalFeasibility',
            percentage: 80,
          }),
        ]),
      }),
    );
  });

  it('marca Dirección al 100% cuando el formulario de ubicación está completo sin coordenadas', async () => {
    const expediente = buildExpediente({
      address: 'Calle 1 # 2-3',
      municipality: 'EL_COLEGIO',
      department: 'CUNDINAMARCA',
      postalCode: '252601',
      stratum: 2,
      neighborhood: 'Centro',
      latitude: null,
      longitude: null,
      feasibility: null,
      candidateTechnologies: null,
      technicalConfidence: null,
      evaluationSource: null,
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
        sectionCompleteness: expect.arrayContaining([
          expect.objectContaining({
            key: 'address',
            percentage: 100,
          }),
          expect.objectContaining({
            key: 'technicalFeasibility',
            percentage: 0,
          }),
        ]),
      }),
    );
  });

  it('calcula dirección y coordenadas usando flags sin cargar valores de ubicación', () => {
    const expediente = buildExpediente({
      address: null,
      municipality: null,
      department: null,
      postalCode: null,
      stratum: null,
      neighborhood: null,
      latitude: null,
      longitude: null,
    });
    const sensitiveFieldPresence: ExpedienteSensitiveFieldPresence = {
      documentNumber: false,
      phonePrimary: false,
      emailPrimary: false,
      altContactPhone: false,
      hasAddress: true,
      hasMunicipality: true,
      hasDepartment: true,
      hasPostalCode: true,
      hasStratum: true,
      hasNeighborhood: true,
      hasLatitude: true,
      hasLongitude: true,
      hasLocation: true,
    };

    const result = sectionCompletenessService.calculateSummary({
      expediente,
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence,
    });

    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'address', percentage: 100 }),
        expect.objectContaining({ key: 'technicalFeasibility', percentage: 20 }),
      ]),
    );
  });

  it('no infla completitud con strings de ubicación vacíos aunque la entidad los contenga', () => {
    const expediente = buildExpediente({
      address: '   ',
      municipality: '',
      department: ' ',
      postalCode: '',
      stratum: null,
      neighborhood: '   ',
      latitude: null,
      longitude: null,
    });
    const sensitiveFieldPresence: ExpedienteSensitiveFieldPresence = {
      documentNumber: false,
      phonePrimary: false,
      emailPrimary: false,
      altContactPhone: false,
      hasAddress: false,
      hasMunicipality: false,
      hasDepartment: false,
      hasPostalCode: false,
      hasStratum: false,
      hasNeighborhood: false,
      hasLatitude: false,
      hasLongitude: false,
      hasLocation: false,
    };

    const result = sectionCompletenessService.calculateSummary({
      expediente,
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence,
    });

    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'address', percentage: 0 }),
        expect.objectContaining({ key: 'technicalFeasibility', percentage: 0 }),
      ]),
    );
  });

  it('no marca como faltante un soporte APPROVED recibido con clave canónica', () => {
    const expediente = buildExpediente({ personType: null, documentSupports: null });
    const sensitiveFieldPresence: ExpedienteSensitiveFieldPresence = {
      documentNumber: false,
      phonePrimary: false,
      emailPrimary: false,
      altContactPhone: false,
      documentSupportApproved: {
        identity_document: true,
        utility_bill: true,
      },
    };

    const result = sectionCompletenessService.calculateSummary({
      expediente,
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence,
    });

    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'documentSupport', percentage: 100, missingFields: [] }),
      ]),
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
    documentNumberHash: null,
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
    customerSegment: null,
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
