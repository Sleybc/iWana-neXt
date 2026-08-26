import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpedientesController } from '../expedientes.controller';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { ExpedienteService } from '../expediente.service';
import { PipelineRecommendationService } from '../pipeline-recommendation.service';
import { StatusTransitionService } from '../status-transition.service';
import { ExpedienteDetailBootstrapService } from '../expediente-detail-bootstrap.service';

type OpenApiRecord = Record<string, unknown>;

describe('ExpedientesController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExpedientesController],
      providers: [
        { provide: ExpedienteService, useValue: {} },
        { provide: StatusTransitionService, useValue: {} },
        { provide: CompletenessCalculator, useValue: {} },
        { provide: PipelineRecommendationService, useValue: {} },
        { provide: ExpedienteDetailBootstrapService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta events como array oneOf y limita limit a 50', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Expedientes Test').setVersion('1.0').build(),
    ) as unknown as OpenApiRecord;
    const paths = document.paths as OpenApiRecord;
    const timeline = (paths['/crm/expedientes/{id}/timeline'] as OpenApiRecord)
      .get as OpenApiRecord;
    const parameters = timeline.parameters as OpenApiRecord[];
    const limitParameter = parameters.find((parameter) => parameter.name === 'limit');
    const pageParameter = parameters.find((parameter) => parameter.name === 'page');
    const schemas = ((document.components as OpenApiRecord).schemas ?? {}) as OpenApiRecord;
    const timelineData = schemas.ExpedienteTimelinePaginatedDataSwaggerDto as OpenApiRecord;
    const events = timelineData.properties as OpenApiRecord;
    const eventsSchema = events.events as OpenApiRecord;
    const items = eventsSchema.items as OpenApiRecord;
    const oneOf = items.oneOf as OpenApiRecord[];
    const pageMeta = schemas.ExpedienteTimelinePageMetaSwaggerDto as OpenApiRecord;
    const pageMetaProperties = pageMeta.properties as OpenApiRecord;

    expect(limitParameter?.schema).toEqual(expect.objectContaining({ maximum: 50 }));
    expect(pageParameter?.description).toContain('page × limit');
    expect(limitParameter?.description).toContain('500');
    expect((pageMetaProperties.total as OpenApiRecord).maximum).toBe(500);
    expect((pageMetaProperties.totalPages as OpenApiRecord).description).toContain('500');
    expect(pageMetaProperties.truncated).toBeDefined();
    expect(pageMetaProperties.hasMore).toBeDefined();
    expect(eventsSchema.type).toBe('array');
    expect(oneOf).toEqual([
      { $ref: '#/components/schemas/ExpedienteContactTimelineEventSwaggerDto' },
      { $ref: '#/components/schemas/ExpedienteResponsibilityTimelineEventSwaggerDto' },
      { $ref: '#/components/schemas/ExpedienteAttributionTimelineEventSwaggerDto' },
      { $ref: '#/components/schemas/ExpedientePipelineTimelineEventSwaggerDto' },
      { $ref: '#/components/schemas/ExpedienteSystemTimelineEventSwaggerDto' },
    ]);
  });
});
