import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrderTemplatesController } from '../execution-order-templates.controller';
import { TasksController } from '../tasks.controller';
import { ExecutionOrderAccessGuard } from '../guards/execution-order-access.guard';
import { TenantAwareThrottlerGuard } from '../guards/tenant-aware-throttler.guard';
import { ExecutionOrderResponseHeadersInterceptor } from '../interceptors/execution-order-response-headers.interceptor';
import { ExecutionOrderTemplatesService } from '../services/execution-order-templates.service';
import { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import { TaskAssignmentService } from '../services/task-assignment.service';
import { TaskTimelineService } from '../services/task-timeline.service';
import { TasksService } from '../services/tasks.service';

/**
 * Regresión de enrutado del módulo tasks (DEF-F6-01, OLA 4.1).
 *
 * Express resuelve en orden de registro y `TasksController` declara
 * `@Get(':id')` (un segmento). Si ese controlador se registra antes que sus
 * hermanos, captura las rutas estáticas de un segmento de los otros dos —
 * `tasks/execution-orders` y `tasks/execution-order-templates` — y el
 * `ParseUUIDPipe` responde 400 a rutas vivas (medido por SR-QA contra el API
 * real: bloque 9, caso 9a).
 *
 * El harness monta los controladores en el orden REAL declarado por
 * `tasks.module.ts` y lo lee del fuente, no del decorador: importar
 * `TasksModule` arrastra el grafo completo de módulos (AuthModule → otplib,
 * ESM que Jest no transforma aquí), mismo motivo que en
 * `tasks.entity-metadata.spec.ts`. Revertir el orden de `controllers` en el
 * módulo vuelve a poner este spec en rojo. Los specs por controlador
 * (`execution-orders.controller.http.spec.ts`) no ven esta clase de colisión:
 * montan un único controlador.
 */
const CONTROLLER_REGISTRY: Record<string, unknown> = {
  ExecutionOrdersController,
  ExecutionOrderTemplatesController,
  TasksController,
};

function readDeclaredControllerOrder(): { names: string[]; controllers: unknown[] } {
  const source = readFileSync(join(__dirname, '../tasks.module.ts'), 'utf8');
  const match = source.match(/controllers:\s*\[([^\]]*)\]/);
  if (!match) {
    throw new Error('No se encontró la declaración `controllers:` en tasks.module.ts');
  }

  const names = (match[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const unregistered = names.filter((name) => !(name in CONTROLLER_REGISTRY));
  if (unregistered.length > 0) {
    throw new Error(
      `Controller(s) sin registro en este test: ${unregistered.join(', ')}. ` +
        'Actualiza CONTROLLER_REGISTRY al añadir controladores a TasksModule.',
    );
  }

  return { names, controllers: names.map((name) => CONTROLLER_REGISTRY[name]) };
}

describe('Módulo tasks — orden de registro de rutas (regresión DEF-F6-01)', () => {
  const TASK_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  let app: INestApplication;
  let declaredNames: string[];
  let declaredControllers: unknown[];

  const listExecutionOrders = jest.fn().mockResolvedValue({
    data: [],
    meta: { total: 0 },
  });
  const listTemplates = jest.fn().mockResolvedValue([]);
  const getTaskById = jest.fn().mockResolvedValue({ id: TASK_UUID });
  const getRelayHealth = jest.fn().mockResolvedValue({ status: 'OK' });
  const redriveEvent = jest.fn().mockResolvedValue({ eventId: TASK_UUID, status: 'QUEUED' });

  beforeAll(async () => {
    ({ names: declaredNames, controllers: declaredControllers } = readDeclaredControllerOrder());

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: declaredControllers as never[],
      providers: [
        { provide: TasksService, useValue: { getById: getTaskById } },
        { provide: TaskAssignmentService, useValue: {} },
        { provide: TaskTimelineService, useValue: {} },
        { provide: ExecutionOrdersService, useValue: { list: listExecutionOrders, redriveEvent } },
        { provide: ExecutionOrderTemplatesService, useValue: { listTemplates } },
        {
          provide: ExecutionOrderProjectionConvergenceService,
          useValue: { getRelayHealth },
        },
      ],
    })
      // Los guards de `@UseGuards(Clase)` se resuelven como injectables (no
      // como providers): solo `overrideGuard`/`overrideInterceptor` los
      // sustituye. Este spec verifica enrutado, no autorización.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ExecutionOrderAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantAwareThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(ExecutionOrderResponseHeadersInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declara los controladores de rutas estáticas antes de TasksController', () => {
    expect(Array.isArray(declaredControllers)).toBe(true);

    const ordersIndex = declaredNames.indexOf('ExecutionOrdersController');
    const templatesIndex = declaredNames.indexOf('ExecutionOrderTemplatesController');
    const tasksIndex = declaredNames.indexOf('TasksController');

    expect(ordersIndex).toBeGreaterThanOrEqual(0);
    expect(templatesIndex).toBeGreaterThanOrEqual(0);
    expect(tasksIndex).toBeGreaterThanOrEqual(0);
    expect(ordersIndex).toBeLessThan(tasksIndex);
    expect(templatesIndex).toBeLessThan(tasksIndex);
  });

  it('GET /api/v1/tasks/execution-orders alcanza el listado de OT y no el :id de tasks', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/tasks/execution-orders');

    expect(response.status).toBe(200);
    expect(listExecutionOrders).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/tasks/execution-order-templates alcanza el listado de plantillas', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/tasks/execution-order-templates',
    );

    expect(response.status).toBe(200);
    expect(listTemplates).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/tasks/:id sigue resolviendo el detalle de tarea en TasksController', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/tasks/${TASK_UUID}`);

    expect(response.status).toBe(200);
    expect(getTaskById).toHaveBeenCalledWith(TASK_UUID, undefined);
  });

  it('GET /api/v1/tasks/execution-orders/health/relay alcanza el relay sin sombreado (§13.1)', async () => {
    // La deuda §13.1 del plan sospechaba sombreado de `health/relay` (dos
    // segmentos) por `:id` (un segmento): no aplica — un patrón de un solo
    // segmento no captura rutas más profundas. Este caso lo deja fijado.
    const response = await request(app.getHttpServer()).get(
      '/api/v1/tasks/execution-orders/health/relay',
    );

    expect(response.status).toBe(200);
    expect(getRelayHealth).toHaveBeenCalledTimes(1);
  });

  it('POST /api/v1/tasks/execution-orders/events/:eventId/redrive no es sombreado por :id/*', async () => {
    // Tercera ruta con prefijo literal declarada después de las dinámicas:
    // `events/…` (tres segmentos) no colisiona con `:id/…` (dos segmentos) ni
    // con `:id/activities/:activityId` (literal intermedio distinto).
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tasks/execution-orders/events/${TASK_UUID}/redrive`)
      .set('Idempotency-Key', 'routing-redrive-001')
      .send({ causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' });

    expect(response.status).toBe(202);
    expect(redriveEvent).toHaveBeenCalledTimes(1);
  });
});
