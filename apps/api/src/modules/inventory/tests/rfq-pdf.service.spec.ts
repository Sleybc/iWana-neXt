import JSZip from 'jszip';
import { DataSource } from 'typeorm';
import { PurchaseRfqStatus } from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { RFQ_PDF_TOKENS } from '../services/rfq-pdf.layout';
import { RfqService } from '../services/rfq.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { TenantContactPort } from '../ports/tenant-contact.port';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
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

describe('RfqPdfService', () => {
  // PDFKit embebe TTF/PNG reales (JetBrainsMono ~274KB + logo ~200KB + Exo2).
  // Bajo maxWorkers el wall-clock supera el default 5000ms de Jest
  // (ZIP ~1.8s aislado; flaky O1 en suite inventory concurrente).
  jest.setTimeout(20_000);

  const rfqServiceMock = {
    getById: jest.fn(),
  } as unknown as RfqService;

  const supplierPartyPortMock = {
    getSupplierSummary: jest.fn(),
  } as unknown as SupplierPartyPort;

  const tenantContactPortMock = {
    getContactInfo: jest.fn(),
  } as unknown as TenantContactPort;

  function createService() {
    return new RfqPdfService(
      {} as DataSource,
      rfqServiceMock,
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
    (runInTenantSchema as jest.Mock).mockResolvedValue(new Map());
    rfqServiceMock.getById = jest.fn().mockResolvedValue({
      rfq: {
        id: 'rfq-001',
        rfqNumber: 'RFQ-000001',
        status: PurchaseRfqStatus.SENT,
        currency: 'COP',
        responseDeadline: '2026-08-01',
        notes: 'Notas internas',
      },
      request: {
        requestNumber: 'PR-000001',
        title: 'Compra de fibra',
      },
      lines: [
        {
          inventoryItemId: null,
          freeTextDescription: 'Cable UTP',
          quantityRequested: '10.00',
          unitOfMeasure: 'unidad',
        },
      ],
      invitations: [
        { id: 'inv-001', partyRefId: 'party-001' },
        { id: 'inv-002', partyRefId: 'party-002' },
      ],
    });
    supplierPartyPortMock.getSupplierSummary = jest.fn().mockImplementation(async (partyRefId) => {
      if (partyRefId === 'party-001') {
        return { displayName: 'Proveedor Alfa' };
      }
      if (partyRefId === 'party-002') {
        return { displayName: 'Proveedor Beta' };
      }
      return { displayName: 'Proveedor demo' };
    });
    tenantContactPortMock.getContactInfo = jest.fn().mockResolvedValue({
      contactEmail: 'compras@tenant.example',
      phone: '+57 300 000 0000',
      legalName: 'Tenant Demo SAS',
    });
  });

  it('renderForInvitation genera PDF solo para el proveedor de la invitación', async () => {
    const service = createService();
    const result = await service.renderForInvitation('rfq-001', 'inv-001');
    const text = extractPdfSearchableText(result.buffer);

    expect(result.filename).toBe('RFQ-000001-proveedor-alfa.pdf');
    expect(text).toContain('Proveedor Alfa');
    expect(text).not.toContain('Proveedor Beta');
    expect(text).toContain('dirigida a');
    expect(text).toContain('compras@tenant.example');
    expect(text).toContain('+57 300 000 0000');
    expect(tenantContactPortMock.getContactInfo).toHaveBeenCalledWith('tenant-001');
  });

  it('renderForInvitation aplica anatomía Firma iWana (CA-16)', async () => {
    const service = createService();
    const result = await service.renderForInvitation('rfq-001', 'inv-001');
    const text = extractPdfSearchableText(result.buffer);
    const raw = result.buffer.toString('latin1');

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    // Logo PNG embebido + fuentes → documento sustancialmente mayor que texto plano.
    expect(result.buffer.length).toBeGreaterThan(20_000);

    expect(text).toContain('Destinatario');
    expect(text).toContain('Descripcion');
    expect(text).toContain('Cantidad');
    expect(text).toContain('UdM');
    expect(text).toContain('Documento generado por iWana neXt');
    expect(text).toContain('Enviada');

    expect(raw).toContain('Exo2');
    expect(raw).toContain('JetBrainsMono');
    expect(raw).toContain(hexToPdfRgbSnippet(RFQ_PDF_TOKENS.primary));
    expect(raw).toContain(hexToPdfRgbSnippet(RFQ_PDF_TOKENS.accent));
  });

  it('renderForInvitation no genera páginas vacías para una RFQ corta', async () => {
    const service = createService();
    const result = await service.renderForInvitation('rfq-001', 'inv-001');
    const raw = result.buffer.toString('latin1');
    const pageCount = (raw.match(/\/Type\s*\/Page\b/g) || []).length;

    expect(pageCount).toBe(1);
  });

  it('renderForInvitation lanza 404 en español si la invitación no pertenece a la RFQ', async () => {
    const service = createService();

    await expect(service.renderForInvitation('rfq-001', 'inv-missing')).rejects.toThrow(
      'Invitación de cotización no encontrada.',
    );
  });

  it('renderAllInvitationsZip arma un ZIP con un PDF personalizado por proveedor', async () => {
    const service = createService();
    const result = await service.renderAllInvitationsZip('rfq-001');

    expect(result.filename).toBe('RFQ-000001-cotizaciones.zip');

    const zip = await JSZip.loadAsync(result.buffer);
    const entryNames = Object.keys(zip.files).sort();
    expect(entryNames).toEqual(['RFQ-000001-proveedor-alfa.pdf', 'RFQ-000001-proveedor-beta.pdf']);

    const alfaBuffer = await zip.files['RFQ-000001-proveedor-alfa.pdf']!.async('nodebuffer');
    expect(alfaBuffer.subarray(0, 4).toString()).toBe('%PDF');
    const alfaText = extractPdfSearchableText(alfaBuffer);
    expect(alfaText).toContain('Proveedor Alfa');
    expect(alfaText).not.toContain('Proveedor Beta');
    expect(alfaText).toContain('dirigida a');
    expect(alfaText).toContain('Destinatario');
    expect(alfaText).toContain('Documento generado por iWana neXt');
  });

  it('renderAllInvitationsZip lanza 404 en español si la RFQ no tiene invitaciones', async () => {
    rfqServiceMock.getById = jest.fn().mockResolvedValue({
      rfq: {
        id: 'rfq-001',
        rfqNumber: 'RFQ-000001',
        status: PurchaseRfqStatus.SENT,
        currency: 'COP',
        responseDeadline: '2026-08-01',
        notes: null,
      },
      request: { requestNumber: 'PR-000001', title: 'Compra de fibra' },
      lines: [],
      invitations: [],
    });
    const service = createService();

    await expect(service.renderAllInvitationsZip('rfq-001')).rejects.toThrow(
      'No hay proveedores invitados para generar PDFs.',
    );
  });
});
