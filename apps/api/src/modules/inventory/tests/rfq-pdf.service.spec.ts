import { DataSource } from 'typeorm';
import { PurchaseRfqStatus } from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { RfqService } from '../services/rfq.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';

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

describe('RfqPdfService', () => {
  const rfqServiceMock = {
    getById: jest.fn(),
  } as unknown as RfqService;

  const supplierPartyPortMock = {
    getSupplierSummary: jest.fn(),
  } as unknown as SupplierPartyPort;

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
      invitations: [{ partyRefId: 'party-001' }],
    });
    supplierPartyPortMock.getSupplierSummary = jest.fn().mockResolvedValue({
      displayName: 'Proveedor demo',
    });
  });

  it('render genera buffer PDF no vacío', async () => {
    const service = new RfqPdfService({} as DataSource, rfqServiceMock, supplierPartyPortMock);
    const buffer = await service.render('rfq-001');

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renderOrThrow devuelve nombre de archivo', async () => {
    const service = new RfqPdfService({} as DataSource, rfqServiceMock, supplierPartyPortMock);
    const result = await service.renderOrThrow('rfq-001');

    expect(result.filename).toBe('RFQ-000001.pdf');
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});
