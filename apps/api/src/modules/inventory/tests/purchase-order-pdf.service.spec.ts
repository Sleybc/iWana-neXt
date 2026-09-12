import JSZip from 'jszip';
import { DataSource } from 'typeorm';
import { PurchaseOrderStatus } from '@iwana/shared';
import {
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLineAward,
  SupplierQuote,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
import { PDF_BRAND_TOKENS } from '../services/pdf-branding';
import { PurchasingService } from '../services/purchasing.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { TenantContactPort } from '../ports/tenant-contact.port';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  PurchaseOrder: class PurchaseOrder {},
  PurchaseOrderLine: class PurchaseOrderLine {},
  PurchaseRequest: class PurchaseRequest {},
  PurchaseRequestLineAward: class PurchaseRequestLineAward {},
  SupplierQuote: class SupplierQuote {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

/**
 * Extrae texto buscable del PDF: literales hex (fuentes estándar) +
 * cadenas del diccionario Info / objetos (metadatos ASCII embebidos para Firma iWana).
 */
function extractPdfSearchableText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const fromHex = [...raw.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((match) => Buffer.from(match[1]!, 'hex').toString('latin1'))
    .join('');
  return `${raw}\n${fromHex}`;
}

/** Convierte hex #RRGGBB al fragmento RGB que PDFKit escribe (`… scn`). */
function hexToPdfRgbSnippet(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r} ${g} ${b}`;
}

function buildOrderDetail(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'po-001',
    tenantId: 'tenant-001',
    orderNumber: 'PO-000001',
    purchaseRequestId: 'pr-001',
    partyRefId: 'party-001',
    status: PurchaseOrderStatus.APPROVED,
    expectedDeliveryDate: '2026-09-20',
    notes: 'Entregar en bodega norte',
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    lines: [
      {
        id: 'pol-001',
        purchaseOrderId: 'po-001',
        itemId: 'item-001',
        purchaseRequestLineId: 'line-001',
        quantity: '2.00',
        unitCost: '1500.00',
        receivedQuantity: '0.00',
      },
    ],
    ...overrides,
  };
}

describe('PurchaseOrderPdfService', () => {
  // PDFKit embebe TTF/PNG reales (JetBrainsMono ~274KB + logo ~200KB + Exo2).
  jest.setTimeout(20_000);

  const purchasingServiceMock = {
    getOrderById: jest.fn(),
  } as unknown as PurchasingService;

  const supplierPartyPortMock = {
    getSupplierSummary: jest.fn(),
  } as unknown as SupplierPartyPort;

  const tenantContactPortMock = {
    getContactInfo: jest.fn(),
  } as unknown as TenantContactPort;

  /**
   * Manager simulado: hace que `runInTenantSchema` invoque el callback real
   * del servicio, ejercitando filtro de canceladas, moneda resuelta y labels.
   */
  const requestOrdersFixture = [
    { id: 'po-001', status: PurchaseOrderStatus.APPROVED },
    { id: 'po-002', status: PurchaseOrderStatus.CANCELLED },
    { id: 'po-003', status: PurchaseOrderStatus.PARTIALLY_RECEIVED },
  ];

  function mockTenantSchemaWithManager(options?: { currency?: string | null }) {
    const currency = options?.currency === undefined ? 'COP' : options.currency;
    const managerMock = {
      find: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === InventoryItem) {
          return [{ id: 'item-001', sku: 'SKU-001', name: 'Cable UTP' }];
        }
        if (entity === PurchaseRequestLineAward) {
          return [{ supplierQuoteId: 'quote-001' }];
        }
        if (entity === SupplierQuote) {
          return currency ? [{ id: 'quote-001', currency }] : [];
        }
        if (entity === PurchaseOrder) {
          return requestOrdersFixture;
        }
        return [];
      }),
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === PurchaseRequest) {
          return { requestNumber: 'SC-000001' };
        }
        return null;
      }),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(
      async (_ds: unknown, _schema: unknown, fn: (qr: unknown) => unknown) =>
        fn({ manager: managerMock }),
    );
  }

  function createService() {
    return new PurchaseOrderPdfService(
      {} as DataSource,
      purchasingServiceMock,
      supplierPartyPortMock,
      tenantContactPortMock,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
    mockTenantSchemaWithManager();
    purchasingServiceMock.getOrderById = jest.fn().mockResolvedValue(buildOrderDetail());
    supplierPartyPortMock.getSupplierSummary = jest.fn().mockResolvedValue({
      displayName: 'Proveedor Alfa',
      primaryContact: 'Ana Ruiz',
      phone: '+57 300 000 0000',
      city: 'Bogotá',
    });
    tenantContactPortMock.getContactInfo = jest.fn().mockResolvedValue({
      contactEmail: 'compras@tenant.example',
      phone: '+57 300 111 2222',
      legalName: 'Tenant Demo SAS',
    });
  });

  it('renderForOrder genera el PDF de la orden con proveedor, líneas y contacto', async () => {
    const service = createService();
    const result = await service.renderForOrder('po-001');
    const text = extractPdfSearchableText(result.buffer);

    expect(result.filename).toBe('PO-000001-orden-compra.pdf');
    // Texto buscable = metadatos ASCII (patrón RFQ): título, proveedor,
    // números, moneda y contacto del tenant.
    expect(text).toContain('Orden de compra PO-000001');
    expect(text).toContain('Proveedor: Proveedor Alfa');
    expect(text).toContain('SC-000001');
    expect(text).toContain('Moneda COP');
    expect(text).toContain('compras@tenant.example');
    expect(tenantContactPortMock.getContactInfo).toHaveBeenCalledWith('tenant-001');
    expect(supplierPartyPortMock.getSupplierSummary).toHaveBeenCalledWith('party-001');
  });

  it('renderForOrder omite la moneda cuando no es determinable (nunca la inventa)', async () => {
    mockTenantSchemaWithManager({ currency: null });
    const service = createService();
    const result = await service.renderForOrder('po-001');
    const text = extractPdfSearchableText(result.buffer);

    expect(text).not.toContain('Moneda ');
  });

  it('renderForOrder aplica anatomía Firma iWana', async () => {
    const service = createService();
    const result = await service.renderForOrder('po-001');
    const text = extractPdfSearchableText(result.buffer);
    const raw = result.buffer.toString('latin1');

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    // Logo PNG embebido + fuentes → documento sustancialmente mayor que texto plano.
    expect(result.buffer.length).toBeGreaterThan(20_000);

    expect(text).toContain('Documento generado por iWana neXt');
    expect(text).toContain('Aprobada');

    expect(raw).toContain('Exo2');
    expect(raw).toContain('JetBrainsMono');
    expect(raw).toContain(hexToPdfRgbSnippet(PDF_BRAND_TOKENS.primary));
    expect(raw).toContain(hexToPdfRgbSnippet(PDF_BRAND_TOKENS.accent));
  });

  it('renderForOrder no genera páginas vacías para una orden corta', async () => {
    const service = createService();
    const result = await service.renderForOrder('po-001');
    const raw = result.buffer.toString('latin1');
    const pageCount = (raw.match(/\/Type\s*\/Page\b/g) || []).length;

    expect(pageCount).toBe(1);
  });

  it('renderForOrder lanza 404 en español si la orden no existe', async () => {
    purchasingServiceMock.getOrderById = jest
      .fn()
      .mockRejectedValue(new Error('Orden de compra no encontrada.'));
    const service = createService();

    await expect(service.renderForOrder('po-missing')).rejects.toThrow(
      'Orden de compra no encontrada.',
    );
  });

  it('renderRequestOrdersZip arma un ZIP con un PDF por orden viva (excluye canceladas)', async () => {
    purchasingServiceMock.getOrderById = jest.fn().mockImplementation(async (orderId: string) => {
      if (orderId === 'po-001') {
        return buildOrderDetail();
      }
      return buildOrderDetail({ id: 'po-003', orderNumber: 'PO-000003' });
    });

    const service = createService();
    const result = await service.renderRequestOrdersZip('pr-001');

    expect(result.filename).toBe('SC-000001-ordenes.zip');
    // La orden cancelada no se consulta ni entra al ZIP.
    expect(purchasingServiceMock.getOrderById).not.toHaveBeenCalledWith('po-002');

    const zip = await JSZip.loadAsync(result.buffer);
    const entryNames = Object.keys(zip.files).sort();
    expect(entryNames).toEqual(['PO-000001-orden-compra.pdf', 'PO-000003-orden-compra.pdf']);

    const firstBuffer = await zip.files['PO-000001-orden-compra.pdf']!.async('nodebuffer');
    expect(firstBuffer.subarray(0, 4).toString()).toBe('%PDF');
    const firstText = extractPdfSearchableText(firstBuffer);
    expect(firstText).toContain('Proveedor: Proveedor Alfa');
    expect(firstText).toContain('Documento generado por iWana neXt');
  });

  it('renderRequestOrdersZip lanza 404 en español si no hay órdenes vivas', async () => {
    requestOrdersFixture.length = 0;
    const service = createService();

    await expect(service.renderRequestOrdersZip('pr-001')).rejects.toThrow(
      'No hay órdenes de compra vivas para generar PDFs.',
    );
  });
});
