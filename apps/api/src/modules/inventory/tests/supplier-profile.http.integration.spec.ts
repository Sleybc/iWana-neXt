import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  DocumentTypeParty,
  PartyStatus,
  PartyType,
  SupplierProfileStatus,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
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
      if (req.headers.authorization === 'Bearer support-token') {
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

      if (req.headers.authorization === 'Bearer viewer-token') {
        req.user = {
          sub: 'viewer-001',
          email: 'viewer@example.test',
          role: UserRole.SUBSCRIBER,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-viewer',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
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
      const user = context.switchToHttp().getRequest().user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0 || (user && requiredRoles.includes(user.role))) {
        return true;
      }

      throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
    }
  },
}));

describe('Supplier profile HTTP integration', () => {
  let app: INestApplication;

  const PARTY_REF_ID = '44444444-4444-4444-8444-444444444444';

  const supplierRecord = {
    id: '66666666-6666-4666-8666-666666666666',
    supplierCode: 'PROV-000001',
    partyRefId: PARTY_REF_ID,
    status: SupplierProfileStatus.ACTIVE,
    paymentTermsDays: 30,
    currency: 'COP',
    incoterm: null,
    defaultLeadTimeDays: 7,
    purchasingContactName: 'Mesa comercial',
    purchasingContactEmail: 'compras@proveedor.test',
    purchasingContactPhone: '3000000000',
    notes: null,
    createdAt: new Date('2026-07-11T12:00:00.000Z'),
    updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    party: {
      partyRefId: PARTY_REF_ID,
      displayName: 'Proveedor demo',
      primaryContact: 'compras@proveedor.test',
      phone: '3000000000',
      email: 'compras@proveedor.test',
      city: 'Bogotá',
      status: PartyStatus.ACTIVE,
    },
  };

  const supplierProfileServiceMock = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        { provide: PurchasingService, useValue: {} },
        { provide: PurchasingQueryService, useValue: {} },
        { provide: GoodsReceiptService, useValue: {} },
        { provide: RfqService, useValue: {} },
        { provide: RfqPdfService, useValue: {} },
        { provide: SupplierProfileService, useValue: supplierProfileServiceMock },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    supplierProfileServiceMock.create.mockResolvedValue(supplierRecord);
    supplierProfileServiceMock.list.mockResolvedValue({
      data: [supplierRecord],
      total: 1,
      page: 1,
      limit: 20,
    });
    supplierProfileServiceMock.get.mockResolvedValue(supplierRecord);
    supplierProfileServiceMock.update.mockResolvedValue({
      ...supplierRecord,
      paymentTermsDays: 45,
      notes: 'Condiciones actualizadas',
    });
    supplierProfileServiceMock.setStatus.mockResolvedValue({
      ...supplierRecord,
      status: SupplierProfileStatus.BLOCKED,
    });
  });

  it('POST /purchasing/suppliers crea proveedor con perfil', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '900123456',
        displayName: 'Proveedor demo',
        paymentTermsDays: 30,
        currency: 'cop',
        defaultLeadTimeDays: 7,
      })
      .expect(201);

    expect(response.body.supplierCode).toBe('PROV-000001');
    expect(response.body.party.displayName).toBe('Proveedor demo');
    expect(supplierProfileServiceMock.create).toHaveBeenCalled();
  });

  it('POST /purchasing/suppliers responde 409 en duplicado', async () => {
    supplierProfileServiceMock.create.mockRejectedValue(
      new ConflictException('Ya existe un perfil de proveedor para este tercero.'),
    );

    await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '900123456',
        displayName: 'Proveedor demo',
      })
      .expect(409);
  });

  it('GET /purchasing/suppliers lista perfiles paginados', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/purchasing/suppliers?search=demo&page=1&limit=20')
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].supplierCode).toBe('PROV-000001');
    expect(supplierProfileServiceMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'demo', page: 1, limit: 20 }),
    );
  });

  it('GET /purchasing/suppliers/:partyRefId devuelve detalle', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/suppliers/${PARTY_REF_ID}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.partyRefId).toBe(PARTY_REF_ID);
    expect(supplierProfileServiceMock.get).toHaveBeenCalledWith(PARTY_REF_ID);
  });

  it('PATCH /purchasing/suppliers/:partyRefId actualiza campos comerciales', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/purchasing/suppliers/${PARTY_REF_ID}`)
      .set('Authorization', 'Bearer support-token')
      .send({
        paymentTermsDays: 45,
        notes: 'Condiciones actualizadas',
      })
      .expect(200);

    expect(response.body.paymentTermsDays).toBe(45);
    expect(response.body.notes).toBe('Condiciones actualizadas');
    expect(supplierProfileServiceMock.update).toHaveBeenCalledWith(
      PARTY_REF_ID,
      expect.objectContaining({ paymentTermsDays: 45, notes: 'Condiciones actualizadas' }),
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  it('POST /purchasing/suppliers/:partyRefId/status cambia estado', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/purchasing/suppliers/${PARTY_REF_ID}/status`)
      .set('Authorization', 'Bearer support-token')
      .send({ status: SupplierProfileStatus.BLOCKED })
      .expect(201);

    expect(response.body.status).toBe(SupplierProfileStatus.BLOCKED);
    expect(supplierProfileServiceMock.setStatus).toHaveBeenCalledWith(
      PARTY_REF_ID,
      { status: SupplierProfileStatus.BLOCKED },
      expect.objectContaining({ sub: 'support-001' }),
    );
  });

  it('rechaza acceso sin token con 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/purchasing/suppliers').expect(401);
  });

  it('rechaza rol no autorizado con 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer viewer-token')
      .expect(403);
  });
});
