import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { PurchasingQueryService } from './services/purchasing-query.service';
import { PurchasingService } from './services/purchasing.service';
import { RfqPdfService } from './services/rfq-pdf.service';
import { RfqService } from './services/rfq.service';
import { SupplierProfileService } from './services/supplier-profile.service';
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
        { provide: SupplierProfileService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('documenta paginación cursor ADR-064 en solicitudes de compra', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const listRequests = document.paths['/purchasing/requests']?.get;
    expect(listRequests?.description).toContain('ADR-064');
    expect(listRequests?.parameters?.some((p) => 'name' in p && p.name === 'limit')).toBe(true);
    expect(listRequests?.parameters?.some((p) => 'name' in p && p.name === 'cursor')).toBe(true);
    expect(listRequests?.parameters?.some((p) => 'name' in p && p.name === 'search')).toBe(true);
    expect(listRequests?.parameters?.some((p) => 'name' in p && p.name === 'kpiPreset')).toBe(true);
    expect(listRequests?.parameters?.some((p) => 'name' in p && p.name === 'page')).toBe(true);

    const listSuppliers = document.paths['/purchasing/suppliers']?.get;
    expect(listSuppliers?.description).toContain('ListMeta');
    expect(listSuppliers?.parameters?.some((p) => 'name' in p && p.name === 'page')).toBe(true);

    const listOrders = document.paths['/purchasing/orders']?.get;
    expect(listOrders?.parameters?.some((p) => 'name' in p && p.name === 'page')).toBe(true);
    expect(listOrders?.parameters?.some((p) => 'name' in p && p.name === 'limit')).toBe(true);
  });

  it('documenta el eje derivado fulfillmentStatus en listado y detalle', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const listRequests = document.paths['/purchasing/requests']?.get;
    expect(listRequests?.description).toContain('fulfillmentStatus');
    const okResponse = listRequests?.responses?.['200'] as { description?: string } | undefined;
    expect(okResponse?.description).toContain('fulfillmentStatus');

    const getDetail = document.paths['/purchasing/requests/{id}']?.get;
    expect(getDetail?.description).toContain('fulfillmentStatus');

    const schemas = document.components?.schemas as
      | Record<string, { properties?: Record<string, unknown> }>
      | undefined;
    const fulfillmentProperty = schemas?.PurchaseRequestFulfillmentDto?.properties
      ?.fulfillmentStatus as { enum?: string[]; allOf?: unknown } | undefined;
    expect(fulfillmentProperty).toBeDefined();

    const enumSchema = schemas?.PurchaseRequestFulfillmentStatus as { enum?: string[] } | undefined;
    const documentedValues = fulfillmentProperty?.enum ?? enumSchema?.enum ?? [];
    expect(documentedValues.sort()).toEqual(
      ['NOT_ORDERED', 'PARTIALLY_RECEIVED', 'PENDING_RECEIPT', 'RECEIVED'].sort(),
    );
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
    const getRfqInvitationsZip =
      document.paths['/purchasing/rfqs/{rfqId}/invitations/pdf.zip']?.get;

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
    expect(getRfqInvitationsZip?.summary).toBe(
      'Descargar un ZIP con un PDF personalizado por proveedor invitado',
    );
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
      '/purchasing/rfqs/{rfqId}/invitations/pdf.zip',
    ];

    for (const path of requiredPaths) {
      expect(document.paths[path]).toBeDefined();
    }
  });

  it('documenta endpoints de gestión de proveedores', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const supplierPaths = [
      '/purchasing/suppliers',
      '/purchasing/suppliers/{partyRefId}',
      '/purchasing/suppliers/{partyRefId}/status',
    ];

    for (const path of supplierPaths) {
      expect(document.paths[path]).toBeDefined();
    }

    expect(document.paths['/purchasing/suppliers']?.post?.summary).toBe(
      'Dar de alta un proveedor con perfil comercial',
    );
    expect(document.paths['/purchasing/suppliers']?.get?.summary).toBe(
      'Listar proveedores con perfil comercial',
    );
  });

  it('CA-25-12: documenta taxes en POST de cotizaciones y presets en GET detail', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const addQuote = document.paths['/purchasing/requests/{id}/quotes']?.post;
    expect(addQuote?.summary).toBe('Registrar cotización para una solicitud');
    expect(addQuote?.description).toContain('taxes');

    const schemas = document.components?.schemas as
      | Record<string, { properties?: Record<string, unknown> }>
      | undefined;
    expect(schemas?.AddSupplierQuoteDto?.properties?.taxes).toBeDefined();
    expect(schemas?.AddSupplierQuoteDto?.properties?.shippingArrangement).toBeDefined();
    expect(schemas?.AddSupplierQuoteTaxDto).toBeDefined();

    const getDetail = document.paths['/purchasing/requests/{id}']?.get;
    expect(getDetail?.description).toContain('purchaseTaxPresets');
  });

  it('documenta PATCH para corregir una cotización registrada', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Purchasing Test').setVersion('1.0').build(),
    );

    const updateQuote = document.paths['/purchasing/requests/{id}/quotes/{quoteId}']?.patch;
    expect(updateQuote?.summary).toBe('Corregir una cotización registrada');
    const schemas = document.components?.schemas as
      | Record<string, { properties?: Record<string, unknown> }>
      | undefined;
    expect(schemas?.UpdateSupplierQuoteDto).toBeDefined();
    expect(document.paths['/purchasing/quotes/{id}']?.patch).toBeUndefined();
    expect(document.paths['/purchasing/quotes/{id}']?.put).toBeUndefined();
  });
});
