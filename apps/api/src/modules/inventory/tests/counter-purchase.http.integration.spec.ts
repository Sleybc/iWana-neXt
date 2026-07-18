import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { InventoryController } from '../inventory.controller';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { CycleCountService } from '../services/cycle-count.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockLocationService } from '../services/stock-location.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';

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

      if (isPublic) {
        return true;
      }

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

      return false;
    }
  },
}));

describe('Counter purchase HTTP integration', () => {
  let app: INestApplication;

  const counterPurchaseServiceMock = {
    record: jest.fn().mockResolvedValue({
      movement: {
        id: 'mov-counter-001',
        movementNumber: 'MOV-000099',
        origin: 'COUNTER_PURCHASE',
      },
      lines: [{ id: 'line-counter-001', quantity: '3.00' }],
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryItemService, useValue: {} },
        { provide: InventoryCategoryService, useValue: {} },
        { provide: StockLocationService, useValue: {} },
        { provide: SerializedAssetService, useValue: {} },
        { provide: StockBalanceService, useValue: {} },
        { provide: StockLedgerService, useValue: {} },
        { provide: StockMovementQueryService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: InventoryDashboardService, useValue: {} },
        { provide: ReplenishmentService, useValue: {} },
        { provide: CycleCountService, useValue: {} },
        { provide: CounterPurchaseService, useValue: counterPurchaseServiceMock },
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

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).post('/api/v1/inventory/counter-purchases').expect(403);
  });

  it('registers counter purchase for support role', async () => {
    const payload = {
      partyRefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invoiceNumber: 'FAC-HTTP-001',
      destinationLocationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lines: [
        {
          itemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          quantityReceived: 3,
          unitCost: 1500,
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/counter-purchases')
      .set('Authorization', 'Bearer support-token')
      .send(payload)
      .expect(201);

    expect(response.body.movement.movementNumber).toBe('MOV-000099');
    expect(counterPurchaseServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'FAC-HTTP-001',
        lines: expect.arrayContaining([
          expect.objectContaining({ quantityReceived: 3, unitCost: 1500 }),
        ]),
      }),
      expect.objectContaining({ role: UserRole.SUPPORT }),
    );
  });
});
