import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@iwana/shared';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { NetworkCatalogController } from '../network-catalog.controller';
import { NetworkCatalogService } from '../network-catalog.service';
import { NetworkInterfaceCatalogService } from '../network-interface-catalog.service';
import { NetworkTenantGuard } from '../guards/network-tenant.guard';

const ACTOR_ID = '8d217ab7-2b9e-4542-86db-9d972b76bc1a';

describe('NetworkCatalogController — roles HTTP', () => {
  let app: INestApplication;
  let actorRole = UserRole.NOC;
  const createRouter = jest.fn();
  const listRouters = jest.fn();
  const listIpv4Networks = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NetworkCatalogController],
      providers: [
        {
          provide: NetworkCatalogService,
          useValue: { createRouter, listRouters, listIpv4Networks },
        },
        { provide: NetworkInterfaceCatalogService, useValue: {} },
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
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    actorRole = UserRole.NOC;
    createRouter.mockResolvedValue({ id: 'router-id' });
    listRouters.mockResolvedValue({ data: [], meta: { total: 0 } });
    listIpv4Networks.mockResolvedValue({ data: [], meta: { total: 0 } });
  });

  it('delega la acción del catálogo al servicio para la autorización efectiva', async () => {
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

  it('valida y transforma interfaceId, q y paginación antes de delegar el filtro', async () => {
    await request(app.getHttpServer())
      .get('/network/ipv4-networks')
      .query({
        interfaceId: '99999999-9999-4999-8999-999999999999',
        q: 'bridge',
        page: '2',
        limit: '50',
      })
      .expect(200);

    expect(listIpv4Networks).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceId: '99999999-9999-4999-8999-999999999999',
        q: 'bridge',
        page: 2,
        limit: 50,
      }),
      ACTOR_ID,
    );
  });

  it('rechaza interfaceId inválido antes de consultar el catálogo', async () => {
    await request(app.getHttpServer())
      .get('/network/ipv4-networks')
      .query({ interfaceId: 'invalid' })
      .expect(400);

    expect(listIpv4Networks).not.toHaveBeenCalled();
  });

  it('rechaza routerId en el listado de routers porque el filtro pertenece a redes IPv4', async () => {
    await request(app.getHttpServer())
      .get('/network/routers')
      .query({ routerId: '99999999-9999-4999-8999-999999999999' })
      .expect(400);

    expect(listRouters).not.toHaveBeenCalled();
  });
});
