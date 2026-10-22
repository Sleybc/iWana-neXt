import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
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

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NetworkProvisioningController],
      providers: [
        {
          provide: ServiceProvisioningService,
          useValue: { getOrderContext: jest.fn().mockResolvedValue(technicianView) },
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
      .overrideGuard(PermissionsGuard)
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
});
