import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { InventoryController } from '../inventory.controller';
import { AssetLoanService } from '../services/asset-loan.service';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { CycleCountService } from '../services/cycle-count.service';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { ExecutorCustodyService } from '../services/executor-custody.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockIssuePickingService } from '../services/stock-issue-picking.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockLocationService } from '../services/stock-location.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { WriteOffService } from '../services/write-off.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const map: Record<string, JwtPayload> = {
        'Bearer support-token': {
          sub: 'support-001',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer tech-token': {
          sub: 'tech-001',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer accountant-token': {
          sub: 'accountant-001',
          role: UserRole.ACCOUNTANT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
      };
      const header = req.headers.authorization;
      if (header && map[header]) {
        req.user = map[header];
        return true;
      }
      throw new UnauthorizedException('Token inválido');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length === 0) return true;
      if (!user || !required.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
      return true;
    }
  },
}));

describe('InventoryController Fase 2 — doble guard', () => {
  let app: INestApplication;
  const emptyList = { data: [], meta: { nextCursor: null, total: 0 } };
  const inventoryItemServiceMock = {
    list: jest.fn().mockResolvedValue(emptyList),
  };
  const stockBalanceServiceMock = {
    list: jest.fn().mockResolvedValue(emptyList),
  };
  const effectivePermissionsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryItemService, useValue: inventoryItemServiceMock },
        { provide: InventoryCategoryService, useValue: {} },
        { provide: StockLocationService, useValue: {} },
        { provide: SerializedAssetService, useValue: {} },
        { provide: StockBalanceService, useValue: stockBalanceServiceMock },
        { provide: ExecutorCustodyService, useValue: { getCustody: jest.fn() } },
        { provide: StockLedgerService, useValue: {} },
        { provide: StockMovementQueryService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: StockIssuePickingService, useValue: {} },
        { provide: CounterPurchaseService, useValue: {} },
        { provide: InventoryDashboardService, useValue: {} },
        { provide: ReplenishmentService, useValue: {} },
        { provide: CycleCountService, useValue: {} },
        { provide: AssetLoanService, useValue: {} },
        { provide: WriteOffService, useValue: {} },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsMock },
        Reflector,
        PermissionsGuard,
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
    inventoryItemServiceMock.list.mockResolvedValue(emptyList);
    stockBalanceServiceMock.list.mockResolvedValue(emptyList);
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
  });

  it('GET /inventory/items — 200 para SUPPORT con permiso inventory.stock.read', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_STOCK_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items')
      .set('Authorization', 'Bearer support-token')
      .expect(200);
  });

  it('GET /inventory/items — 403 para SUPPORT sin permiso aunque rol pase', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });

  it('GET /inventory/items — 200 para TECHNICIAN con permiso (ampliación D3)', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_STOCK_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items')
      .set('Authorization', 'Bearer tech-token')
      .expect(200);
  });

  it('GET /inventory/items — 200 para AUDITOR con permiso (ampliación D3)', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_STOCK_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });

  it('GET /inventory/balances — 200 para SUPPORT con permiso inventory.stock.read', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_STOCK_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/balances')
      .set('Authorization', 'Bearer support-token')
      .expect(200);
  });

  it('GET /inventory/items — 403 para ACCOUNTANT aunque tenga permiso (techo @Roles; no está en matriz V2)', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_STOCK_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/items')
      .set('Authorization', 'Bearer accountant-token')
      .expect(403);
  });
});
