import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AcquisitionChannel, AuditAction, ExpedienteStatus } from '@iwana/shared';
import { ExpedienteDetailBootstrapService } from '../expediente-detail-bootstrap.service';
import {
  CompletenessCalculator,
  type CompletenessResult,
} from '../completeness-calculator.service';
import { PipelineRecommendationService } from '../pipeline-recommendation.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { CrmActorReadPort } from '../../ports/crm-actor-read.port';
import { CrmAttributionReadPort } from '../../ports/crm-attribution-read.port';
import { CrmResponsibilityReadPort } from '../../ports/crm-responsibility-read.port';
import { CrmSubscriberReadPort } from '../../ports/crm-subscriber-read.port';
import { AuditService } from '../../../audit/audit.service';

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

describe('ExpedienteDetailBootstrapService', () => {
  let service: ExpedienteDetailBootstrapService;

  const completeness = buildCompleteness();
  const pipelineRecommendation = {
    currentStatus: ExpedienteStatus.NUEVO_POTENCIAL,
    suggestedStatus: ExpedienteStatus.PRECALIFICADO,
    recommendationReason: 'Hay información suficiente para precalificar.',
    blockingRequirements: [],
    informationalRequirements: [],
  };

  const completenessCalculatorMock = {
    loadRelatedContext: jest.fn(),
    calculateFromContext: jest.fn(),
  };
  const pipelineRecommendationServiceMock = {
    getRecommendationFromContext: jest.fn(),
  };
  const attributionsServiceMock = {
    getCurrentAttribution: jest.fn(),
  };
  const responsibilitiesServiceMock = {
    getResponsibility: jest.fn(),
  };
  const subscribersServiceMock = {
    findSummaryByExpedienteId: jest.fn(),
  };
  const crmActorReadPortMock = {
    findByIds: jest.fn(),
  };
  const auditServiceMock = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
    });
    completenessCalculatorMock.loadRelatedContext.mockResolvedValue({
      consents: [],
      quotes: [],
      coverageChecks: [],
    });
    completenessCalculatorMock.calculateFromContext.mockResolvedValue(completeness);
    pipelineRecommendationServiceMock.getRecommendationFromContext.mockResolvedValue(
      pipelineRecommendation,
    );
    attributionsServiceMock.getCurrentAttribution.mockResolvedValue(null);
    responsibilitiesServiceMock.getResponsibility.mockResolvedValue(null);
    subscribersServiceMock.findSummaryByExpedienteId.mockResolvedValue(null);
    crmActorReadPortMock.findByIds.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpedienteDetailBootstrapService,
        { provide: DataSource, useValue: {} },
        { provide: CompletenessCalculator, useValue: completenessCalculatorMock },
        {
          provide: PipelineRecommendationService,
          useValue: pipelineRecommendationServiceMock,
        },
        { provide: CrmAttributionReadPort, useValue: attributionsServiceMock },
        { provide: CrmResponsibilityReadPort, useValue: responsibilitiesServiceMock },
        { provide: CrmSubscriberReadPort, useValue: subscribersServiceMock },
        { provide: CrmActorReadPort, useValue: crmActorReadPortMock },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = module.get<ExpedienteDetailBootstrapService>(ExpedienteDetailBootstrapService);
  });

  it('boundary: construye el bootstrap en el tenant/schema del contexto activo', async () => {
    const expediente = buildExpediente();
    Object.assign(expediente, {
      additionalProductIds: ['product-1'],
      additionalServiceIds: ['service-1'],
      latitude: '4.580000' as unknown as number,
      longitude: '-74.440000' as unknown as number,
      stratum: '2' as unknown as number,
    });
    const functionalAudit = {
      userId: 'user-test',
      createdAt: new Date('2026-08-24T10:00:00.000Z'),
      newValue: { section: 'contact' },
    };
    const piiAccessAudit = {
      userId: 'pii-user-test',
      createdAt: new Date('2026-08-24T11:00:00.000Z'),
      newValue: { piiaAccess: 'documentNumber' },
    };
    const projectionQuery = buildProjectionQuery(expediente);
    const metadataFind = jest.fn().mockResolvedValue([piiAccessAudit, functionalAudit]);
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(projectionQuery),
      find: metadataFind,
    };
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    crmActorReadPortMock.findByIds.mockResolvedValue([{ id: 'user-test', name: 'Usuario prueba' }]);

    const result = await service.getDetailBootstrap('exp-1', 'actor-1');

    expect(mockTenantContextGetOrThrow).toHaveBeenCalledTimes(1);
    expect(mockRunInTenantSchema).toHaveBeenCalledTimes(2);
    expect(mockRunInTenantSchema.mock.calls.every((call) => call[1] === 'tenant_test')).toBe(true);
    const selectedProjectionFields = projectionQuery.select.mock.calls[0][0] as string[];
    for (const projectionField of Object.keys(result.expediente)) {
      if (projectionField !== 'hasLocation') {
        expect(selectedProjectionFields).toContain(`expediente.${projectionField}`);
      }
    }
    expect(projectionQuery.select).toHaveBeenCalledWith(
      expect.arrayContaining(['expediente.id', 'expediente.createdAt', 'expediente.updatedAt']),
    );
    expect(projectionQuery.select.mock.calls[0][0]).not.toEqual(
      expect.arrayContaining([
        'expediente.documentNumberEncrypted',
        'expediente.phonePrimaryEncrypted',
        'expediente.emailPrimaryEncrypted',
        'expediente.birthDate',
        'expediente.emailSecondary',
        'expediente.firstName',
        'expediente.lastName',
        'expediente.fiscalAddress',
        'expediente.fiscalName',
        'expediente.rutReference',
        'expediente.commercialNotes',
        'expediente.technicalObservations',
        'expediente.address',
        'expediente.municipality',
        'expediente.department',
        'expediente.postalCode',
        'expediente.stratum',
        'expediente.neighborhood',
        'expediente.latitude',
        'expediente.longitude',
      ]),
    );
    const presenceSql = projectionQuery.addSelect.mock.calls.map((call) => String(call[0]));
    for (const textColumn of [
      'document_number_encrypted',
      'phone_primary_encrypted',
      'email_primary_encrypted',
      'alt_contact_phone_encrypted',
      'company_name',
      'alt_contact_name',
      'payment_method',
      'billing_cycle',
      'fiscal_name',
      'address',
      'municipality',
      'department',
      'postal_code',
      'neighborhood',
    ]) {
      expect(presenceSql).toEqual(
        expect.arrayContaining([expect.stringContaining(`NULLIF(BTRIM(expediente.${textColumn})`)]),
      );
    }
    for (const numericColumn of ['stratum', 'latitude', 'longitude']) {
      expect(presenceSql).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`expediente.${numericColumn} IS NOT NULL`),
        ]),
      );
    }
    expect(metadataFind).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: { entityType: 'ExpedienteRecord', entityId: 'exp-1' },
        take: 25,
      }),
    );
    expect(completenessCalculatorMock.calculateFromContext).toHaveBeenCalledTimes(1);
    expect(pipelineRecommendationServiceMock.getRecommendationFromContext).toHaveBeenCalledTimes(1);
    expect(completenessCalculatorMock.calculateFromContext).toHaveBeenCalledWith(
      expect.objectContaining({
        expediente,
        sensitiveFieldPresence: expect.objectContaining({
          documentSupportApproved: {
            identity_document: true,
            utility_bill: true,
            chamber_of_commerce: false,
            rut: false,
            legal_representative_id: false,
          },
        }),
      }),
    );
    expect(pipelineRecommendationServiceMock.getRecommendationFromContext).toHaveBeenCalledWith(
      expediente,
      completeness,
      expect.objectContaining({
        documentNumber: true,
        phonePrimary: true,
        emailPrimary: false,
        hasAddress: false,
        hasMunicipality: false,
        hasDepartment: false,
        hasPostalCode: false,
        hasStratum: false,
        hasNeighborhood: false,
        hasLatitude: true,
        hasLongitude: true,
        hasLocation: true,
      }),
    );
    expect(result.expediente).not.toHaveProperty('contactAttempts');
    expect(result.expediente).not.toHaveProperty('consents');
    expect(result.expediente).not.toHaveProperty('coverageChecks');
    expect(result.expediente).not.toHaveProperty('statusChanges');
    expect(result.expediente).not.toHaveProperty('salesAttributions');
    for (const reservedField of [
      'birthDate',
      'emailSecondary',
      'fiscalName',
      'fiscalAddress',
      'rutReference',
      'firstName',
      'lastName',
      'primaryContactName',
      'altContactName',
      'commercialNotes',
      'technicalObservations',
      'specialAccessNotes',
      'documentSupports',
      'address',
      'municipality',
      'department',
      'postalCode',
      'neighborhood',
      'latitude',
      'longitude',
    ]) {
      expect(result.expediente).not.toHaveProperty(reservedField);
    }
    expect(Object.keys(result.expediente).every((key) => !key.includes('Encrypted'))).toBe(true);
    expect(
      Object.keys(result.expediente).every((key) => !key.toLowerCase().includes('ciphertext')),
    ).toBe(true);
    const serializedProjection = JSON.stringify(result.expediente);
    expect(serializedProjection).not.toContain('Encrypted');
    expect(serializedProjection).not.toContain('ciphertext-test');
    for (const internalAuditField of ['tenantId', 'createdBy', 'deletedAt']) {
      expect(result.expediente).not.toHaveProperty(internalAuditField);
    }
    expect(Object.keys(result).sort()).toEqual(
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
    expect(result.subscriberSummary).toBeNull();
    expect(result.operationalMetadata.lastActivityAt).toEqual(functionalAudit.createdAt);
    expect(result.operationalMetadata.lastEditedBy.userId).toBe('user-test');
    expect(crmActorReadPortMock.findByIds.mock.calls[0][1]).not.toContain('pii-user-test');
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LIST_ACCESS,
        tenantId: 'tenant-test',
        schemaName: 'tenant_test',
        userId: 'actor-1',
        entityType: 'ExpedienteBootstrap',
        entityId: 'exp-1',
        newValue: { surface: 'detail-bootstrap', result: 'success' },
      }),
    );
    expect(result.expediente.createdAt).toEqual(expediente.createdAt);
    expect(result.expediente.updatedAt).toEqual(expediente.updatedAt);
    expect(result.expediente.hasLocation).toBe(true);
    expect(result.expediente.dataConsentRevoked).toBe(false);
    expect(result.expediente.additionalProductIds).toEqual(['product-1']);
    expect(result.expediente.additionalServiceIds).toEqual(['service-1']);
    expect(typeof result.completeness.overall).toBe('number');
  });

  it('rechaza un expediente inexistente sin calcular ni enriquecer', async () => {
    const projectionQuery = buildProjectionQuery(null);
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(projectionQuery),
        },
      } as never),
    );

    await expect(
      service.getDetailBootstrap('missing-expediente', 'actor-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(completenessCalculatorMock.calculateFromContext).not.toHaveBeenCalled();
    expect(pipelineRecommendationServiceMock.getRecommendationFromContext).not.toHaveBeenCalled();
  });

  it('mantiene el subscriber summary como enriquecimiento opcional', async () => {
    const expediente = buildExpediente();
    const projectionQuery = buildProjectionQuery(expediente);
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(projectionQuery),
      find: jest.fn().mockResolvedValue([]),
    };
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    const compatibilityError = Object.assign(new Error('subscriber table unavailable'), {
      driverError: { code: '42P01' },
    });
    subscribersServiceMock.findSummaryByExpedienteId.mockRejectedValue(compatibilityError);

    const result = await service.getDetailBootstrap('exp-1', 'actor-1');

    expect(result.subscriberSummary).toBeNull();
    expect(completenessCalculatorMock.calculateFromContext).toHaveBeenCalledTimes(1);
  });

  it('propaga errores operativos del subscriber summary y registra un warning sin PII', async () => {
    const expediente = buildExpediente();
    const projectionQuery = buildProjectionQuery(expediente);
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(projectionQuery),
      find: jest.fn().mockResolvedValue([]),
    };
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    const operationalError = new Error('subscriber store unavailable');
    subscribersServiceMock.findSummaryByExpedienteId.mockRejectedValue(operationalError);

    await expect(service.getDetailBootstrap('exp-1', 'actor-1')).rejects.toThrow(operationalError);
    expect(completenessCalculatorMock.calculateFromContext).toHaveBeenCalledTimes(1);
  });

  it('no resuelve el bootstrap sin contexto de tenant', async () => {
    mockTenantContextGetOrThrow.mockImplementationOnce(() => {
      throw new Error('TenantContext requerido');
    });

    await expect(service.getDetailBootstrap('exp-1', 'actor-1')).rejects.toThrow(
      'TenantContext requerido',
    );
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });
});

