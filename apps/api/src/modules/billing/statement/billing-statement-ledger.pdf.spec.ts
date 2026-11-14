import PDFDocument from 'pdfkit';
import type { BillingStatementLedger } from '@iwana/shared';
import {
  LEDGER_PDF_MAX_ROWS,
  ledgerRowsForPdf,
  ledgerTruncationNotice,
  renderStatementLedgerPdf,
} from './billing-statement-ledger.pdf';

const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';

/** Libro sintético: cargos de 10,00 desde un saldo anterior de 5,00; cada fila con su saldo real. */
function ledger(count: number): BillingStatementLedger {
  let balance = 500;
  const rows = Array.from({ length: count }, (_, index) => {
    balance += 1000;
    return {
      kind: 'DOCUMENTO' as const,
      date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
      reference: `DC-${index + 1}`,
      debit: '10.00',
      credit: '0.00',
      balance: (balance / 100).toFixed(2),
    };
  });
  return {
    subscriberId: SUBSCRIBER,
    from: null,
    to: '2026-01-31',
    openingBalance: '5.00',
    closingBalance: (balance / 100).toFixed(2),
    buyerProtected: false,
    rows,
  } as unknown as BillingStatementLedger;
}

const issuer = { legalName: 'Emisor Sintético', nit: '900000000', verificationDigit: '1' };

describe('PDF del libro: tope de filas (SEC-07, P-03)', () => {
  it('el tope por defecto es 5000 filas', () => {
    expect(LEDGER_PDF_MAX_ROWS).toBe(5000);
  });

  it('sin superar el tope muestra todas las filas y no avisa', () => {
    const book = ledger(3);
    expect(ledgerRowsForPdf(book, 3)).toEqual({
      rows: book.rows,
      truncated: false,
      balanceBefore: null,
    });
  });

  it('al superar el tope deja las más recientes y el saldo acumulado antes de ellas', () => {
    const book = ledger(5);
    const visible = ledgerRowsForPdf(book, 2);
    expect(visible.truncated).toBe(true);
    expect(visible.rows.map((row) => row.reference)).toEqual(['DC-4', 'DC-5']);
    expect(visible.balanceBefore).toBe(book.rows[2]!.balance);
    // Identidad de saldos: saldo previo + cargos visibles = saldo final real.
    const visibleDebits = visible.rows.reduce((sum, row) => sum + Number(row.debit), 0);
    expect((Number(visible.balanceBefore) + visibleDebits).toFixed(2)).toBe(book.closingBalance);
  });

  it('con tope 0 el saldo previo es el de la última fila (o el saldo anterior sin filas)', () => {
    const book = ledger(1);
    expect(ledgerRowsForPdf(book, 0).balanceBefore).toBe(book.rows[0]!.balance);
  });

  it('el PDF truncado pinta el aviso, el saldo previo y el saldo final real', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      const book = ledger(6);
      const content = await renderStatementLedgerPdf({
        ledger: book,
        issuer,
        titularName: 'Titular Sintético',
        generatedOn: '2026-02-01',
        maxRows: 2,
      });
      expect(content.subarray(0, 4).toString()).toBe('%PDF');
      const painted = text.mock.calls.map(([value]) => String(value));
      expect(painted).toContain(ledgerTruncationNotice(2));
      expect(painted).toContain('Saldo antes de las filas mostradas: $ 45,00');
      expect(painted).toContain('Saldo final: $ 65,00');
      expect(painted).toContain('DC-6');
      expect(painted).not.toContain('DC-4');
      expect(ledgerTruncationNotice(2)).toBe(
        'Se muestran las 2 filas más recientes; filtra un periodo más corto.',
      );
    } finally {
      text.mockRestore();
    }
  });

  it('sin truncar no pinta el aviso', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      await renderStatementLedgerPdf({
        ledger: ledger(2),
        issuer,
        titularName: null,
        generatedOn: '2026-02-01',
      });
      const painted = text.mock.calls.map(([value]) => String(value));
      expect(painted.some((value) => value.startsWith('Se muestran las'))).toBe(false);
      expect(painted.some((value) => value.startsWith('Saldo antes de'))).toBe(false);
    } finally {
      text.mockRestore();
    }
  });
});
