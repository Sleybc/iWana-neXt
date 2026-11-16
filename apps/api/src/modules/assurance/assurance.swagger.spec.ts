import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AssuranceController } from './assurance.controller';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { TicketAttachmentsService } from './services/ticket-attachments.service';
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
          provide: TicketAttachmentsService,
          useValue: {
            decorateTicketList: jest.fn(async (result: unknown) => result),
            decorateComments: jest.fn(async (comments: unknown) => comments),
          },
        },
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
    expect(listTickets?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'subscriberId',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'string', format: 'uuid' }),
        }),
      ]),
    );

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

  it('documenta los adjuntos de tickets: multipart, lista y enlace firmado (spec MOD09 §2.2)', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Assurance Test').setVersion('1.0').build(),
    );
    const upload = document.paths['/assurance/tickets/{id}/comments/with-attachments']?.post;
    expect(upload?.requestBody).toMatchObject({
      content: {
        'multipart/form-data': { schema: expect.objectContaining({ required: ['body'] }) },
      },
    });
    expect(Object.keys(upload?.responses ?? {})).toEqual(
      expect.arrayContaining(['201', '400', '411', '413', '503']),
    );
    expect(document.paths['/assurance/tickets/{id}/attachments']?.get).toBeDefined();
    const link = document.paths['/assurance/tickets/{id}/attachments/{attachmentId}/link']?.get;
    expect(Object.keys(link?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '404', '409']),
    );
    // S-3: el límite por minuto queda documentado.
    expect(Object.keys(upload?.responses ?? {})).toContain('429');
  });

  it('m2: GET y POST de comentarios declaran `attachments`; el listado declara `attachmentCount`', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Assurance Test').setVersion('1.0').build(),
    );
    const comments = document.paths['/assurance/tickets/{id}/comments'];
    const attachmentsProperty = expect.objectContaining({
      type: 'array',
      items: expect.objectContaining({
        required: ['id', 'filename', 'contentType', 'sizeBytes', 'status'],
      }),
    });

    const created = getResponseSchema(comments?.post as unknown as Record<string, unknown>, '201');
    expect(created).toMatchObject({ required: expect.arrayContaining(['attachments']) });
    expect((created?.properties as Record<string, unknown>)?.['attachments']).toEqual(
      attachmentsProperty,
    );

    const listed = getResponseSchema(comments?.get as unknown as Record<string, unknown>, '200');
    expect(listed).toMatchObject({ type: 'array' });
    const item = listed?.items as Record<string, unknown> | undefined;
    expect(item).toMatchObject({ required: expect.arrayContaining(['attachments']) });
    expect((item?.properties as Record<string, unknown>)?.['attachments']).toEqual(
      attachmentsProperty,
    );

    const tickets = getResponseSchema(
      document.paths['/assurance/tickets']?.get as unknown as Record<string, unknown>,
      '200',
    );
    const data = (tickets?.properties as Record<string, Record<string, unknown>> | undefined)?.[
      'data'
    ];
    const ticket = data?.items as Record<string, unknown> | undefined;
    expect(ticket).toMatchObject({ required: expect.arrayContaining(['attachmentCount']) });
    expect((ticket?.properties as Record<string, unknown>)?.['attachmentCount']).toEqual(
      expect.objectContaining({ type: 'integer', minimum: 0 }),
    );
  });
});
