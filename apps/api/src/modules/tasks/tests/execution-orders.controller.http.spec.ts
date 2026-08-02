import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  AccessPermissionKey,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { ExecutionOrderAccessGuard } from '../guards/execution-order-access.guard';
import { TenantAwareThrottlerGuard } from '../guards/tenant-aware-throttler.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { ExecutionOrderResponseHeadersInterceptor } from '../interceptors/execution-order-response-headers.interceptor';
import { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { createVerifiedTenantContextMiddleware } from './tenant-context-test.middleware';

/** Double compartido que reproduce la operación atómica EVAL del store Redis. */
class SharedRedisRateLimitDouble {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();

  async eval(_script: string, _keyCount: number, key: string, windowMs: string): Promise<number> {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.expiresAt <= now) {
      this.entries.set(key, { count: 1, expiresAt: now + Number(windowMs) });
      return 1;
    }

    current.count += 1;
    return current.count;
  }
}

const unusedRedisClient = { eval: jest.fn().mockResolvedValue(1) };

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload;
        };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);

      if (isPublic) return true;

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          email: 'tech@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer tech-002-token') {
        req.user = {
          sub: 'tech-002',
          email: 'tech2@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech2',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer coordinator-token') {
        req.user = {
          sub: 'coord-001',
          email: 'coord@example.test',
          role: UserRole.NOC,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-coord',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer coordinator-readonly-token') {
        req.user = {
          sub: 'coord-readonly-001',
          email: 'coord-readonly@example.test',
          role: UserRole.NOC,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-coord-ro',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer contractor-token') {
        req.user = {
          sub: 'contractor-001',
          email: 'contractor@example.test',
          role: UserRole.CONTRACTOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-contractor',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer contractor-tenantb-token') {
        req.user = {
          sub: 'contractor-tb-001',
          email: 'contractor-tb@example.test',
          role: UserRole.CONTRACTOR,
          tenantId: 'tenant-002',
          schemaName: 'tenant_002',
          jti: 'jti-contractor-tb',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) return true;
      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
      }

      return true;
    }
  },
}));

