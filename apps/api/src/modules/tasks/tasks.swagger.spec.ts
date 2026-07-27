import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TasksController } from './tasks.controller';
import { ExecutionOrdersController } from './execution-orders.controller';
import { ExecutionOrdersService } from './services/execution-orders.service';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { ExecutionOrderAccessGuard } from './guards/execution-order-access.guard';
import { TenantAwareThrottlerGuard } from './guards/tenant-aware-throttler.guard';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskTimelineService } from './services/task-timeline.service';
import { TasksService } from './services/tasks.service';

function getRequestSchema(
  operation: Record<string, unknown> | undefined,
  mimeType: string,
): Record<string, unknown> | undefined {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const typedBody = content?.[mimeType] as Record<string, unknown> | undefined;

  return typedBody?.schema as Record<string, unknown> | undefined;
}

describe('TasksController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController, ExecutionOrdersController],
      providers: [
        { provide: TasksService, useValue: {} },
        { provide: TaskAssignmentService, useValue: {} },
        { provide: TaskTimelineService, useValue: {} },
        { provide: ExecutionOrdersService, useValue: {} },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn() },
        },
        { provide: ExecutionOrderAccessGuard, useValue: { canActivate: () => true } },
        { provide: TenantAwareThrottlerGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta endpoints esenciales del modulo tasks', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Tasks Test').setVersion('1.0').build(),
    );

    const listTasks = document.paths['/tasks']?.get;
    const createTask = document.paths['/tasks']?.post;
    const assignTask = document.paths['/tasks/{id}/assign']?.post;
    const transitionTask = document.paths['/tasks/{id}/transition']?.post;

    expect(listTasks).toBeDefined();
    expect(listTasks?.summary).toBe('Listar tareas operativas del tenant');

    expect(createTask).toBeDefined();
    expect(createTask?.summary).toBe('Crear tarea operativa');
    expect(
      getRequestSchema(createTask as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();

    expect(assignTask).toBeDefined();
    expect(assignTask?.summary).toBe('Reasignar responsable de la tarea');

    expect(transitionTask).toBeDefined();
    expect(transitionTask?.summary).toBe('Transicionar estado de la tarea');
  });

  it('verifica que los principales contratos REST estan documentados', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Tasks Test').setVersion('1.0').build(),
    );

    const requiredPaths = [
      '/tasks',
      '/tasks/{id}',
      '/tasks/{id}/assign',
      '/tasks/{id}/transition',
      '/tasks/{id}/link-schedule-event',
      '/tasks/{id}/link-work-order',
      '/tasks/{id}/timeline',
      '/tasks/{id}/assignment-history',
    ];

    for (const path of requiredPaths) {
      expect(document.paths[path]).toBeDefined();
    }
  });

  it('registra ExecutionOrdersController y mantiene el contrato v1 publicado', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Tasks Test').setVersion('1.0').build(),
    );
    expect(document.paths['/tasks/execution-orders/{id}']?.get).toBeDefined();
    expect(document.paths['/tasks/execution-orders/{id}/start']?.post).toBeDefined();
    expect(document.paths['/tasks/execution-orders/{id}/item-usage']?.post).toBeDefined();
    expect(document.paths['/tasks/execution-orders/{id}/close']?.post).toBeDefined();

    // La especificación máquina-legible es una fuente de contrato congelada,
    // y debe declarar seguridad, headers de concurrencia e idempotencia.
    const published = require('../../../openapi/tasks-execution-orders.v1.json') as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(published.openapi).toBe('3.0.3');
    expect(published.paths['/tasks/execution-orders/{id}/close']?.post).toBeDefined();
    for (const path of [
      '/tasks/execution-orders/{id}/assign',
      '/tasks/execution-orders/{id}/evidence',
      '/tasks/execution-orders/{id}/evidence-assets',
      '/tasks/execution-orders/{id}/evidence-assets/{mediaAssetId}',
      '/tasks/execution-orders/{id}/block',
      '/tasks/execution-orders/{id}/unblock',
      '/tasks/execution-orders/{id}/follow-ups',
    ])
      expect(published.paths[path]).toBeDefined();
    const closeParameters =
      (
        published.paths['/tasks/execution-orders/{id}/close']?.post as {
          parameters?: Array<{ $ref?: string }>;
        }
      ).parameters ?? [];
    expect(closeParameters.map((parameter) => parameter.$ref)).toEqual(
      expect.arrayContaining([
        '#/components/parameters/IfMatch',
        '#/components/parameters/IdempotencyKey',
      ]),
    );
  });
});
