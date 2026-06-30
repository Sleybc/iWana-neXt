import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TasksController } from './tasks.controller';
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
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: {} },
        { provide: TaskAssignmentService, useValue: {} },
        { provide: TaskTimelineService, useValue: {} },
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
});
