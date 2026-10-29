import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PrivacyInventoryController } from './inventory.controller';
import { PrivacyInventoryService } from './inventory.service';

describe('GET /privacy/inventory', () => {
  let app: INestApplication;
  const inventory = {
    generatedAt: '2026-10-14T15:00:00.000Z',
    databases: [
      {
        key: 'CLIENTES',
        categories: ['Identificación y contacto'],
        purposes: ['TRATAMIENTO_CONTRACTUAL'],
        retention: [{ category: 'Contrato', years: 5 }],
        hasSensitiveData: false,
        internationalTransfer: 'NO_DECLARADA',
        securityMeasures: ['Control de acceso'],
      },
    ],
  };
  const inventoryService = { getInventory: jest.fn().mockResolvedValue(inventory) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrivacyInventoryController],
      providers: [{ provide: PrivacyInventoryService, useValue: inventoryService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: '60000000-0000-4000-8000-000000000002',
            type: 'tenant',
            role: 'ADMIN',
          };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve el inventario dentro de data', async () => {
    const response = await request(app.getHttpServer()).get('/privacy/inventory').expect(200);

    expect(response.body).toEqual({ data: inventory });
    expect(inventoryService.getInventory).toHaveBeenCalledTimes(1);
  });
});
