import PDFDocument from 'pdfkit';
import { BILLING_BLOCKED_BUYER_DISPLAY_NAME, type BillingPaymentResponse } from '@iwana/shared';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingReceiptsService } from './billing-receipts.service';
import { formatReceiptDate, formatReceiptMoney } from './billing-receipt.pdf';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      getOrThrow: () => ({
        tenantId: '00000000-0000-4000-8000-000000000001',
        schemaName: 'tenant_test',
      }),
    },
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  };
});

const subscriberId = '00000000-0000-4000-8000-000000000010';
const documentA = '00000000-0000-4000-8000-0000000000a1';
const documentB = '00000000-0000-4000-8000-0000000000b1';
const actor = '00000000-0000-4000-8000-000000000002';

function allocation(documentId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-0000000001${documentId.slice(-2)}`,
    tenantId: '00000000-0000-4000-8000-000000000001',
    paymentId: '00000000-0000-4000-8000-000000000020',
    documentId,
    amount: '40.00',
    reversedAt: null,
    reversedBy: null,
    reversalReasonCode: null,
    createdBy: actor,
    createdAt: '2026-11-05T12:00:00.000Z',
    ...extra,
  };
}

function payment(overrides: Partial<BillingPaymentResponse> = {}): BillingPaymentResponse {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    tenantId: '00000000-0000-4000-8000-000000000001',
    subscriberId,
    method: 'TRANSFERENCIA',
    amount: '100.00',
    paidAt: '2026-11-05',
    reference: 'REF-1',
    idempotencyKey: 'key',
    status: 'REGISTRADO',
    createdBy: actor,
    createdAt: '2026-11-05T12:00:00.000Z',
    allocatedAmount: '40.00',
    unallocatedAmount: '60.00',
    allocations: [allocation(documentA)],
    withholdingAmount: '0.00',
    withholdings: [],
    receiptNumber: 7,
    imported: false,
    externalId: null,
    subscriberProtected: false,
    ...overrides,
  } as BillingPaymentResponse;
}

describe('BillingReceiptsService', () => {
  const payments = { getPayment: jest.fn() };
  const contracts = {
    findTitularRefs: jest.fn(),
    findTitularDisplayNames: jest.fn(),
  };
  const issuers = {
    getIssuerIdentity: jest.fn().mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: '1',
    }),
  };
  let documentQuery: jest.Mock;
  let service: BillingReceiptsService;
  let text: jest.SpyInstance;
  const access = { canSeeBlocked: false, actorId: actor };

  const drawn = () => text.mock.calls.map((args) => String(args[0])).join('\n');

  beforeEach(() => {
    jest.clearAllMocks();
    text = jest.spyOn(PDFDocument.prototype, 'text');
    documentQuery = jest.fn().mockResolvedValue([
      { id: documentA, number: 'DC-000001', external_number: null },
      { id: documentB, number: null, external_number: 'UISP-77' },
    ]);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, work) =>
      work({ manager: { query: documentQuery } }),
    );
    contracts.findTitularRefs.mockResolvedValue([
      { subscriberId, partyId: 'party', anonymized: false },
    ]);
    contracts.findTitularDisplayNames.mockResolvedValue([
      { subscriberId, displayName: 'Titular sintético' },
    ]);
    payments.getPayment.mockResolvedValue(payment());
    service = new BillingReceiptsService(
      {} as never,
      payments as unknown as BillingPaymentsService,
      contracts as unknown as BillingContractReadPort,
      issuers as unknown as BillingIssuerReadPort,
    );
  });

  afterEach(() => text.mockRestore());

  it('genera recibo-<n>.pdf con número, emisor, titular, facturas y saldo a favor', async () => {
    const result = await service.receiptPdf(payment().id, access);
    expect(result.filename).toBe('recibo-7.pdf');
    expect(result.receiptNumber).toBe(7);
    expect(result.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(payments.getPayment).toHaveBeenCalledWith(payment().id, access);
    const contents = drawn();
    for (const value of [
      'Recibo N.º 7',
      'Fecha del pago: 05/11/2026',
      'Medio de pago: Transferencia',
      'Referencia: REF-1',
      'Operador sintético',
      'NIT: 900000000-1',
      'Titular sintético',
      'DC-000001',
      'Recibo interno: no es factura electrónica de venta.',
    ])
      expect(contents).toContain(value);
    expect(contents).toContain(`Saldo a favor: ${formatReceiptMoney('60.00')}`);
    expect(contents).not.toContain('ANULADO');
    expect(documentQuery).toHaveBeenCalledWith(expect.stringContaining('billing_documents'), [
      '00000000-0000-4000-8000-000000000001',
      [documentA],
    ]);
  });

  it('omite las aplicaciones desasociadas y lista las retenciones vigentes con su documento', async () => {
    payments.getPayment.mockResolvedValue(
      payment({
        allocations: [
          allocation(documentA),
          allocation(documentB, {
            reversedAt: '2026-11-06T00:00:00.000Z',
            reversedBy: actor,
            reversalReasonCode: 'REASIGNACION',
          }),
        ],
        withholdings: [
          {
            id: '00000000-0000-4000-8000-000000000301',
            paymentId: '00000000-0000-4000-8000-000000000020',
            documentId: documentA,
            taxCode: 'RETE_ICA',
            base: '40.00',
            rate: '1.0000',
            amount: '1.00',
            certificateNumber: null,
            voidedAt: null,
            createdBy: actor,
            createdAt: '2026-11-05T12:00:00.000Z',
          },
        ],
      }),
    );
    await service.receiptPdf(payment().id, access);
    const contents = drawn();
    expect(contents).toContain('DC-000001');
    expect(contents).not.toContain('UISP-77');
    expect(contents).toContain('Retención de ICA (1.0000 %) sobre DC-000001');
  });

  it('marca ANULADO, conserva las facturas que la anulación revirtió y no muestra saldo a favor', async () => {
    payments.getPayment.mockResolvedValue(
      payment({
        status: 'ANULADO',
        allocations: [
          allocation(documentA, { reversedAt: '2026-11-07T00:00:00.000Z', reversedBy: actor }),
          allocation(documentB, {
            reversedAt: '2026-11-06T00:00:00.000Z',
            reversedBy: actor,
            reversalReasonCode: 'VALOR_EQUIVOCADO',
          }),
        ],
        unallocatedAmount: '100.00',
      }),
    );
    const result = await service.receiptPdf(payment().id, access);
    expect(result.content.toString('latin1')).toContain('Recibo de pago 7 ANULADO');
    const contents = drawn();
    expect(contents).toContain('ANULADO');
    expect(contents).toContain('DC-000001');
    expect(contents).not.toContain('UISP-77');
    expect(contents).toContain('Saldo a favor: no aplica (pago anulado).');
  });

  it('usa el número externo de un documento sin número de iWana', async () => {
    payments.getPayment.mockResolvedValue(payment({ allocations: [allocation(documentB)] }));
    await service.receiptPdf(payment().id, access);
    expect(drawn()).toContain('UISP-77');
  });

  it('con el titular protegido no lee ni pinta su nombre', async () => {
    payments.getPayment.mockResolvedValue(payment({ subscriberProtected: true, reference: null }));
    await service.receiptPdf(payment().id, access);
    expect(contracts.findTitularDisplayNames).not.toHaveBeenCalled();
    expect(drawn()).toContain(BILLING_BLOCKED_BUYER_DISPLAY_NAME);
    expect(drawn()).not.toContain('Referencia:');
  });

  it('responde 404 si el titular está anonimizado o ya no existe', async () => {
    contracts.findTitularRefs.mockResolvedValueOnce([
      { subscriberId, partyId: null, anonymized: true },
    ]);
    await expect(service.receiptPdf(payment().id, access)).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_PAYMENT_NOT_FOUND' },
    });
    contracts.findTitularRefs.mockResolvedValueOnce([]);
    await expect(service.receiptPdf(payment().id, access)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['importado', { imported: true, receiptNumber: null, externalId: 'uisp:payment:1' }],
    ['sin número', { receiptNumber: null }],
  ])('responde 409 BILLING_RECEIPT_NOT_AVAILABLE con un pago %s', async (_label, overrides) => {
    payments.getPayment.mockResolvedValue(payment(overrides as Partial<BillingPaymentResponse>));
    await expect(service.receiptPdf(payment().id, access)).rejects.toMatchObject({
      status: 409,
      response: { code: 'BILLING_RECEIPT_NOT_AVAILABLE' },
    });
    expect(issuers.getIssuerIdentity).not.toHaveBeenCalled();
  });

  it('propaga el error de lectura del pago (404 o 503 de privacidad)', async () => {
    payments.getPayment.mockRejectedValue(Object.assign(new Error('x'), { status: 503 }));
    await expect(service.receiptPdf(payment().id, access)).rejects.toMatchObject({ status: 503 });
  });

  describe('ramas de datos incompletos (P-04)', () => {
    const withholding = (documentId: string, voidedAt: string | null) => ({
      id: `00000000-0000-4000-8000-0000000003${documentId.slice(-2)}`,
      paymentId: '00000000-0000-4000-8000-000000000020',
      documentId,
      taxCode: 'RETE_ICA' as const,
      base: '40.00',
      rate: '1.0000',
      amount: '1.00',
      certificateNumber: null,
      voidedAt,
      createdBy: actor,
      createdAt: '2026-11-05T12:00:00.000Z',
    });

    it('sin aplicaciones ni retenciones no consulta documentos y el saldo a favor cae a 0,00', async () => {
      payments.getPayment.mockResolvedValue(
        payment({
          allocations: undefined,
          withholdings: undefined,
          unallocatedAmount: undefined,
        } as unknown as Partial<BillingPaymentResponse>),
      );
      await service.receiptPdf(payment().id, access);
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(drawn()).toContain(`Saldo a favor: ${formatReceiptMoney('0.00')}`);
    });

    it('sin nombre del titular pinta vacío y no inventa uno', async () => {
      contracts.findTitularDisplayNames.mockResolvedValueOnce([]);
      await service.receiptPdf(payment().id, access);
      expect(drawn()).not.toContain('Titular sintético');
    });

    it('un documento sin número propio ni externo, o ausente, se rotula «Documento sin número»', async () => {
      const documentC = '00000000-0000-4000-8000-0000000000c1';
      documentQuery.mockResolvedValueOnce([{ id: documentA, number: null, external_number: null }]);
      payments.getPayment.mockResolvedValue(
        payment({ allocations: [allocation(documentA), allocation(documentC)] }),
      );
      await service.receiptPdf(payment().id, access);
      const contents = drawn();
      expect(contents.match(/Documento sin número/gu)?.length).toBeGreaterThanOrEqual(2);
      expect(documentQuery).toHaveBeenCalledWith(expect.any(String), [
        '00000000-0000-4000-8000-000000000001',
        [documentA, documentC],
      ]);
    });

    it('en un pago registrado omite la retención anulada; en uno anulado la conserva', async () => {
      payments.getPayment.mockResolvedValue(
        payment({
          withholdings: [withholding(documentB, '2026-11-06T00:00:00.000Z')],
        } as Partial<BillingPaymentResponse>),
      );
      await service.receiptPdf(payment().id, access);
      expect(drawn()).not.toContain('Retención de ICA');
      // La retención agrega su documento a la consulta de rótulos aunque no tenga aplicación.
      expect(documentQuery).toHaveBeenLastCalledWith(expect.any(String), [
        '00000000-0000-4000-8000-000000000001',
        [documentA, documentB],
      ]);

      text.mockClear();
      payments.getPayment.mockResolvedValue(
        payment({
          status: 'ANULADO',
          allocations: [
            allocation(documentA, { reversedAt: '2026-11-07T00:00:00.000Z', reversedBy: actor }),
          ],
          withholdings: [withholding(documentA, '2026-11-07T00:00:00.000Z')],
        } as Partial<BillingPaymentResponse>),
      );
      await service.receiptPdf(payment().id, access);
      expect(drawn()).toContain('Retención de ICA (1.0000 %) sobre DC-000001');
    });
  });

  it('formatea fecha civil y moneda colombiana', () => {
    expect(formatReceiptDate('2026-01-31')).toBe('31/01/2026');
    expect(formatReceiptDate('sin-fecha')).toBe('sin-fecha');
    expect(formatReceiptMoney('1234567.50')).toMatch(/1\.234\.567,50/u);
  });
});
