import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { PurchasingController } from '../purchasing.controller';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
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

      return false;
    }
  },
}));

describe('RFQ HTTP integration', () => {
  let app: INestApplication;

  const rfqServiceMock = {
    createFromRequest: jest.fn().mockResolvedValue({
      id: 'rfq-001',
      rfqNumber: 'RFQ-000001',
      status: 'DRAFT',
    }),
    invite: jest
      .fn()
      .mockResolvedValue([{ id: 'inv-001', status: 'INVITED', partyRefId: 'party-001' }]),
    send: jest.fn().mockResolvedValue({ id: 'rfq-001', status: 'SENT' }),
    decline: jest.fn().mockResolvedValue({ id: 'inv-001', status: 'DECLINED' }),
    close: jest.fn().mockResolvedValue({ id: 'rfq-001', status: 'CLOSED' }),
    getById: jest.fn().mockResolvedValue({
      rfq: { id: 'rfq-001', rfqNumber: 'RFQ-000001', status: 'SENT' },
      invitations: [],
      request: { id: 'pr-001' },
      lines: [],
    }),
  };

  const rfqPdfServiceMock = {
    renderForInvitation: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4\n'),
      filename: 'RFQ-000001-proveedor.pdf',
    }),
    renderAllInvitationsZip: jest.fn().mockResolvedValue({
      buffer: Buffer.from('PK'),
      filename: 'RFQ-000001-cotizaciones.zip',
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        { provide: PurchasingService, useValue: { addSupplierQuote: jest.fn() } },
        { provide: PurchasingQueryService, useValue: { getRequestDetail: jest.fn() } },
        { provide: GoodsReceiptService, useValue: { receivePurchaseOrder: jest.fn() } },
        { provide: RfqService, useValue: rfqServiceMock },
        { provide: RfqPdfService, useValue: rfqPdfServiceMock },
        { provide: PurchaseOrderPdfService, useValue: {} },
        { provide: SupplierProfileService, useValue: {} },
        JwtAuthGuard,
        RolesGuard,
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('expone flujo HTTP RFQ y descarga PDF', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const rfqId = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/requests/${requestId}/rfq`)
      .set('Authorization', 'Bearer support-token')
      .send({ currency: 'COP' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/rfqs/${rfqId}/invitations`)
      .set('Authorization', 'Bearer support-token')
      .send({ partyRefIds: ['44444444-4444-4444-8444-444444444444'] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/rfqs/${rfqId}/send`)
      .set('Authorization', 'Bearer support-token')
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/purchasing/rfqs/${rfqId}`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    const invitationId = '33333333-3333-4333-8333-333333333333';
    const invitationPdfResponse = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/rfqs/${rfqId}/invitations/${invitationId}/pdf`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(invitationPdfResponse.headers['content-type']).toContain('application/pdf');
    expect(invitationPdfResponse.body.length).toBeGreaterThan(0);
    expect(rfqPdfServiceMock.renderForInvitation).toHaveBeenCalledWith(rfqId, invitationId);

    const zipResponse = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/rfqs/${rfqId}/invitations/pdf.zip`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(zipResponse.headers['content-type']).toContain('application/zip');
    expect(zipResponse.headers['content-disposition']).toContain('RFQ-000001-cotizaciones.zip');
    expect(rfqPdfServiceMock.renderAllInvitationsZip).toHaveBeenCalledWith(rfqId);

    await request(app.getHttpServer())
      .get(`/api/v1/purchasing/rfqs/${rfqId}/pdf`)
      .set('Authorization', 'Bearer support-token')
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/purchasing/rfqs/${rfqId}/close`)
      .set('Authorization', 'Bearer support-token')
      .expect(201);
  });
});
