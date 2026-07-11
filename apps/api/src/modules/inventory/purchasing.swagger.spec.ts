import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { PurchasingQueryService } from './services/purchasing-query.service';
import { PurchasingService } from './services/purchasing.service';
import { RfqPdfService } from './services/rfq-pdf.service';
import { RfqService } from './services/rfq.service';
import { PurchasingController } from './purchasing.controller';

function getRequestSchema(
  operation: Record<string, unknown> | undefined,
  mimeType: string,
): Record<string, unknown> | undefined {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const typedBody = content?.[mimeType] as Record<string, unknown> | undefined;

  return typedBody?.schema as Record<string, unknown> | undefined;
}

describe('PurchasingController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        { provide: PurchasingService, useValue: {} },
        { provide: PurchasingQueryService, useValue: {} },
        { provide: GoodsReceiptService, useValue: {} },
        { provide: RfqService, useValue: {} },
        { provide: RfqPdfService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta endpoints RFQ del modulo purchasing', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const createRfq = document.paths['/purchasing/requests/{id}/rfq']?.post;
    const inviteSuppliers = document.paths['/purchasing/rfqs/{rfqId}/invitations']?.post;
    const sendRfq = document.paths['/purchasing/rfqs/{rfqId}/send']?.post;
    const declineInvitation =
      document.paths['/purchasing/rfqs/{rfqId}/invitations/{invId}/decline']?.post;
    const closeRfq = document.paths['/purchasing/rfqs/{rfqId}/close']?.post;
    const getRfq = document.paths['/purchasing/rfqs/{rfqId}']?.get;
    const getRfqPdf = document.paths['/purchasing/rfqs/{rfqId}/pdf']?.get;

    expect(createRfq?.summary).toBe(
      'Crear solicitud de cotización (RFQ) desde una solicitud de compra',
    );
    expect(
      getRequestSchema(createRfq as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();

    expect(inviteSuppliers?.summary).toBe('Invitar proveedores a una solicitud de cotización');
    expect(
      getRequestSchema(inviteSuppliers as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();

    expect(sendRfq?.summary).toBe('Enviar solicitud de cotización a proveedores invitados');
    expect(declineInvitation?.summary).toBe(
      'Registrar declinación de una invitación de cotización',
    );
    expect(
      getRequestSchema(declineInvitation as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();
    expect(closeRfq?.summary).toBe('Cerrar ronda de cotización');
    expect(getRfq?.summary).toBe('Obtener detalle de solicitud de cotización');
    expect(getRfqPdf?.summary).toBe('Descargar solicitud de cotización en PDF');
  });

  it('verifica que los paths RFQ estan documentados', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const requiredPaths = [
      '/purchasing/requests/{id}/rfq',
      '/purchasing/rfqs/{rfqId}/invitations',
      '/purchasing/rfqs/{rfqId}/send',
      '/purchasing/rfqs/{rfqId}/invitations/{invId}/decline',
      '/purchasing/rfqs/{rfqId}/close',
      '/purchasing/rfqs/{rfqId}',
      '/purchasing/rfqs/{rfqId}/pdf',
    ];

    for (const path of requiredPaths) {
      expect(document.paths[path]).toBeDefined();
    }
  });
});
