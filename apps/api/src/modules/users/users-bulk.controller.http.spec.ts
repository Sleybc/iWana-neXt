/**
 * Ola E de MOD04 — superficie HTTP del alta masiva asincrona.
 *
 * Tres rutas: `POST /users/bulk` (202 + jobId), `GET /users/bulk/jobs/:jobId` y
 * `POST /users/bulk/jobs/:jobId/result` (reclamo one-time de credenciales).
 *
 * Lo que se fija aqui es el contrato del borde: codigos de estado, la exigencia
 * del header `Idempotency-Key`, la autorizacion (rol + permiso `USERS_MANAGE`) y
 * el rechazo del rol de plataforma por el camino Zod, distinto del DTO de
 * class-validator del CRUD sincrono.
 *
 * SEGURIDAD: sin PII real; las contrasenas de fixture son sinteticas.
 */

import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PlatformRole, AccessPermissionKey, UserRole } from '@iwana/shared';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersBulkController } from './users-bulk.controller';
import { UsersService } from './users.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer admin-token') {
        req.user = {
          sub: 'usr-admin',
          email: 'hash-admin',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer restricted-admin-token') {
        req.user = {
          sub: 'usr-admin-restricted',
          email: 'hash-admin-restricted',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin-restricted',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer technician-token') {
        req.user = {
          sub: 'usr-tecnico',
          email: 'hash-tecnico',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-tecnico',
          type: 'tenant',
        };
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const user = context.switchToHttp().getRequest().user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) return true;
      return Boolean(user) && requiredRoles.includes(user!.role);
    }
  },
}));

const RUTA_BULK = '/api/v1/users/bulk';
const JOB_ID = 'users-bulk-tenant-test-lote-001';

