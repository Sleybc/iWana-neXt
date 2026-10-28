import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantAwareThrottlerGuard } from '../tasks/guards/tenant-aware-throttler.guard';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { NetworkProvisioningController } from './network-provisioning.controller';
import { ServiceProvisioningService } from './service-provisioning.service';

describe('NetworkProvisioningController — ficha reducida del técnico (HTTP)', () => {
  let app: INestApplication;
  const technicianView = {
    executionOrderId: '11111111-1111-4111-8111-111111111111',
    status: 'RESERVED',
    ip: '192.0.2.8',
    certified: false,
    updatedAt: '2026-10-22T12:00:00.000Z',
  };
  const getOrderContext = jest.fn().mockResolvedValue(technicianView);
  const reserve = jest.fn();
  const getProvisioningMeta = jest.fn().mockResolvedValue({ reservationsPaused: false });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NetworkProvisioningController],
      providers: [
        {
          provide: ServiceProvisioningService,
          useValue: {
            getOrderContext,
            getProvisioningMeta,
            reserve,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (_context: ExecutionContext) => true })
      .overrideGuard(NetworkTenantGuard)
      .useValue({ canActivate: (_context: ExecutionContext) => true })
      .overrideGuard(TenantAwareThrottlerGuard)
      .useValue({ canActivate: (_context: ExecutionContext) => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: (_context: ExecutionContext) => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns exactly the five fields allowed to the assigned technician', async () => {
    const response = await request(app.getHttpServer()).get(
      '/network/provisioning/orders/11111111-1111-4111-8111-111111111111/context',
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'certified',
      'executionOrderId',
      'ip',
      'status',
      'updatedAt',
    ]);
    expect(response.body).toEqual(technicianView);
  });

  it('returns 409 RESERVATIONS_PAUSED when full context replay is paused', async () => {
    getOrderContext.mockRejectedValueOnce(
      new ConflictException({
        code: 'RESERVATIONS_PAUSED',
        message: 'La pausa temporal de aprovisionamiento impide crear o reemitir asignaciones.',
      }),
    );

    const response = await request(app.getHttpServer()).get(
      '/network/provisioning/orders/11111111-1111-4111-8111-111111111111/context',
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'RESERVATIONS_PAUSED' });
  });

  it('returns only the authorized tenant-wide pause metadata', async () => {
    const response = await request(app.getHttpServer()).get('/network/provisioning/meta');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reservationsPaused: false });
    expect(Object.keys(response.body)).toEqual(['reservationsPaused']);
    expect(getProvisioningMeta).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when tenant-wide provisioning read permission is absent', async () => {
    getProvisioningMeta.mockRejectedValueOnce(
      new ForbiddenException({ code: 'FORBIDDEN', message: 'No tienes autorización.' }),
    );
    const response = await request(app.getHttpServer()).get('/network/provisioning/meta');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('runs Zod body validation before the application permission check', async () => {
    const response = await request(app.getHttpServer())
      .post('/network/provisioning/reserve')
      .send({});

    expect(response.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('passes a valid request to the service facade for scoped authorization', async () => {
    reserve.mockRejectedValueOnce(
      new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No tienes autorización para esta operación.',
      }),
    );
    const response = await request(app.getHttpServer())
      .post('/network/provisioning/reserve')
      .send({
        executionOrderId: '11111111-1111-4111-8111-111111111111',
        routerId: '22222222-2222-4222-8222-222222222222',
        ipv4NetworkId: '33333333-3333-4333-8333-333333333333',
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'subscribers' },
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tienes autorización para esta operación.',
    });
    expect(reserve).toHaveBeenCalledTimes(1);
  });
});
