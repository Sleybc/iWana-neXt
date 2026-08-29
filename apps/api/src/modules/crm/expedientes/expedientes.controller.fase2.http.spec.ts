import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { ExpedientesController } from './expedientes.controller';
import { ExpedienteService } from './expediente.service';
import { StatusTransitionService } from './status-transition.service';
import { CompletenessCalculator } from './completeness-calculator.service';
import { PipelineRecommendationService } from './pipeline-recommendation.service';
import { ExpedienteDetailBootstrapService } from './expediente-detail-bootstrap.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: any): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const h = req.headers.authorization;
      const map: Record<string, any> = {
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
        'Bearer sales-token': {
          sub: 'sales-001',
          role: UserRole.SALES,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
      };
      if (h && map[h]) {
        req.user = map[h];
        return true;
      }
      throw new UnauthorizedException('Token inválido');
    }
  },
}));
jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: any): boolean {
      const req = context.switchToHttp().getRequest();
      const user: any = req.user;
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length === 0) return true;
      if (!user || !required.includes(user.role)) throw new ForbiddenException('No tiene permisos');
      return true;
    }
  },
}));

describe('ExpedientesController Fase2', () => {
  let app: INestApplication;
  const permsMock = { getEffectivePermissionsForUser: jest.fn() };
  const expedienteServiceMock = {
    findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    create: jest.fn().mockResolvedValue({ id: '1' }),
    findById: jest.fn().mockResolvedValue({ id: '1' }),
  };
  const statusMock = { validateTransition: jest.fn().mockResolvedValue({ valid: true }) };
  const completenessMock = {
    calculate: jest
      .fn()
      .mockResolvedValue({
        sectionCompleteness: {},
        installationReadiness: {},
        missingRequirements: [],
      }),
  };
  const pipelineMock = { getRecommendation: jest.fn().mockResolvedValue(null) };
  const bootstrapMock = { getDetailBootstrap: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExpedientesController],
      providers: [
        { provide: ExpedienteService, useValue: expedienteServiceMock },
        { provide: StatusTransitionService, useValue: statusMock },
        { provide: CompletenessCalculator, useValue: completenessMock },
        { provide: PipelineRecommendationService, useValue: pipelineMock },
        { provide: ExpedienteDetailBootstrapService, useValue: bootstrapMock },
        { provide: EffectivePermissionsService, useValue: permsMock },
        Reflector,
        PermissionsGuard,
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
    permsMock.getEffectivePermissionsForUser.mockReset();
  });

  it('GET lista — AUDITOR con permiso 200', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_EXPEDIENTES_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/expedientes')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });
  it('GET lista — AUDITOR sin permiso 403', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/expedientes')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });
  it('POST — sin permiso 403 aunque rol pase', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/expedientes')
      .set('Authorization', 'Bearer sales-token')
      .send({ name: 'Test', channel: 'WEB' })
      .expect(403);
  });
});
