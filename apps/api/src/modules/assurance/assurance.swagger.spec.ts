import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AssuranceController } from './assurance.controller';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { CommentsService } from './services/comments.service';
import { SlaService } from './services/sla.service';
import { TicketsService } from './services/tickets.service';
import { TimelineService } from './services/timeline.service';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';

function getResponseSchema(
  operation: Record<string, unknown> | undefined,
  statusCode: string,
): Record<string, unknown> | undefined {
  const responses = operation?.responses as Record<string, unknown> | undefined;
  const response = responses?.[statusCode] as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, unknown> | undefined;
  const jsonBody = content?.['application/json'] as Record<string, unknown> | undefined;

  return jsonBody?.schema as Record<string, unknown> | undefined;
}

function getRequestSchema(
  operation: Record<string, unknown> | undefined,
  mimeType: string,
): Record<string, unknown> | undefined {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const typedBody = content?.[mimeType] as Record<string, unknown> | undefined;

  return typedBody?.schema as Record<string, unknown> | undefined;
}

describe('AssuranceController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssuranceController],
      providers: [
        { provide: TicketsService, useValue: {} },
        { provide: CommentsService, useValue: {} },
        { provide: TimelineService, useValue: {} },
        { provide: SlaService, useValue: {} },
        { provide: AssuranceDashboardService, useValue: {} },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta endpoints esenciales del módulo assurance', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Assurance Test').setVersion('1.0').build(),
    );

    const listTickets = document.paths['/assurance/tickets']?.get;
    const createTicket = document.paths['/assurance/tickets']?.post;
    const getDashboardSummary = document.paths['/assurance/dashboard/summary']?.get;
    const requestFieldService =
      document.paths['/assurance/tickets/{id}/request-field-service']?.post;
    const linkWorkOrder = document.paths['/assurance/tickets/{id}/link-work-order']?.post;

    expect(listTickets).toBeDefined();
    expect(listTickets?.summary).toBe('Listar tickets del tenant');

    expect(createTicket).toBeDefined();
    expect(createTicket?.summary).toBe('Crear ticket de service assurance');
    expect(
      getRequestSchema(createTicket as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();

    expect(getDashboardSummary).toBeDefined();
    expect(getDashboardSummary?.summary).toBe('Resumen operativo de assurance para dashboard');

    expect(requestFieldService).toBeDefined();
    expect(requestFieldService?.summary).toBe(
      'Solicitar trabajo de campo hacia WFM (alias REST de fase 01)',
    );

    expect(linkWorkOrder).toBeDefined();
    expect(linkWorkOrder?.summary).toBe('Asociar una Work Order existente al ticket');
  });

  it('verifica que dashboard/summary está documentado con respuesta definida', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Assurance Test').setVersion('1.0').build(),
    );

    const getDashboardSummary = document.paths['/assurance/dashboard/summary']?.get;
    const schema = getResponseSchema(
      getDashboardSummary as unknown as Record<string, unknown>,
      '200',
    );

    expect(getDashboardSummary).toBeDefined();
    expect(getDashboardSummary?.summary).toContain('dashboard');
    expect(getDashboardSummary?.responses).toBeDefined();
    expect(schema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: expect.arrayContaining([
          'openCount',
          'breachedCount',
          'fieldServicePendingCount',
          'byPriority',
          'byType',
          'byQueue',
        ]),
        properties: expect.objectContaining({
          openCount: expect.objectContaining({ type: 'number' }),
          breachedCount: expect.objectContaining({ type: 'number' }),
          fieldServicePendingCount: expect.objectContaining({ type: 'number' }),
          byQueue: expect.objectContaining({
            type: 'object',
            additionalProperties: expect.objectContaining({ type: 'number' }),
          }),
        }),
      }),
    );
  });

  it('verifica que los principales contratos REST están documentados', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Assurance Test').setVersion('1.0').build(),
    );

    const requiredPaths = [
      '/assurance/tickets',
      '/assurance/tickets/{id}',
      '/assurance/tickets/{id}/status',
      '/assurance/tickets/{id}/comments',
      '/assurance/tickets/{id}/assign',
      '/assurance/tickets/{id}/timeline',
      '/assurance/tickets/{id}/request-field-service',
      '/assurance/tickets/{id}/link-work-order',
      '/assurance/dashboard/summary',
      '/assurance/sla-policies',
    ];

    for (const path of requiredPaths) {
      expect(document.paths[path]).toBeDefined();
    }
  });
});
