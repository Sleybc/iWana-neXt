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
  } as ExpedienteRecord;
}
