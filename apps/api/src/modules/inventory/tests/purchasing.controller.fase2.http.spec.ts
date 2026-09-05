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
import { PurchasingController } from '../purchasing.controller';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { RfqService } from '../services/rfq.service';
import { SupplierProfileService } from '../services/supplier-profile.service';

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
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
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

describe('PurchasingController Fase 2 — doble guard', () => {
  let app: INestApplication;
  const emptyList = {
    data: [],
    meta: {
      nextCursor: null,
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasMore: false,
      mode: 'page',
    },
  };
  const purchasingQueryServiceMock = {
    listRequests: jest.fn().mockResolvedValue(emptyList),
  };
  const effectivePermissionsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        { provide: PurchasingService, useValue: {} },
        { provide: PurchasingQueryService, useValue: purchasingQueryServiceMock },
        { provide: GoodsReceiptService, useValue: {} },
        { provide: RfqService, useValue: {} },
        { provide: RfqPdfService, useValue: {} },
        { provide: SupplierProfileService, useValue: {} },
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
    purchasingQueryServiceMock.listRequests.mockResolvedValue(emptyList);
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
  });

  it('GET /purchasing/requests — 200 para SUPPORT con permiso inventory.purchasing.read', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_PURCHASING_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .expect(200);
  });

  it('GET /purchasing/requests — 403 para SUPPORT sin permiso aunque rol pase', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });

  it('GET /purchasing/requests — 200 para AUDITOR con permiso (ampliación D3)', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_PURCHASING_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });

  it('GET /purchasing/requests — 403 si solo tiene manage y el handler exige read', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.INVENTORY_PURCHASING_MANAGE,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/requests')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });
});
