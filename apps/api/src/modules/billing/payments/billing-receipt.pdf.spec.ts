import { renderBillingReceiptPdf } from './billing-receipt.pdf';

describe('PDF del recibo de pago', () => {
  it('pagina un recibo con muchas facturas sin perder el número en los metadatos', async () => {
    const buffer = await renderBillingReceiptPdf({
      receiptNumber: 42,
      status: 'REGISTRADO',
      paidAt: '2026-11-10',
      method: 'OTRO',
      amount: '1000.00',
      reference: null,
      titularName: 'Titular sintético',
      issuer: { legalName: null, nit: null, verificationDigit: null },
      documents: Array.from({ length: 90 }, (_, index) => ({
        label: `DC-${String(index).padStart(6, '0')}`,
        amount: '10.00',
      })),
      withholdings: [],
      creditBalance: '100.00',
    });
    const raw = buffer.toString('latin1');
    expect(raw).toContain('Recibo de pago 42');
    expect((raw.match(/\/Type \/Page\b/gu) ?? []).length).toBeGreaterThan(1);
  });
});
