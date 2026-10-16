import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ExpedienteStatus } from '@iwana/shared';
import { PipelineRecommendationService } from '../pipeline-recommendation.service';
import {
  CompletenessCalculator,
  type CompletenessResult,
} from '../completeness-calculator.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import type { ExpedienteSensitiveFieldPresence } from '../expediente-section-completeness.types';

describe('PipelineRecommendationService', () => {
  let service: PipelineRecommendationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineRecommendationService,
        { provide: DataSource, useValue: {} },
        { provide: CompletenessCalculator, useValue: {} },
      ],
    }).compile();

    service = module.get<PipelineRecommendationService>(PipelineRecommendationService);
  });

  it('sugiere EN_COTIZACION cuando existe un plan y el hito funcional es alcanzable', async () => {
    const expediente = buildExpediente({
      status: ExpedienteStatus.NUEVO_POTENCIAL,
      interestedPlanId: 'plan-test',
    });
    const requirement = {
      sectionKey: 'customerInterest',
      sectionLabel: 'Interés comercial',
      fieldKey: 'casePriority',
      fieldLabel: 'Prioridad',
    };

    const result = await service.getRecommendationFromContext(
      expediente,
      buildCompleteness({
        sectionCompleteness: [
          {
            key: 'customerInterest',
            label: 'Interés comercial',
            percentage: 50,
            completedFields: 1,
            totalFields: 2,
            missingFields: [requirement],
          },
        ],
        missingRequirements: [requirement],
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        currentStatus: ExpedienteStatus.NUEVO_POTENCIAL,
        suggestedStatus: ExpedienteStatus.EN_COTIZACION,
        recommendationReason: expect.any(String),
        blockingRequirements: [requirement],
        informationalRequirements: [],
      }),
    );
  });

  it('no sugiere un cambio cuando el estado actual ya es óptimo o el expediente está descartado', async () => {
    const completeness = buildCompleteness();

    await expect(
      service.getRecommendationFromContext(
        buildExpediente({ status: ExpedienteStatus.NUEVO_POTENCIAL }),
        completeness,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        currentStatus: ExpedienteStatus.NUEVO_POTENCIAL,
        suggestedStatus: null,
        recommendationReason: null,
      }),
    );

    await expect(
      service.getRecommendationFromContext(
        buildExpediente({ status: ExpedienteStatus.DESCARTADO }),
        completeness,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        currentStatus: ExpedienteStatus.DESCARTADO,
        suggestedStatus: null,
        recommendationReason: null,
      }),
    );
  });

  it('no sugiere regresión cuando un expediente avanzado tiene datos incompletos', async () => {
    const result = await service.getRecommendationFromContext(
      buildExpediente({
        status: ExpedienteStatus.PRECALIFICADO,
        documentType: 'CC',
        documentNumberEncrypted: null,
        phonePrimaryEncrypted: null,
        emailPrimaryEncrypted: null,
      }),
      buildCompleteness(),
    );

    expect(result).toEqual(
      expect.objectContaining({
        currentStatus: ExpedienteStatus.PRECALIFICADO,
        suggestedStatus: null,
        recommendationReason: null,
        blockingRequirements: [],
      }),
    );
  });

  it('usa flags de ubicación cuando la proyección no carga valores exactos', async () => {
    const result = await service.getRecommendationFromContext(
      buildExpediente({ status: ExpedienteStatus.NUEVO_POTENCIAL }),
      buildCompleteness(),
      {
        documentNumber: false,
        phonePrimary: false,
        emailPrimary: false,
        altContactPhone: false,
        hasAddress: true,
        hasMunicipality: true,
        hasLatitude: false,
        hasLongitude: false,
      } satisfies ExpedienteSensitiveFieldPresence,
    );

    expect(result.suggestedStatus).toBe(ExpedienteStatus.VALIDANDO_COBERTURA);
  });

  it('usa coordenadas almacenadas cuando no hay flags de presencia proyectados', async () => {
    const result = await service.getRecommendationFromContext(
      buildExpediente({
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        latitude: 4.5,
        longitude: -74,
      }),
      buildCompleteness(),
    );

    expect(result.suggestedStatus).toBe(ExpedienteStatus.VALIDANDO_COBERTURA);
    expect(result.recommendationReason).toContain('ubicación');
  });

  it('propone los hitos de instalación y activación según los vínculos y el avance funcional', async () => {
    const pendingTicket = await service.getRecommendationFromContext(
      buildExpediente({
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        ticketId: 'ticket-sintetico',
        workOrderId: 'ot-sintetica',
      }),
      buildCompleteness(),
    );
    expect(pendingTicket).toEqual(
      expect.objectContaining({
        suggestedStatus: ExpedienteStatus.INSTALACION_AGENDADA,
        blockingRequirements: [],
      }),
    );

    const atThreshold = await service.getRecommendationFromContext(
      buildExpediente({ status: ExpedienteStatus.NUEVO_POTENCIAL }),
      buildCompleteness({
        sectionCompleteness: [
          {
            key: 'identification',
            label: 'Identificación',
            percentage: 75,
            completedFields: 3,
            totalFields: 4,
            missingFields: [],
          },
          {
            key: 'documentSupport',
            label: 'Soportes',
            percentage: 0,
            completedFields: 0,
            totalFields: 1,
            missingFields: [],
          },
        ],
      }),
    );
    expect(atThreshold.suggestedStatus).toBe(ExpedienteStatus.LISTO_PARA_INSTALACION);

    const active = await service.getRecommendationFromContext(
      buildExpediente({
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        ticketId: 'ticket-sintetico',
        workOrderId: 'ot-sintetica',
      }),
      buildCompleteness({
        sectionCompleteness: [
          {
            key: 'identification',
            label: 'Identificación',
            percentage: 100,
            completedFields: 4,
            totalFields: 4,
            missingFields: [],
          },
        ],
      }),
    );
    expect(active).toEqual(
      expect.objectContaining({
        suggestedStatus: ExpedienteStatus.CLIENTE_ACTIVO,
        recommendationReason: expect.stringContaining('datos funcionales completos'),
      }),
    );
  });

  it('alcanza PRECALIFICADO por identidad y contacto, y respeta flags negativos de proyección', async () => {
    const qualified = await service.getRecommendationFromContext(
      buildExpediente({
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        documentType: 'CC',
        documentNumberEncrypted: 'cipher-sintetico',
        phonePrimaryEncrypted: 'cipher-telefono',
      }),
      buildCompleteness(),
    );
    expect(qualified.suggestedStatus).toBe(ExpedienteStatus.PRECALIFICADO);

    const projectionWithoutLocation = await service.getRecommendationFromContext(
      buildExpediente({
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        latitude: 4.5,
        longitude: -74,
        address: 'Dirección sintética',
        municipality: 'Municipio sintético',
      }),
      buildCompleteness(),
      {
        documentNumber: false,
        phonePrimary: false,
        emailPrimary: false,
        altContactPhone: false,
        hasAddress: false,
        hasMunicipality: false,
        hasLatitude: false,
        hasLongitude: false,
      } satisfies ExpedienteSensitiveFieldPresence,
    );
    expect(projectionWithoutLocation.suggestedStatus).toBeNull();
  });

  it('separa faltantes funcionales de soportes y no expone bloqueos si no hay avance', async () => {
    const missingRequirements = [
      {
        sectionKey: 'identification',
        sectionLabel: 'Identificación',
        fieldKey: 'documentNumber',
        fieldLabel: 'Documento',
      },
      {
        sectionKey: 'contact',
        sectionLabel: 'Contacto',
        fieldKey: 'phonePrimary',
        fieldLabel: 'Teléfono',
      },
      {
        sectionKey: 'address',
        sectionLabel: 'Dirección',
        fieldKey: 'municipality',
        fieldLabel: 'Municipio',
      },
      {
        sectionKey: 'documentSupport',
        sectionLabel: 'Soportes documentales',
        fieldKey: 'identity_document',
        fieldLabel: 'Documento de identidad',
      },
    ];
    const completeness = buildCompleteness({ missingRequirements });
    const expediente = buildExpediente({
      status: ExpedienteStatus.NUEVO_POTENCIAL,
      documentType: 'CC',
      documentNumberEncrypted: 'cipher-documento',
      phonePrimaryEncrypted: 'cipher-telefono',
    });

    const advancing = await service.getRecommendationFromContext(expediente, completeness);
    expect(advancing).toEqual(
      expect.objectContaining({
        suggestedStatus: ExpedienteStatus.PRECALIFICADO,
        blockingRequirements: missingRequirements.slice(0, 3),
        informationalRequirements: [missingRequirements[3]],
      }),
    );

    const alreadyAtMilestone = await service.getRecommendationFromContext(
      buildExpediente({ ...expediente, status: ExpedienteStatus.PRECALIFICADO }),
      completeness,
    );
    expect(alreadyAtMilestone).toEqual(
      expect.objectContaining({
        currentStatus: ExpedienteStatus.PRECALIFICADO,
        suggestedStatus: null,
        blockingRequirements: [],
        informationalRequirements: [missingRequirements[3]],
      }),
    );
  });
});

