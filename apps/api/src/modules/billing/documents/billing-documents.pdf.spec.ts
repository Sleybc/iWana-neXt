import PDFDocument from 'pdfkit';
import { renderBillingDocumentPdf } from './billing-documents.pdf';

describe('BR-2.11 PDF de facturación', () => {
  it('incluye número, periodo, líneas, IVA, total, leyenda y pagina sin desbordar', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const document = {
      id: 'fixture',
      number: 'DC-000001',
      issueDate: '2026-11-05',
      dueDate: '2026-11-19',
      status: 'EMITIDO',
      subtotal: '100.00',
      taxTotal: '19.00',
      total: '119.00',
      periodStart: '2026-10-05',
      periodEnd: '2026-11-04',
      coveredStart: '2026-10-20',
      buyerSnapshot: null,
      issuerSnapshot: null,
      lines: Array.from({ length: 100 }, (_, i) => ({
        description: `Concepto ${i}`,
        baseAmount: '1.00',
        taxAmount: '0.19',
        total: '1.19',
      })),
    };
    const buffer = await renderBillingDocumentPdf(document as never);
    const contents = text.mock.calls.map((args) => String(args[0])).join('\n');
    expect(contents).toContain('2026-10-05');
    expect(contents).toContain('2026-11-04');
    expect(contents).toContain('2026-10-20');
    for (const value of [
      'DC-000001',
      'Concepto 99',
      'IVA',
      '119.00',
      'Documento interno: no es factura electrónica de venta.',
      'Documento generado por iWana neXt',
    ])
      expect(contents).toContain(value);
    expect((buffer.toString('latin1').match(/\/Type \/Page\b/gu) ?? []).length).toBeGreaterThan(1);
    text.mockRestore();
  });

  it('imprime la identidad fiscal del adquirente y el NIT del emisor con dígito de verificación', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const buffer = await renderBillingDocumentPdf({
      id: 'fixture-2',
      number: 'FE-000007',
      issueDate: '2026-11-05',
      dueDate: '2026-11-19',
      status: 'EMITIDO',
      subtotal: '100.00',
      taxTotal: '19.00',
      total: '119.00',
      periodStart: '2026-10-05',
      periodEnd: '2026-11-04',
      buyerSnapshot: {
        displayName: 'Adquirente S.A.S.',
        documentType: 'NIT',
        documentNumber: '900123456',
        address: 'Calle 1 # 2-3',
        rutResponsibilities: ['RESPONSABLE_IVA'],
      },
      issuerSnapshot: {
        legalName: 'Proveedor S.A.S.',
        nit: '900654321',
        verificationDigit: '7',
      },
      lines: [{ description: 'Plan', baseAmount: '100.00', taxAmount: '19.00', total: '119.00' }],
    } as never);
    const contents = text.mock.calls.map((args) => String(args[0])).join('\n');
    for (const value of [
      'Adquirente S.A.S.',
      'Tipo de documento: NIT',
      'Documento: 900123456',
      'Calle 1 # 2-3',
      'Proveedor S.A.S.',
      'NIT: 900654321-7',
    ])
      expect(contents).toContain(value);
    expect(buffer.length).toBeGreaterThan(0);
    text.mockRestore();
  });

  it('usa textos de pendiente y omite el dígito de verificación cuando faltan', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    await renderBillingDocumentPdf({
      id: 'fixture-4',
      number: null,
      issueDate: null,
      dueDate: '2026-11-19',
      status: 'BORRADOR',
      subtotal: '0.00',
      taxTotal: '0.00',
      total: '0.00',
      buyerSnapshot: null,
      issuerSnapshot: { legalName: 'Proveedor', nit: '900654321', verificationDigit: null },
      lines: undefined,
    } as never);

    const contents = text.mock.calls.map((args) => String(args[0])).join('\n');
    expect(contents).toContain('Número: Sin número');
    expect(contents).toContain('Fecha de emisión: Pendiente');
    expect(contents).toContain('Periodo: Pendiente a Pendiente');
    expect(contents).toContain('NIT: 900654321');
    expect(contents).not.toContain('NIT: 900654321-');
    text.mockRestore();
  });

  it('abre página nueva cuando el bloque de totales no cabe al final de la hoja', async () => {
    const originalText = PDFDocument.prototype.text;
    const text = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
      this: { y: number; page: { height: number; margins: { bottom: number } } },
      ...args: unknown[]
    ) {
      const result = originalText.apply(this, args as never);
      if (typeof args[0] === 'string' && args[0].startsWith('Concepto final')) {
        this.y = this.page.height - this.page.margins.bottom - 60;
      }
      return result;
    } as never);
    const addPage = jest.spyOn(PDFDocument.prototype, 'addPage');

    await renderBillingDocumentPdf({
      id: 'fixture-3',
      number: 'FE-000008',
      dueDate: '2026-11-19',
      status: 'EMITIDO',
      subtotal: '10.00',
      taxTotal: '1.90',
      total: '11.90',
      periodStart: '2026-10-05',
      periodEnd: '2026-11-04',
      buyerSnapshot: null,
      issuerSnapshot: null,
      lines: [
        { description: 'Concepto final', baseAmount: '10.00', taxAmount: '1.90', total: '11.90' },
      ],
    } as never);

    expect(addPage).toHaveBeenCalled();
    text.mockRestore();
    addPage.mockRestore();
  });
});