function buildCompleteness(): CompletenessResult {
  return {
    commercial: 40,
    legal: 20,
    technical: 30,
    operational: 10,
    overall: 25,
    sectionCompleteness: [],
    installationReadiness: {
      status: 'NOT_READY',
      canTransition: false,
      title: 'No listo para instalación',
      message: 'Faltan datos operativos.',
    },
    missingRequirements: [],
  };
}

function buildProjectionQuery(expediente: ExpedienteRecord | null) {
  const query = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    getRawAndEntities: jest.fn().mockResolvedValue({
      entities: expediente ? [expediente] : [],
      raw: [
        {
          bootstrap_has_document_number: true,
          bootstrap_has_phone_primary: true,
          bootstrap_has_email_primary: false,
          bootstrap_has_alt_contact_phone: false,
          bootstrap_has_site_contact_phone: false,
          bootstrap_has_address: false,
          bootstrap_has_municipality: false,
          bootstrap_has_department: false,
          bootstrap_has_postal_code: false,
          bootstrap_has_stratum: false,
          bootstrap_has_neighborhood: false,
          bootstrap_has_latitude: true,
          bootstrap_has_longitude: true,
          bootstrap_has_location: true,
          bootstrap_document_identity_approved: true,
          bootstrap_document_utility_bill_approved: true,
          bootstrap_document_chamber_approved: false,
          bootstrap_document_rut_approved: false,
          bootstrap_document_legal_representative_approved: false,
        },
      ],
    }),
  };

  query.select.mockReturnValue(query);
  query.addSelect.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