function buildCompleteness(overrides: Partial<CompletenessResult> = {}): CompletenessResult {
  return {
    commercial: 0,
    legal: 0,
    technical: 0,
    operational: 0,
    overall: 0,
    sectionCompleteness: [],
    installationReadiness: {
      status: 'NOT_READY',
      canTransition: false,
      title: 'No listo para instalación',
      message: 'Faltan requisitos funcionales.',
    },
    missingRequirements: [],
    ...overrides,
  };
}

function buildExpediente(
  overrides: Partial<
    Pick<
      ExpedienteRecord,
      | 'status'
      | 'interestedPlanId'
      | 'documentType'
      | 'documentNumberEncrypted'
      | 'phonePrimaryEncrypted'
      | 'emailPrimaryEncrypted'
      | 'ticketId'
      | 'workOrderId'
      | 'latitude'
      | 'longitude'
      | 'address'
      | 'municipality'
    >
  >,
): ExpedienteRecord {
  return {
    id: 'exp-test',
    status: overrides.status ?? ExpedienteStatus.NUEVO_POTENCIAL,
    interestedPlanId: overrides.interestedPlanId ?? null,
    documentType: overrides.documentType ?? null,
    documentNumberEncrypted: overrides.documentNumberEncrypted ?? null,
    phonePrimaryEncrypted: overrides.phonePrimaryEncrypted ?? null,
    emailPrimaryEncrypted: overrides.emailPrimaryEncrypted ?? null,
    ticketId: overrides.ticketId ?? null,
    workOrderId: overrides.workOrderId ?? null,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    address: overrides.address ?? null,
    municipality: overrides.municipality ?? null,
  } as ExpedienteRecord;
}