describe('UsersBulkController HTTP', () => {
  let app: INestApplication;

  const usersServiceMock = {
    bulkCreate: jest.fn(),
    getBulkJobStatus: jest.fn(),
    claimBulkJobResult: jest.fn(),
  };

  const effectivePermissionsServiceMock = {
    getEffectivePermissionsForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersBulkController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsServiceMock },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    effectivePermissionsServiceMock.getEffectivePermissionsForUser.mockImplementation(
      async (userId: string) =>
        userId === 'usr-admin-restricted'
          ? []
          : [AccessPermissionKey.USERS_MANAGE, AccessPermissionKey.USERS_READ],
    );
  });

  const loteValido = {
    users: [{ email: 'tecnico.uno@empresa-demo.test', role: UserRole.TECHNICIAN }],
  };

  describe('POST /users/bulk', () => {
    it('acepta el lote con 202 y devuelve el jobId, no los usuarios', async () => {
      usersServiceMock.bulkCreate.mockResolvedValue({ jobId: JOB_ID, status: 'queued' });

      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer admin-token')
        .set('Idempotency-Key', 'lote-001')
        .send(loteValido)
        .expect(202)
        .expect(({ body }) => {
          expect(body).toEqual({ jobId: JOB_ID, status: 'queued' });
        });

      expect(usersServiceMock.bulkCreate).toHaveBeenCalledWith(
        loteValido.users,
        'usr-admin',
        'unknown',
        'lote-001',
      );
    });

    it('INVARIANTE: sin Idempotency-Key la peticion es 400 y no llega al servicio', async () => {
      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer admin-token')
        .send(loteValido)
        .expect(400);

      expect(usersServiceMock.bulkCreate).not.toHaveBeenCalled();
    });

    it('INVARIANTE: un Idempotency-Key en blanco tampoco vale', async () => {
      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer admin-token')
        .set('Idempotency-Key', '   ')
        .send(loteValido)
        .expect(400);

      expect(usersServiceMock.bulkCreate).not.toHaveBeenCalled();
    });

    it.each([PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT])(
      'INVARIANTE: un lote con el rol de plataforma %s es 400 y no se encola',
      async (role) => {
        await request(app.getHttpServer())
          .post(RUTA_BULK)
          .set('Authorization', 'Bearer admin-token')
          .set('Idempotency-Key', 'lote-001')
          .send({ users: [{ email: 'infiltrado@empresa-demo.test', role }] })
          .expect(400);

        expect(usersServiceMock.bulkCreate).not.toHaveBeenCalled();
      },
    );

    it('un lote de mas de 100 filas es 400', async () => {
      const users = Array.from({ length: 101 }, (_, i) => ({
        email: `tecnico.${i}@empresa-demo.test`,
        role: UserRole.TECHNICIAN,
      }));

      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer admin-token')
        .set('Idempotency-Key', 'lote-001')
        .send({ users })
        .expect(400);

      expect(usersServiceMock.bulkCreate).not.toHaveBeenCalled();
    });

    it('INVARIANTE: un rol de tenant sin USERS_MANAGE no puede encolar altas', async () => {
      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer restricted-admin-token')
        .set('Idempotency-Key', 'lote-001')
        .send(loteValido)
        .expect(403);

      expect(usersServiceMock.bulkCreate).not.toHaveBeenCalled();
    });

    it('INVARIANTE: un TECHNICIAN no alcanza la ruta bulk', async () => {
      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer technician-token')
        .set('Idempotency-Key', 'lote-001')
        .send(loteValido)
        .expect(403);

      expect(usersServiceMock.bulkCreate).not.toHaveBeenCalled();
    });

    it('sin token es 401', async () => {
      await request(app.getHttpServer()).post(RUTA_BULK).send(loteValido).expect(401);
    });

    it('propaga la IP del proxy al servicio para la auditoria', async () => {
      usersServiceMock.bulkCreate.mockResolvedValue({ jobId: JOB_ID, status: 'queued' });

      await request(app.getHttpServer())
        .post(RUTA_BULK)
        .set('Authorization', 'Bearer admin-token')
        .set('Idempotency-Key', 'lote-001')
        .set('X-Forwarded-For', '203.0.113.7')
        .send(loteValido)
        .expect(202);

      expect(usersServiceMock.bulkCreate).toHaveBeenCalledWith(
        loteValido.users,
        'usr-admin',
        '203.0.113.7',
        'lote-001',
      );
    });
  });

  describe('GET /users/bulk/jobs/:jobId', () => {
    it('devuelve 200 con el estado del job', async () => {
      usersServiceMock.getBulkJobStatus.mockResolvedValue({
        jobId: JOB_ID,
        status: 'completed',
        summary: { total: 2, succeeded: 2, failed: 0 },
        failed: [],
        credentialsClaimed: false,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/users/bulk/jobs/${JOB_ID}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe('completed');
          expect(JSON.stringify(body)).not.toContain('temporaryPassword');
        });
    });

    it('un job de otro tenant se resuelve como 404', async () => {
      usersServiceMock.getBulkJobStatus.mockRejectedValue(
        new NotFoundException('Importación no encontrada.'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/users/bulk/jobs/job-ajeno')
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('INVARIANTE: consultar el estado exige USERS_MANAGE', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/users/bulk/jobs/${JOB_ID}`)
        .set('Authorization', 'Bearer restricted-admin-token')
        .expect(403);

      expect(usersServiceMock.getBulkJobStatus).not.toHaveBeenCalled();
    });
  });

  describe('POST /users/bulk/jobs/:jobId/result', () => {
    it('devuelve 200 con las credenciales en el primer reclamo', async () => {
      usersServiceMock.claimBulkJobResult.mockResolvedValue({
        jobId: JOB_ID,
        status: 'completed',
        summary: { total: 1, succeeded: 1, failed: 0 },
        succeeded: [
          {
            email: 'tecnico.uno@empresa-demo.test',
            firstName: null,
            lastName: null,
            role: UserRole.TECHNICIAN,
            temporaryPassword: 'clave-sintetica-de-prueba',
            createdAt: '2026-07-22T10:00:00.000Z',
          },
        ],
        failed: [],
        credentialsClaimed: true,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/users/bulk/jobs/${JOB_ID}/result`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.credentialsClaimed).toBe(true);
          expect(body.succeeded[0].temporaryPassword).toBe('clave-sintetica-de-prueba');
        });

      expect(usersServiceMock.claimBulkJobResult).toHaveBeenCalledWith(JOB_ID);
    });

    it('INVARIANTE: el segundo reclamo sigue siendo 200 pero sin contrasenas', async () => {
      usersServiceMock.claimBulkJobResult.mockResolvedValue({
        jobId: JOB_ID,
        status: 'completed',
        summary: { total: 1, succeeded: 1, failed: 0 },
        succeeded: [
          {
            email: 'tecnico.uno@empresa-demo.test',
            firstName: null,
            lastName: null,
            role: UserRole.TECHNICIAN,
            createdAt: '2026-07-22T10:00:00.000Z',
          },
        ],
        failed: [],
        credentialsClaimed: true,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/users/bulk/jobs/${JOB_ID}/result`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(JSON.stringify(body)).not.toContain('temporaryPassword');
        });
    });

    it('reclamar un job que aun no termino es 400', async () => {
      usersServiceMock.claimBulkJobResult.mockRejectedValue(
        new BadRequestException('La importación aún no ha terminado.'),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/users/bulk/jobs/${JOB_ID}/result`)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);
    });

    it('INVARIANTE: reclamar credenciales exige USERS_MANAGE', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/users/bulk/jobs/${JOB_ID}/result`)
        .set('Authorization', 'Bearer restricted-admin-token')
        .expect(403);

      expect(usersServiceMock.claimBulkJobResult).not.toHaveBeenCalled();
    });

    it('INVARIANTE: un TECHNICIAN no puede reclamar credenciales de un lote', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/users/bulk/jobs/${JOB_ID}/result`)
        .set('Authorization', 'Bearer technician-token')
        .expect(403);

      expect(usersServiceMock.claimBulkJobResult).not.toHaveBeenCalled();
    });
  });
});