describe('ExecutionOrdersController HTTP', () => {
  let app: INestApplication;

  const ORDER_UUID = '22222222-2222-4222-8222-222222222222';

  const buildExecutionOrdersServiceMock = () => ({
    assertActorAccess: jest.fn().mockResolvedValue(undefined),
    assertActorCanRedrive: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      executionOrderNumber: 'OTE-20260727-001',
      version: 1,
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      workType: 'INSTALLATION',
      templateId: null,
      templateKey: null,
      templateVersionNumber: null,
      templateLabel: null,
      scheduleEventId: '33333333-3333-4333-8333-333333333333',
      plannedWindowStartAt: '2026-07-27T14:00:00.000Z',
      plannedWindowEndAt: '2026-07-27T16:00:00.000Z',
      assignedTechnicianId: 'tech-001',
      municipality: 'Bogotá',
      sector: 'Centro',
      startedAt: null,
      closedAt: null,
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    }),
    listActivities: jest.fn().mockResolvedValue([]),
    listItemUsage: jest.fn().mockResolvedValue([]),
    listEvidences: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'evidence-001',
          status: 'AVAILABLE',
          evidenceType: 'PHOTO',
          requirementKey: 'req-photo-install',
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          capturedAt: '2026-07-27T15:00:00.000Z',
          receivedAt: '2026-07-27T15:01:00.000Z',
          assetStatus: 'AVAILABLE',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
      meta: {
        nextCursor: null,
        total: 1,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    }),
    start: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.IN_PROGRESS,
      version: 2,
    }),
    registerFieldWork: jest.fn().mockResolvedValue({
      id: 'activity-001',
      activityType: 'INSTALLATION',
      description: 'Trabajo completado',
    }),
    registerItemUsage: jest.fn().mockResolvedValue({
      id: 'usage-001',
      itemId: 'item-001',
      quantity: '1',
    }),
    close: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
      version: 2,
    }),
    assign: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.ASSIGNED,
      version: 2,
    }),
    block: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.BLOCKED,
      version: 2,
    }),
    unblock: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.IN_PROGRESS,
      version: 2,
    }),
    createEvidenceAssetReceipt: jest.fn().mockResolvedValue({
      intentId: 'intent-001',
      mediaAssetId: 'media-001',
      status: 'PENDING_ANALYSIS',
    }),
    getEvidenceAssetReceipt: jest.fn().mockResolvedValue({
      mediaAssetId: 'media-001',
      status: 'PENDING_ANALYSIS',
    }),
    getEvidenceContentRedirect: jest
      .fn()
      .mockResolvedValue('https://minio.example/bucket/obj?X-Amz-Signature=abc123'),
    registerEvidence: jest.fn().mockResolvedValue({
      id: 'evidence-001',
      mediaAssetId: 'media-001',
    }),
    createFollowUp: jest.fn().mockResolvedValue({
      intentId: 'followup-001',
      resourceRef: 'resource-001',
      status: 'ACCEPTED',
    }),
    redriveEvent: jest.fn().mockResolvedValue({
      eventId: 'event-001',
      status: 'QUEUED',
    }),
    getSyncState: jest.fn().mockResolvedValue('IN_SYNC' as const),
    getCompletion: jest.fn().mockResolvedValue({ progress: 40, completed: 2, total: 5 }),
    computeAllowedActions: jest.fn().mockReturnValue(['START', 'REGISTER_ACTIVITY'] as const),
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionOrdersController],
      providers: [
        {
          provide: ExecutionOrdersService,
          useFactory: buildExecutionOrdersServiceMock,
        },
        { provide: PermissionsGuard, useValue: { canActivate: () => true } },
        { provide: ExecutionOrderAccessGuard, useValue: { canActivate: () => true } },
        TenantAwareThrottlerGuard,
        { provide: REDIS_CLIENT, useValue: unusedRedisClient },
        {
          provide: EffectivePermissionsService,
          useValue: {
            getEffectivePermissionsForUser: jest
              .fn()
              .mockResolvedValue([
                'operations.execution_orders.read',
                'operations.execution_orders.execute',
              ]),
          },
        },
        JwtAuthGuard,
        RolesGuard,
        ExecutionOrderResponseHeadersInterceptor,
        {
          provide: ExecutionOrderProjectionConvergenceService,
          useValue: { verifyConvergence: jest.fn().mockResolvedValue({ status: 'IN_SYNC' }) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(createVerifiedTenantContextMiddleware());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── CA-00-01: BOLA a nivel HTTP ────────────────────────────────────────

  it.each(['evidence-assets/not-a-uuid', 'evidence-assets/not-a-uuid/content'])(
    'rechaza mediaAssetId malformado con 400 antes de consultar el servicio (%s)',
    async (suffix) => {
      await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}/${suffix}`)
        .set('Authorization', 'Bearer support-token')
        .expect(400);
    },
  );

  describe('autorización (BOLA)', () => {
    it('retorna 401 sin token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
        .expect(401);
    });

    it('retorna 403 para token con rol no autorizado', async () => {
      // El coordinador (NOC) tiene rol correcto, pero si no le damos el permiso...
      // En este test el PermissionsGuard mocked retorna true, así que probamos
      // acceso general con token válido
      await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
        .set('Authorization', 'Bearer support-token')
        .expect(200);
    });

    it('rechaza comando POST sin token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
        .send({ notes: 'Inicio sin token' })
        .expect(401);
    });

    it('retorna la lista mínima de evidencias para una OT autorizada', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidences?limit=100`)
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      expect(response.body.data).toEqual([
        expect.objectContaining({
          id: 'evidence-001',
          status: 'AVAILABLE',
          evidenceType: 'PHOTO',
          requirementKey: 'req-photo-install',
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          capturedAt: '2026-07-27T15:00:00.000Z',
          receivedAt: '2026-07-27T15:01:00.000Z',
          assetStatus: 'AVAILABLE',
        }),
      ]);
      expect(response.body.data[0]).not.toHaveProperty('tenantId');
      expect(response.body.data[0]).not.toHaveProperty('actorUserId');
    });

    it('publica progreso porcentual y conteos de requisitos separados', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
        .set('Authorization', 'Bearer support-token')
        .expect(200);

      expect(response.body.completion).toEqual(
        expect.objectContaining({ progress: 40, completed: 2, total: 5 }),
      );
      expect(response.body.completion.progress).not.toBe(0.4);
      expect(response.body.template).toBeNull();
    });

    it('rechaza un límite superior al máximo contractual', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidences?limit=101`)
        .set('Authorization', 'Bearer support-token')
        .expect(400);
    });
  });

  describe('contrato de custodia R1.4', () => {
    it('acepta technicianCustodyId como único campo canónico', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/item-usage`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'item-usage-r14-canonical')
        .send({
          itemId: 'item-001',
          quantity: 1,
          technicianCustodyId: 'custody-001',
          serialNumber: 'serial-001',
          action: 'INSTALL',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        })
        .expect(202);
    });

    it('rechaza custodySelection y no lo traduce como alias', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/item-usage`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'item-usage-r14-legacy')
        .send({
          itemId: 'item-001',
          quantity: 1,
          custodySelection: { type: 'TECHNICIAN', id: 'custody-001' },
          action: 'INSTALL',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        })
        .expect(400);
    });
  });

  describe('contrato de evidencia R1', () => {
    const validEvidence = {
      mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      evidenceType: 'PHOTO',
      requirementKey: 'req-photo-installation',
      expiresAt: '2099-06-25T14:00:00.000Z',
      capturedAt: null,
    };

    it('acepta capturedAt nulo y delega el comando validado', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'evidence-r1-valid-0001')
        .send(validEvidence)
        .expect(201);
    });

    it('propaga Idempotency-Key, If-Match y correlación al servicio de upload', async () => {
      const service = app.get(ExecutionOrdersService) as {
        createEvidenceAssetReceipt: jest.Mock;
      };
      service.createEvidenceAssetReceipt.mockClear();

      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence-assets`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'evidence-upload-http-001')
        .set('X-Correlation-Id', '00000000-0000-4000-8000-000000000001')
        .attach('file', Buffer.from('multipart-evidence'), 'evidence.jpg')
        .expect(202);

      expect(service.createEvidenceAssetReceipt).toHaveBeenCalledWith(
        ORDER_UUID,
        expect.objectContaining({ fieldname: 'file' }),
        expect.objectContaining({ sub: 'tech-001' }),
        expect.objectContaining({
          idempotencyKey: 'evidence-upload-http-001',
          ifMatch: '1',
          requireIdempotency: true,
          requireIfMatch: true,
          correlationId: '00000000-0000-4000-8000-000000000001',
        }),
      );
    });

    it.each([
      { field: 'evidenceType', value: 'VIDEO' },
      { field: 'expiresAt', value: '2020-06-25T14:00:00.000Z' },
      { field: 'requirementKey', value: '   ' },
    ])('rechaza $field inválido con 400', async ({ field, value }) => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', `evidence-r1-invalid-${field}`)
        .send({ ...validEvidence, [field]: value })
        .expect(400);
    });
  });

  // ─── Mass Assignment Protection ──────────────────────────────────────────

  describe('protección contra mass assignment', () => {
    it('rechaza campo desconocido en comando start', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'start-key-00000001')
        .send({ notes: 'Inicio', tenantId: 'hacked-tenant', __proto__: { admin: true } })
        .expect(400);
    });

    it('rechaza campo desconocido en comando close', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/close`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'close-key-00000001')
        .send({
          result: ExecutionOrderResult.EXECUTED,
          summary: 'Cierre',
          unknownField: 'intento de mass assignment',
        })
        .expect(400);
    });

    it('rechaza campo status en comando registerFieldWork', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/field-work`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'fieldwork-key-00001')
        .send({
          activityType: 'INSTALLATION',
          description: 'Trabajo en campo',
          status: ExecutionOrderStatus.CANCELLED,
        })
        .expect(400);
    });

    it('rechaza campo version en comando close', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/close`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'close-key-00000002')
        .send({
          result: ExecutionOrderResult.EXECUTED,
          summary: 'Cierre forzado',
          version: 999,
        })
        .expect(400);
    });

    it('rechaza campo tenantId en comando start', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'start-key-00000002')
        .send({ notes: 'Inicio', tenantId: 'other-tenant-uuid' })
        .expect(400);
    });
  });

  // ─── PII Protection ─────────────────────────────────────────────────────

  describe('protección PII en campos de texto', () => {
    it('rechaza número de cédula colombiana en description', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/field-work`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'fieldwork-pii-00001')
        .send({
          activityType: 'INSTALLATION',
          description: 'Cliente con CC 1234567890 requiere visita urgente',
        })
        .expect(400);
    });

    it('rechaza número de teléfono colombiano en description', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/field-work`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'fieldwork-pii-00002')
        .send({
          activityType: 'VERIFICATION',
          description: 'Contactar al 3201234567 antes de la visita',
        })
        .expect(400);
    });

    it('rechaza patrón de cédula en summary de close', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/close`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'close-pii-00001')
        .send({
          result: ExecutionOrderResult.EXECUTED,
          summary: 'Instalación para CC 52123456 de Bogotá',
        })
        .expect(400);
    });

    it('permite descripción sin PII', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/field-work`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'fieldwork-safe-00001')
        .send({
          activityType: 'INSTALLATION',
          description: 'Se realizó la instalación del ONT y verificación de potencia óptica',
        })
        .expect(201);
    });
  });

  // ─── Standard Flows ─────────────────────────────────────────────────────

  it('starts and closes an execution order', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
      .set('Authorization', 'Bearer tech-token')
      .set('If-Match', '1')
      .set('Idempotency-Key', 'start-key-00000001')
      .send({ note: 'Salida hacia sitio' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/close`)
      .set('Authorization', 'Bearer tech-token')
      .set('If-Match', '2')
      .set('Idempotency-Key', 'close-key-00000001')
      .send({ result: ExecutionOrderResult.EXECUTED, summary: 'Trabajo completado' })
      .expect(200);
  });

  it('retorna X-Correlation-Id en todas las respuestas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('pasa headers de idempotencia y correlación al servicio', async () => {
    // El servicio mock no rechaza — solo verificamos que el controller
    // envía los headers correctamente. La validación de idempotency-key
    // requerido se prueba en los unit tests de servicio.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/close`)
      .set('Authorization', 'Bearer tech-token')
      .set('If-Match', '1')
      .set('Idempotency-Key', 'close-with-headers-001')
      .set('X-Correlation-Id', '00000000-0000-4000-8000-000000000001')
      .send({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Cierre con headers',
      })
      .expect(200);

    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  // ─── Rate Limiting (TenantAwareThrottlerGuard) ──────────────────────────

  describe('rate limiting tenant-aware', () => {
    const buildRateLimitApp = async (
      redis: SharedRedisRateLimitDouble | { eval: jest.Mock },
    ): Promise<INestApplication> => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ExecutionOrdersController],
        providers: [
          {
            provide: ExecutionOrdersService,
            useFactory: buildExecutionOrdersServiceMock,
          },
          {
            provide: EffectivePermissionsService,
            useValue: {
              getEffectivePermissionsForUser: jest
                .fn()
                .mockResolvedValue([
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
                ]),
            },
          },
          { provide: PermissionsGuard, useValue: { canActivate: () => true } },
          { provide: ExecutionOrderAccessGuard, useValue: { canActivate: () => true } },
          { provide: REDIS_CLIENT, useValue: redis },
          TenantAwareThrottlerGuard,
          JwtAuthGuard,
          RolesGuard,
          ExecutionOrderResponseHeadersInterceptor,
          {
            provide: ExecutionOrderProjectionConvergenceService,
            useValue: { verifyConvergence: jest.fn().mockResolvedValue({ status: 'IN_SYNC' }) },
          },
        ],
      }).compile();

      const app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.use(createVerifiedTenantContextMiddleware());
      await app.init();
      return app;
    };

    it('devuelve 429 en una ráfaga real por actor y tenant', async () => {
      const redis = new SharedRedisRateLimitDouble();
      const app = await buildRateLimitApp(redis);
      try {
        // La prueba aísla el guard: el parser multipart no forma parte de este contrato
        // y 11 requests consecutivos ejercitan el bucket sin presión de sockets.
        const statuses: number[] = [];
        for (let index = 0; index < 11; index += 1) {
          const response = await request(app.getHttpServer())
            .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence-assets`)
            .set('Authorization', 'Bearer tech-token')
            .send({ marker: `evidence-${index}` });
          statuses.push(response.status);
        }

        expect(statuses.filter((status) => status === 429)).toHaveLength(1);
        expect(statuses.filter((status) => status !== 429)).toHaveLength(10);
      } finally {
        await app.close();
      }
    });

    it('mantiene buckets independientes para actor y tenant', async () => {
      const redis = new SharedRedisRateLimitDouble();
      const app = await buildRateLimitApp(redis);
      try {
        const burst = async (token: string): Promise<number[]> => {
          const statuses: number[] = [];
          for (let index = 0; index < 11; index += 1) {
            const response = await request(app.getHttpServer())
              .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence-assets`)
              .set('Authorization', `Bearer ${token}`)
              .send({ marker: `evidence-${index}` });
            statuses.push(response.status);
          }
          return statuses;
        };

        const sameActorTenantA = await burst('tech-token');
        const differentActorSameTenant = await burst('tech-002-token');
        const differentActorTenantB = await burst('contractor-tenantb-token');

        expect(sameActorTenantA.filter((status) => status === 429)).toHaveLength(1);
        expect(differentActorSameTenant.filter((status) => status === 429)).toHaveLength(1);
        expect(differentActorTenantB.filter((status) => status === 429)).toHaveLength(1);
      } finally {
        await app.close();
      }
    });

    it('falla cerrado con 503 si Redis no responde', async () => {
      const redis = { eval: jest.fn().mockRejectedValue(new Error('connection unavailable')) };
      const app = await buildRateLimitApp(redis);

      try {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence-assets`)
          .set('Authorization', 'Bearer tech-token')
          .attach('file', Buffer.from('evidence'), 'evidence.txt')
          .expect(503);

        expect(response.body).toEqual(
          expect.objectContaining({ code: 'RATE_LIMIT_STORE_UNAVAILABLE' }),
        );
      } finally {
        await app.close();
      }
    });

    it('falla cerrado con 503 si Redis excede el timeout', async () => {
      const redis = {
        eval: jest.fn().mockImplementation(() => new Promise<number>(() => undefined)),
      };
      const app = await buildRateLimitApp(redis);

      try {
        await request(app.getHttpServer())
          .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence-assets`)
          .set('Authorization', 'Bearer tech-token')
          .attach('file', Buffer.from('evidence'), 'evidence.txt')
          .expect(503);
      } finally {
        await app.close();
      }
    });

    it('incluye encabezados de rate limit en una lectura permitida', async () => {
      const redis = new SharedRedisRateLimitDouble();
      const app = await buildRateLimitApp(redis);

      try {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
          .set('Authorization', 'Bearer support-token')
          .expect(200);

        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
      } finally {
        await app.close();
      }
    });

    it('declara el rate limit antes de los guards de autorización con acceso a datos', () => {
      const guards = Reflect.getMetadata('__guards__', ExecutionOrdersController) as unknown[];
      const throttlerIndex = guards.indexOf(TenantAwareThrottlerGuard);
      const accessIndex = guards.indexOf(ExecutionOrderAccessGuard);

      expect(throttlerIndex).toBeGreaterThanOrEqual(0);
      expect(accessIndex).toBeGreaterThanOrEqual(0);
      expect(throttlerIndex).toBeLessThan(accessIndex);
    });
  });
});

