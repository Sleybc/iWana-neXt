import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskType,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { TasksController } from '../tasks.controller';
import { TaskAssignmentService } from '../services/task-assignment.service';
import { TaskTimelineService } from '../services/task-timeline.service';
import { TasksService } from '../services/tasks.service';

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

describe('TasksController HTTP', () => {
  let app: INestApplication;

  const tasksServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    transitionStatus: jest.fn(),
    linkScheduleEvent: jest.fn(),
    linkWorkOrder: jest.fn(),
  };

  const taskAssignmentServiceMock = {
    assign: jest.fn(),
  };

  const timelineServiceMock = {
    listTimeline: jest.fn(),
    listAssignmentHistory: jest.fn(),
  };

  const TASK_UUID = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: TaskAssignmentService, useValue: taskAssignmentServiceMock },
        { provide: TaskTimelineService, useValue: timelineServiceMock },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

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

  it('returns 401 when listing tasks without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/tasks').expect(401);
  });

  it('creates and lists operational tasks for SUPPORT', async () => {
    tasksServiceMock.create.mockResolvedValue({
      id: TASK_UUID,
      title: 'Validar cambio de router',
      status: TaskStatus.OPEN,
    });
    tasksServiceMock.list.mockResolvedValue({
      data: [{ id: TASK_UUID, title: 'Validar cambio de router' }],
      total: 1,
      page: 1,
      limit: 1,
    });

    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: TaskType.INTERNAL_OPERATION,
        priority: TaskPriority.NORMAL,
        title: 'Validar cambio de router',
        originContext: TaskOriginContext.MANUAL,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'user-123',
        recipientType: TaskRecipientType.INTERNAL_AREA,
        recipientRefId: 'noc-area',
        recipientLabel: 'NOC',
        executionMode: TaskExecutionMode.IMMEDIATE,
        scheduledRequired: false,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Validar cambio de router' })]),
    );
  });

  it('returns 403 when TECHNICIAN tries to create a task', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer tech-token')
      .send({
        type: TaskType.INTERNAL_OPERATION,
        priority: TaskPriority.NORMAL,
        title: 'Tarea no permitida',
        originContext: TaskOriginContext.MANUAL,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'tech-001',
        recipientType: TaskRecipientType.INTERNAL_AREA,
        recipientRefId: 'noc-area',
        recipientLabel: 'NOC',
        executionMode: TaskExecutionMode.IMMEDIATE,
        scheduledRequired: false,
      })
      .expect(403);
  });

  it('assigns task for SUPPORT', async () => {
    taskAssignmentServiceMock.assign.mockResolvedValue({
      id: TASK_UUID,
      responsibleRefId: 'user-999',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${TASK_UUID}/assign`)
      .set('Authorization', 'Bearer support-token')
      .send({
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'user-999',
        reason: 'Redistribucion',
      })
      .expect(201);
  });

  it('returns 400 when due date mode is sent without dueAt', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: TaskType.INTERNAL_OPERATION,
        priority: TaskPriority.NORMAL,
        title: 'Tarea con fecha faltante',
        originContext: TaskOriginContext.MANUAL,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'user-123',
        recipientType: TaskRecipientType.INTERNAL_AREA,
        recipientRefId: 'noc-area',
        recipientLabel: 'NOC',
        executionMode: TaskExecutionMode.DUE_DATE,
        scheduledRequired: false,
      })
      .expect(400);
  });

  it('returns 403 when CONTRACTOR tries to transition a task', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${TASK_UUID}/transition`)
      .set('Authorization', 'Bearer contractor-token')
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(403);
  });
});