function buildExpediente(): ExpedienteRecord {
  return {
    id: 'exp-1',
    tenantId: 'tenant-test',
    status: ExpedienteStatus.NUEVO_POTENCIAL,
    previousStatus: null,
    statusChangedAt: new Date('2026-08-20T10:00:00.000Z'),
    discardReason: null,
    assignedTo: null,
    currentResponsibleUserId: null,
    currentResponsibleAssignedAt: null,
    dataConsentRevoked: false,
    fullName: 'Expediente de prueba',
    documentType: 'CC',
    documentNumberEncrypted: 'ciphertext-test',
    documentNumberHash: null,
    gender: null,
    birthDate: null,
    personType: null,
    companyName: null,
    firstName: 'Persona',
    lastName: 'Prueba',
    primaryContactName: null,
    primaryContactRole: null,
    phonePrimaryEncrypted: 'encrypted-phone-test',
    phoneSecondaryEncrypted: null,
    emailPrimaryEncrypted: null,
    emailSecondary: null,
    altContactName: null,
    altContactPhoneEncrypted: null,
    contactPreference: 'EMAIL',
    bestContactTime: '09:00-12:00',
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
    source: 'WEB',
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
    documentSupports: null,
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
    createdBy: 'user-test',
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    deletedAt: null,
    contactAttempts: [],
    consents: [],
    coverageChecks: [],
    statusChanges: [],
    salesAttributions: [],
  };
}