// ─── Permisos por capacidad (Task 2) ─────────────────────────────────────

describe('ExecutionOrdersController HTTP — permisos por capacidad', () => {
  let app: INestApplication;
  let effectivePermissionsMock: jest.Mock;
  let serviceMock: ReturnType<typeof buildExecutionOrdersServiceMock>;

  const ORDER_UUID = '22222222-2222-4222-8222-222222222222';

  const buildExecutionOrdersServiceMock = () => ({
    assertActorAccess: jest.fn().mockResolvedValue(undefined),
    assertActorCanRedrive: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      executionOrderNumber: 'OTE-20260727-001',
      version: 1,
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      workType: 'INSTALLATION',
      templateId: null,
      templateKey: null,
      templateVersionNumber: null,
      templateLabel: null,
      scheduleEventId: '33333333-3333-4333-8333-333333333333',
      plannedWindowStartAt: '2026-07-27T14:00:00.000Z',
      plannedWindowEndAt: '2026-07-27T16:00:00.000Z',
      assignedTechnicianId: 'tech-001',
      municipality: 'Bogotá',
      sector: 'Centro',
      startedAt: null,
      closedAt: null,
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    }),
    listActivities: jest.fn().mockResolvedValue([]),
    listItemUsage: jest.fn().mockResolvedValue([]),
    start: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.IN_PROGRESS,
      version: 2,
    }),
    registerFieldWork: jest.fn().mockResolvedValue({
      id: 'activity-001',
      activityType: 'INSTALLATION',
      description: 'Trabajo completado',
    }),
    registerItemUsage: jest.fn().mockResolvedValue({
      id: 'usage-001',
      itemId: 'item-001',
      quantity: '1',
    }),
    close: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
      version: 2,
    }),
    assign: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.ASSIGNED,
      version: 2,
    }),
    block: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.BLOCKED,
      version: 2,
    }),
    unblock: jest.fn().mockResolvedValue({
      id: ORDER_UUID,
      status: ExecutionOrderStatus.IN_PROGRESS,
      version: 2,
    }),
    createEvidenceAssetReceipt: jest.fn().mockResolvedValue({
      intentId: 'intent-001',
      mediaAssetId: 'media-001',
      status: 'PENDING_ANALYSIS',
    }),
    getEvidenceAssetReceipt: jest.fn().mockResolvedValue({
      mediaAssetId: 'media-001',
      status: 'PENDING_ANALYSIS',
    }),
    getEvidenceContentRedirect: jest
      .fn()
      .mockResolvedValue('https://minio.example/bucket/obj?X-Amz-Signature=abc123'),
    registerEvidence: jest.fn().mockResolvedValue({
      id: 'evidence-001',
      mediaAssetId: 'media-001',
    }),
    createFollowUp: jest.fn().mockResolvedValue({
      intentId: 'followup-001',
      resourceRef: 'resource-001',
      status: 'ACCEPTED',
    }),
    redriveEvent: jest.fn().mockResolvedValue({
      eventId: 'event-001',
      status: 'QUEUED',
    }),
    getSyncState: jest.fn().mockResolvedValue('IN_SYNC' as const),
    getCompletion: jest.fn().mockResolvedValue({ progress: 0, completed: 0, total: 0 }),
    computeAllowedActions: jest.fn().mockReturnValue(['START', 'REGISTER_ACTIVITY'] as const),
  });

  beforeAll(async () => {
    effectivePermissionsMock = jest.fn();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionOrdersController],
      providers: [
        {
          provide: ExecutionOrdersService,
          useFactory: () => {
            serviceMock = buildExecutionOrdersServiceMock();
            return serviceMock;
          },
        },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: effectivePermissionsMock },
        },
        PermissionsGuard,
        { provide: ExecutionOrderAccessGuard, useValue: { canActivate: () => true } },
        TenantAwareThrottlerGuard,
        { provide: REDIS_CLIENT, useValue: unusedRedisClient },
        JwtAuthGuard,
        RolesGuard,
        ExecutionOrderResponseHeadersInterceptor,
        {
          provide: ExecutionOrderProjectionConvergenceService,
          useValue: { verifyConvergence: jest.fn().mockResolvedValue({ status: 'IN_SYNC' }) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(createVerifiedTenantContextMiddleware());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── CA-00-02: Coordinador sin permiso execute ─────────────────────────

  describe('CA-00-02: Coordinador sin permiso execute', () => {
    beforeEach(() => {
      // NOC con read + supervise, pero SIN execute
      effectivePermissionsMock.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
      ]);
    });

    const executeEndpoints = [
      { path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/start`, body: { note: 'intento' } },
      {
        path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/field-work`,
        body: { activityType: 'TEST', description: 'intento' },
      },
      {
        path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/item-usage`,
        body: {
          itemId: 'item-001',
          quantity: 1,
          action: 'INSTALL',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        },
      },
      {
        path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence`,
        body: {
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          evidenceType: 'PHOTO',
          requirementKey: 'req-1',
          expiresAt: '2026-06-25T14:00:00.000Z',
        },
      },
      {
        path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/block`,
        body: { reasonCode: 'WEATHER' },
      },
      {
        path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/unblock`,
        body: { resolutionCode: 'CLEARED' },
      },
      {
        path: `/api/v1/tasks/execution-orders/${ORDER_UUID}/close`,
        body: { result: ExecutionOrderResult.EXECUTED, summary: 'Cierre de prueba' },
      },
    ];

    executeEndpoints.forEach(({ path, body }) => {
      it(`retorna 403 en POST ${path}`, async () => {
        const req = request(app.getHttpServer())
          .post(path)
          .set('Authorization', 'Bearer coordinator-readonly-token')
          .set('If-Match', '1')
          .set('Idempotency-Key', `coord-readonly-post-${Date.now()}`);

        if (body) req.send(body);

        await req.expect(403);
      });
    });

    it('403 visible no expone permisos, roles ni datos de la OT', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
        .set('Authorization', 'Bearer coordinator-readonly-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'coord-readonly-generic-001')
        .send({ note: 'intento' })
        .expect(403);

      expect(response.body).toEqual({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      });
      expect(JSON.stringify(response.body)).not.toContain('OPERATIONS_EXECUTION_ORDERS_EXECUTE');
      expect(JSON.stringify(response.body)).not.toContain(ORDER_UUID);
    });

    it('el coordinador puede leer la OT con permiso read', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
        .set('Authorization', 'Bearer coordinator-readonly-token')
        .expect(200);
    });

    it('el coordinador puede asignar con permiso supervise', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/assign`)
        .set('Authorization', 'Bearer coordinator-readonly-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'coord-assign-00000001')
        .send({ assigneeType: 'TECHNICIAN', assigneeId: '11111111-1111-4111-8111-111111111111' })
        .expect(200);
    });
  });

  // ─── Técnico con execute pero sin read ─────────────────────────────────

  describe('Técnico con execute pero sin read', () => {
    beforeEach(() => {
      // Solo execute — sin read
      effectivePermissionsMock.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
      ]);
    });

    const readEndpoints = [
      `/api/v1/tasks/execution-orders/${ORDER_UUID}`,
      `/api/v1/tasks/execution-orders/${ORDER_UUID}/activities`,
      `/api/v1/tasks/execution-orders/${ORDER_UUID}/item-usage`,
      `/api/v1/tasks/execution-orders/${ORDER_UUID}/evidences`,
      `/api/v1/tasks/execution-orders/${ORDER_UUID}/evidence-assets/media-001`,
    ];

    readEndpoints.forEach((path) => {
      it(`retorna 403 en GET ${path}`, async () => {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', 'Bearer tech-token')
          .expect(403);
      });
    });

    it('el técnico puede ejecutar start con permiso execute', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'tech-exec-start-00001')
        .send({ note: 'Técnico con execute' })
        .expect(200);
    });
  });

  // ─── Supervisión: solo NOC/ADMIN/SUPPORT ──────────────────────────────

  describe('Técnico sin permiso supervise', () => {
    beforeEach(() => {
      effectivePermissionsMock.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
      ]);
    });

    it('retorna 403 en assign', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/assign`)
        .set('Authorization', 'Bearer tech-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'tech-assign-00000001')
        .send({ assigneeType: 'TECHNICIAN', assigneeId: '22222222-2222-4222-8222-222222222222' })
        .expect(403);
    });

    it('retorna 403 en createFollowUp', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/follow-ups`)
        .set('Authorization', 'Bearer tech-token')
        .set('Idempotency-Key', 'tech-followup-00001')
        .send({ reasonCode: 'REVISIT' })
        .expect(403);
    });
  });

  // ─── Redrive: solo ADMIN/NOC con permiso dedicado ──────────────────────

  describe('events.redrive', () => {
    const EVENT_UUID = '44444444-4444-4444-8444-444444444444';

    it('usuario sin permiso events.redrive recibe 403', async () => {
      effectivePermissionsMock.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/events/${EVENT_UUID}/redrive`)
        .set('Authorization', 'Bearer support-token')
        .expect(403);
    });

    it('usuario con permiso events.redrive recibe 202', async () => {
      effectivePermissionsMock.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_EVENTS_REDRIVE,
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/events/${EVENT_UUID}/redrive`)
        .set('Authorization', 'Bearer coordinator-token')
        .set('Idempotency-Key', 'redrive-req-001')
        .set('X-Correlation-Id', '55555555-5555-4555-8555-555555555555')
        .send({ causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' })
        .expect(202);

      expect(serviceMock.redriveEvent).toHaveBeenCalledWith(
        EVENT_UUID,
        { causeCode: 'DELIVERY_TIMEOUT', ticketId: 'ticket-001' },
        expect.objectContaining({ tenantId: 'tenant-001' }),
        expect.objectContaining({
          idempotencyKey: 'redrive-req-001',
          requireIdempotency: true,
          requireIfMatch: false,
          correlationId: '55555555-5555-4555-8555-555555555555',
        }),
      );
    });

    it('supervisor con permiso supervise crea seguimiento y propaga la clave idempotente', async () => {
      effectivePermissionsMock.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/follow-ups`)
        .set('Authorization', 'Bearer coordinator-token')
        .set('Idempotency-Key', 'follow-up-http-0001')
        .set('X-Correlation-Id', '77777777-7777-4777-8777-777777777777')
        .send({ reasonCode: 'REVISIT_REQUIRED' })
        .expect(201);

      expect(serviceMock.createFollowUp).toHaveBeenCalledWith(
        ORDER_UUID,
        { reasonCode: 'REVISIT_REQUIRED' },
        expect.objectContaining({ tenantId: 'tenant-001' }),
        expect.objectContaining({
          idempotencyKey: 'follow-up-http-0001',
          requireIdempotency: true,
          requireIfMatch: false,
          correlationId: '77777777-7777-4777-8777-777777777777',
        }),
      );
    });
  });

  // ─── ABAC: Contratista no asignado no puede ejecutar ───────────────────

  describe('ABAC: Contratista no asignado', () => {
    let appWithAbac: INestApplication;
    let serviceMock: ReturnType<typeof buildExecutionOrdersServiceMock>;

    beforeAll(async () => {
      serviceMock = buildExecutionOrdersServiceMock();
      // assertActorAccess lanza 404 uniforme para contratista fuera de alcance
      serviceMock.assertActorAccess.mockRejectedValue(
        new NotFoundException('OT de ejecución no encontrada'),
      );

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ExecutionOrdersController],
        providers: [
          { provide: ExecutionOrdersService, useValue: serviceMock },
          {
            provide: EffectivePermissionsService,
            useValue: {
              getEffectivePermissionsForUser: jest
                .fn()
                .mockResolvedValue([
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
                ]),
            },
          },
          PermissionsGuard,
          // ABAC en acción: ExecutionOrderAccessGuard es real con el mock service
          ExecutionOrderAccessGuard,
          TenantAwareThrottlerGuard,
          { provide: REDIS_CLIENT, useValue: unusedRedisClient },
          JwtAuthGuard,
          RolesGuard,
          ExecutionOrderResponseHeadersInterceptor,
          {
            provide: ExecutionOrderProjectionConvergenceService,
            useValue: { verifyConvergence: jest.fn().mockResolvedValue({ status: 'IN_SYNC' }) },
          },
        ],
      }).compile();

      appWithAbac = moduleRef.createNestApplication();
      appWithAbac.setGlobalPrefix('api/v1');
      appWithAbac.use(createVerifiedTenantContextMiddleware());
      await appWithAbac.init();
    });

    afterAll(async () => {
      await appWithAbac.close();
    });

    it('contratista sin asignación recibe 404 en start a pesar de tener execute', async () => {
      await request(appWithAbac.getHttpServer())
        .post(`/api/v1/tasks/execution-orders/${ORDER_UUID}/start`)
        .set('Authorization', 'Bearer contractor-token')
        .set('If-Match', '1')
        .set('Idempotency-Key', 'contractor-start-00001')
        .send({ note: 'Contratista sin asignación' })
        .expect(404);
    });

    it('contratista sin asignación recibe 404 en GET', async () => {
      await request(appWithAbac.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
        .set('Authorization', 'Bearer contractor-token')
        .expect(404);
    });
  });

  // ─── Multi-tenant Isolation ────────────────────────────────────────────

  describe('aislamiento multi-tenant', () => {
    let appWithTenantIsolation: INestApplication;

    beforeAll(async () => {
      const serviceMock = buildExecutionOrdersServiceMock();
      // assertActorAccess lanza NotFoundException para cross-tenant: el
      // usuario de tenant-002 no debería ver recursos de tenant-001.
      serviceMock.assertActorAccess.mockRejectedValue(
        new NotFoundException('Recurso no encontrado en este tenant.'),
      );

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ExecutionOrdersController],
        providers: [
          { provide: ExecutionOrdersService, useValue: serviceMock },
          {
            provide: EffectivePermissionsService,
            useValue: {
              getEffectivePermissionsForUser: jest
                .fn()
                .mockResolvedValue([
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
                  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
                ]),
            },
          },
          PermissionsGuard,
          ExecutionOrderAccessGuard,
          TenantAwareThrottlerGuard,
          { provide: REDIS_CLIENT, useValue: unusedRedisClient },
          JwtAuthGuard,
          RolesGuard,
          ExecutionOrderResponseHeadersInterceptor,
          {
            provide: ExecutionOrderProjectionConvergenceService,
            useValue: { verifyConvergence: jest.fn().mockResolvedValue({ status: 'IN_SYNC' }) },
          },
        ],
      }).compile();

      appWithTenantIsolation = moduleRef.createNestApplication();
      appWithTenantIsolation.setGlobalPrefix('api/v1');
      appWithTenantIsolation.use(createVerifiedTenantContextMiddleware());
      await appWithTenantIsolation.init();
    });

    afterAll(async () => {
      await appWithTenantIsolation.close();
    });

    it('usuario Tenant B con permisos correctos recibe 404 para recurso de Tenant A', async () => {
      // El usuario es de tenant-002 (Tenant B), el ORDER_UUID apunta a
      // tenant-001 en el mock. El tenantId en el JWT no coincide con
      // el recurso, y el sistema debe devolver 404 (no 403) para no
      // filtrar existencia de recursos cross-tenant.
      await request(appWithTenantIsolation.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}`)
        .set('Authorization', 'Bearer contractor-tenantb-token')
        .expect(404);
    });

    it('usuario Tenant B no puede listar evidencias de una OT de Tenant A', async () => {
      await request(appWithTenantIsolation.getHttpServer())
        .get(`/api/v1/tasks/execution-orders/${ORDER_UUID}/evidences?limit=100`)
        .set('Authorization', 'Bearer contractor-tenantb-token')
        .expect(404);
    });
  });
});

// ─── Health relay: fail-closed ABAC con metadata tenant-scoped ────────────

describe('ExecutionOrdersController HTTP — health/relay (fail-closed)', () => {
  let app: INestApplication;

  const buildServiceMock = () => ({
    assertActorAccess: jest.fn().mockResolvedValue(undefined),
    assertActorCanRedrive: jest.fn().mockResolvedValue(undefined),
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionOrdersController],
      providers: [
        {
          provide: ExecutionOrdersService,
          useFactory: buildServiceMock,
        },
        {
          provide: EffectivePermissionsService,
          useValue: {
            getEffectivePermissionsForUser: jest
              .fn()
              .mockResolvedValue([AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ]),
          },
        },
        PermissionsGuard,
        // Guard ABAC real: la ruta sin recurso solo pasa por la metadata
        // @ExecutionOrderTenantScoped(); rol y permiso los validan RolesGuard
        // y PermissionsGuard antes.
        ExecutionOrderAccessGuard,
        TenantAwareThrottlerGuard,
        { provide: REDIS_CLIENT, useValue: unusedRedisClient },
        JwtAuthGuard,
        RolesGuard,
        ExecutionOrderResponseHeadersInterceptor,
        {
          provide: ExecutionOrderProjectionConvergenceService,
          useValue: {
            getRelayHealth: jest.fn().mockResolvedValue({
              status: 'HEALTHY',
              pendingCount: 0,
              oldestAgeSeconds: null,
              lastScanAt: '2026-07-27T10:00:00.000Z',
              relayActive: true,
            }),
            verifyConvergence: jest.fn().mockResolvedValue({ status: 'IN_SYNC' }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(createVerifiedTenantContextMiddleware());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve 200 para NOC con permiso read (metadata tenant-scoped)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tasks/execution-orders/health/relay')
      .set('Authorization', 'Bearer coordinator-token')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ status: 'HEALTHY', relayActive: true }),
    );
  });

  it('no consulta un recurso de OT en la ruta tenant-scoped', async () => {
    const service = app.get(ExecutionOrdersService) as {
      assertActorAccess: jest.Mock;
      assertActorCanRedrive: jest.Mock;
    };

    await request(app.getHttpServer())
      .get('/api/v1/tasks/execution-orders/health/relay')
      .set('Authorization', 'Bearer coordinator-token')
      .expect(200);

    expect(service.assertActorAccess).not.toHaveBeenCalled();
    expect(service.assertActorCanRedrive).not.toHaveBeenCalled();
  });

  it('retorna 401 sin token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/tasks/execution-orders/health/relay')
      .expect(401);
  });
});
