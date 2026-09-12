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
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
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

      return false;
    }
  },
}));

/**
 * Endpoints de descarga de PDF de orden de compra (MOD12 Compras, Fase 31):
 * binario con Content-Disposition y autorización igual a la del PDF de RFQ.
 */
describe('Purchase order PDF HTTP integration', () => {
  let app: INestApplication;

  const purchaseOrderPdfServiceMock = {
    renderForOrder: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4\n'),
      filename: 'PO-000001-orden-compra.pdf',
    }),
    renderRequestOrdersZip: jest.fn().mockResolvedValue({
      buffer: Buffer.from('PK'),
      filename: 'SC-000001-ordenes.zip',
    }),
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
        { provide: PurchaseOrderPdfService, useValue: purchaseOrderPdfServiceMock },
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

  const orderId = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';

  it('descarga el PDF de una orden con attachment y filename del servicio', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/orders/${orderId}/pdf`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="PO-000001-orden-compra.pdf"',
    );
    expect(response.body.length).toBeGreaterThan(0);
    expect(purchaseOrderPdfServiceMock.renderForOrder).toHaveBeenCalledWith(orderId);
  });

  it('descarga el ZIP de las órdenes vivas de la solicitud', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchasing/requests/${requestId}/orders/pdf.zip`)
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="SC-000001-ordenes.zip"',
    );
    expect(purchaseOrderPdfServiceMock.renderRequestOrdersZip).toHaveBeenCalledWith(requestId);
  });

  it('rechaza sin credencial y valida el formato UUID de los parámetros', async () => {
    // El JwtAuthGuard simulado responde false → Nest lo traduce a 403 (el
    // guard real lanza UnauthorizedException; aquí se prueba el rechazo, no
    // el código exacto).
    await request(app.getHttpServer()).get(`/api/v1/purchasing/orders/${orderId}/pdf`).expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/purchasing/orders/not-an-uuid/pdf')
      .set('Authorization', 'Bearer support-token')
      .expect(400);
  });
});
