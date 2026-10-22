import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { NetworkCatalogController } from '../network-catalog.controller';
import { NetworkCatalogService } from '../network-catalog.service';
import { NetworkTenantGuard } from '../guards/network-tenant.guard';

const ACTOR_ID = '8d217ab7-2b9e-4542-86db-9d972b76bc1a';

describe('NetworkCatalogController — permisos HTTP', () => {
  let app: INestApplication;
  let actorRole = UserRole.NOC;
  const createRouter = jest.fn();
  const getEffectivePermissionsForUser = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NetworkCatalogController],
      providers: [
        { provide: NetworkCatalogService, useValue: { createRouter } },
        { provide: EffectivePermissionsService, useValue: { getEffectivePermissionsForUser } },
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
        }) => {
          context.switchToHttp().getRequest().user = {
            sub: ACTOR_ID,
            role: actorRole,
            type: 'tenant',
            tenantId: 'c0c7b87c-87db-4bbd-8ba6-bb4a1aa92762',
            schemaName: 'tenant_network_http_test',
          } as JwtPayload;
          return true;
        },
      })
      .overrideGuard(NetworkTenantGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
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
    actorRole = UserRole.NOC;
    getEffectivePermissionsForUser.mockResolvedValue([]);
    createRouter.mockResolvedValue({ id: 'router-id' });
  });

  it('devuelve 403 y no crea el router si falta network.catalog.manage', async () => {
    await request(app.getHttpServer())
      .post('/network/routers')
      .send({
        name: 'Router HTTP',
        managementHost: 'router.example.invalid',
        supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
      })
      .expect(403);

    expect(createRouter).not.toHaveBeenCalled();
  });

  it('permite crear cuando el permiso está asignado', async () => {
    getEffectivePermissionsForUser.mockResolvedValue([AccessPermissionKey.NETWORK_CATALOG_MANAGE]);

    await request(app.getHttpServer())
      .post('/network/routers')
      .send({
        name: 'Router HTTP',
        managementHost: 'router.example.invalid',
        supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
      })
      .expect(201);

    expect(createRouter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Router HTTP' }),
      ACTOR_ID,
    );
  });

  it('deniega a TECHNICIAN aunque el permiso esté presente', async () => {
    actorRole = UserRole.TECHNICIAN;
    getEffectivePermissionsForUser.mockResolvedValue([AccessPermissionKey.NETWORK_CATALOG_MANAGE]);

    await request(app.getHttpServer())
      .post('/network/routers')
      .send({
        name: 'Router HTTP',
        managementHost: 'router.example.invalid',
        supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
      })
      .expect(403);

    expect(createRouter).not.toHaveBeenCalled();
  });
});
