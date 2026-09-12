import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { InventoryController } from '../inventory.controller';
import { PurchasingController } from '../purchasing.controller';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
import { RfqService } from '../services/rfq.service';
import { SupplierProfileService } from '../services/supplier-profile.service';
import { StockIssuePickingService } from '../services/stock-issue-picking.service';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { CycleCountService } from '../services/cycle-count.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockLocationService } from '../services/stock-location.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { WriteOffService } from '../services/write-off.service';
import { ExecutorCustodyService } from '../services/executor-custody.service';

jest.mock('../../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate() {
      return true;
    }
  },
}));

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

      if (authHeader === 'Bearer technician-token') {
        req.user = {
          sub: 'technician-001',
          email: 'technician@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-technician',
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
      taxes: [],
      payableAmount: '4500.00',
    }),
  };

  const purchasingQueryServiceMock = {
    listTaxPresets: jest.fn().mockResolvedValue([
      {
        code: 'IVA_19',
        name: 'IVA 19%',
        category: 'VAT',
        baseRate: 19,
        treatment: 'STANDARD',
        context: 'PURCHASE',
      },
    ]),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController, PurchasingController],
      providers: [
        { provide: InventoryItemService, useValue: {} },
        { provide: InventoryCategoryService, useValue: {} },
        { provide: StockLocationService, useValue: {} },
        { provide: SerializedAssetService, useValue: {} },
        { provide: StockBalanceService, useValue: {} },
        { provide: ExecutorCustodyService, useValue: {} },
        { provide: StockLedgerService, useValue: {} },
        { provide: StockMovementQueryService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: StockIssuePickingService, useValue: {} },
        { provide: InventoryDashboardService, useValue: {} },
        { provide: ReplenishmentService, useValue: {} },
        { provide: CycleCountService, useValue: {} },
        { provide: AssetLoanService, useValue: {} },
        { provide: WriteOffService, useValue: {} },
        { provide: CounterPurchaseService, useValue: counterPurchaseServiceMock },
        { provide: PurchasingQueryService, useValue: purchasingQueryServiceMock },
        { provide: PurchasingService, useValue: {} },
        { provide: GoodsReceiptService, useValue: {} },
        { provide: RfqService, useValue: {} },
        { provide: RfqPdfService, useValue: {} },
        { provide: PurchaseOrderPdfService, useValue: {} },
        { provide: SupplierProfileService, useValue: {} },
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

  it('forwards taxes payload and returns extended tax response', async () => {
    counterPurchaseServiceMock.record.mockResolvedValueOnce({
      movement: {
        id: 'mov-counter-002',
        movementNumber: 'MOV-000100',
        origin: 'COUNTER_PURCHASE',
      },
      lines: [{ id: 'line-counter-002', quantity: '1.00' }],
      taxes: [
        {
          code: 'IVA_19',
          name: 'IVA 19%',
          category: 'VAT',
          effect: 'ADD',
          applies: true,
          rate: '19.0000',
          baseAmount: '100.00',
          taxAmount: '19.00',
        },
      ],
      payableAmount: '119.00',
    });

    const payload = {
      partyRefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invoiceNumber: 'FAC-HTTP-002',
      destinationLocationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lines: [
        {
          itemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          quantityReceived: 1,
          unitCost: 100,
        },
      ],
      taxes: [{ code: 'IVA_19', applies: true }],
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/counter-purchases')
      .set('Authorization', 'Bearer support-token')
      .send(payload)
      .expect(201);

    expect(response.body.taxes).toEqual([
      expect.objectContaining({ code: 'IVA_19', taxAmount: '19.00' }),
    ]);
    expect(response.body.payableAmount).toBe('119.00');
    expect(counterPurchaseServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        taxes: [expect.objectContaining({ code: 'IVA_19', applies: true })],
      }),
      expect.objectContaining({ role: UserRole.SUPPORT }),
    );
  });

  it('tax-presets rejects unauthenticated callers', async () => {
    // El JwtAuthGuard simulado responde false sin token → 403 del framework.
    await request(app.getHttpServer()).get('/api/v1/purchasing/tax-presets').expect(403);
  });

  it('tax-presets rejects roles without purchasing read permission', async () => {
    // TECHNICIAN no tiene INVENTORY_PURCHASING_READ ni rol del @Roles() del
    // endpoint → 403 del RolesGuard (PermissionsGuard simulado como permiso).
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/tax-presets')
      .set('Authorization', 'Bearer technician-token')
      .expect(403);
  });

  it('tax-presets lists purchase presets for support role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/purchasing/tax-presets')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ code: 'IVA_19', context: 'PURCHASE', baseRate: 19 }),
    ]);
    expect(purchasingQueryServiceMock.listTaxPresets).toHaveBeenCalled();
  });
});
