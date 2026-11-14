/**
 * Nombre del PDF de cobro (inventario W0 de la spec MOD05↔MOD14 2026-11-13, obligación 2): un
 * histórico importado se descarga con su número de origen. Prefijo «factura-» como la API.
 */
import { billingApi } from '@/lib/api-client';
import { billingPdfFilename, downloadBillingDocumentPdf } from './billing-document-pdf';
import { documentIssueDate, paymentReceiptLabel } from './billing-copy';

describe('billingPdfFilename', () => {
  it.each([
    ['DC-000101', 'DC-000101.pdf'],
    ['UISP/2024:0042', 'UISP-2024-0042.pdf'],
    [null, 'factura.pdf'],
    ['  ', 'factura.pdf'],
  ])('%p → %p', (name, expected) => {
    expect(billingPdfFilename(name, 'factura')).toBe(expected);
  });
});

describe('downloadBillingDocumentPdf', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [{ status: 'EMITIDO', number: 'DC-1', externalNumber: null }, 'factura-DC-1.pdf'],
    [{ status: 'EMITIDO', number: 'DC/1', externalNumber: null }, 'factura-DC-1.pdf'],
    [
      { status: 'IMPORTADO', number: null, externalNumber: 'UISP-2024-0042' },
      'factura-importada-UISP-2024-0042.pdf',
    ],
    [{ status: 'IMPORTADO', number: null, externalNumber: null }, 'factura-importada.pdf'],
    [{ status: 'EMITIDO', number: null, externalNumber: null }, 'factura.pdf'],
  ] as const)('%p se descarga como %p', async (numbers, expected) => {
    jest.spyOn(billingApi, 'documentPdf').mockResolvedValue(new Blob(['%PDF']));
    URL.createObjectURL = jest.fn(() => 'blob:pdf');
    URL.revokeObjectURL = jest.fn();
    const names: string[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    await downloadBillingDocumentPdf({ id: 'doc-1', ...numbers });
    expect(names).toEqual([expected]);
  });
});

describe('textos de Facturas y Pagos', () => {
  it('la fecha de emisión usa la fiscal o la de creación, sin corrimiento horario', () => {
    expect(documentIssueDate({ issueDate: '2026-11-05', createdAt: '2026-11-06T02:00:00Z' })).toBe(
      '5 de noviembre de 2026',
    );
    expect(documentIssueDate({ issueDate: null, createdAt: '2026-11-06T15:00:00.000Z' })).toMatch(
      /2026/u,
    );
  });

  it('el recibo muestra su número o la referencia de origen del importado', () => {
    expect(paymentReceiptLabel({ receiptNumber: 7, imported: false })).toBe('N.º 7');
    expect(
      paymentReceiptLabel({ imported: true, externalId: 'uisp:99', receiptNumber: null }),
    ).toBe('Importado · uisp:99');
    expect(paymentReceiptLabel({ imported: true, externalId: null })).toBe('Importado');
  });
});
