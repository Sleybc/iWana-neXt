import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { LegalTextsController } from './legal-texts.controller';
import { LegalTextsService } from './legal-texts.service';

describe('Permisos de textos legales por HTTP', () => {
  let app: INestApplication;
  const service = {
    getCurrent: jest
      .fn()
      .mockResolvedValue({
        id: '76000000-0000-4000-8000-000000000001',
        type: 'AUTORIZACION',
        version: '1',
        sha256: 'a'.repeat(64),
        content: 'Texto sintético',
        format: 'PLAIN',
        publishedAt: '2026-10-14T15:00:00.000Z',
        url: null,
        isCurrent: true,
      }),
    list: jest.fn(),
    create: jest.fn(),
  };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LegalTextsController],
      providers: [
        { provide: LegalTextsService, useValue: service },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = {
            sub: '76000000-0000-4000-8000-000000000002',
            type: 'tenant',
            role: 'COMMERCIAL',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  it('permite la versión vigente y deniega listado y publicación sin accesos de privacidad', async () => {
    await request(app.getHttpServer())
      .get('/privacy/legal-texts/current?type=AUTORIZACION')
      .expect(200);
    await request(app.getHttpServer()).get('/privacy/legal-texts').expect(403);
    await request(app.getHttpServer())
      .post('/privacy/legal-texts')
      .send({ type: 'AUTORIZACION', version: '2', content: 'Texto' })
      .expect(403);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
});
