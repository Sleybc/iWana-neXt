import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuditService } from '../../audit/audit.service';
import { PurposesController } from './purposes.controller';
import { PurposesService } from './purposes.service';

describe('PUT /privacy/purposes — autorización HTTP', () => {
  let app: INestApplication;
  let service: PurposesService;
  const effectivePermissions = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    service = new PurposesService({} as never, { logWithin: jest.fn() } as unknown as AuditService);
    const moduleRef = await Test.createTestingModule({
      controllers: [PurposesController],
      providers: [
        { provide: PurposesService, useValue: service },
        { provide: EffectivePermissionsService, useValue: effectivePermissions },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: '76000000-0000-4000-8000-000000000002',
            type: 'tenant',
            role: 'AUDITOR',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /privacy/purposes devuelve la configuración desde la lectura del servicio', async () => {
    jest.spyOn(service, 'list').mockResolvedValue([
      { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
      { purpose: 'CONTACTO_COMERCIAL', enabled: false },
    ]);

    await request(app.getHttpServer())
      .get('/privacy/purposes')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([
          { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
          { purpose: 'CONTACTO_COMERCIAL', enabled: false },
        ]);
      });
  });

  it('deniega sin privacy.manage y responde 422 al intentar desactivar la finalidad requerida', async () => {
    effectivePermissions.getEffectivePermissionsForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['privacy.manage']);
    const payload = { items: [{ purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: false }] };

    await request(app.getHttpServer()).put('/privacy/purposes').send(payload).expect(403);
    await request(app.getHttpServer())
      .put('/privacy/purposes')
      .send(payload)
      .expect(422)
      .expect(({ body }) => {
        expect(body.code).toBe('PRIVACY_PURPOSE_REQUIRED');
      });
  });
});
