import PDFDocument from 'pdfkit';
import type { BillingStatementLedger, BillingStatementLedgerRowKind } from '@iwana/shared';
import {
  drawBrandFooter,
  drawBrandHeader,
  PDF_FONT,
  registerBrandFonts,
} from '../../../common/pdf/pdf-branding';
import type { BillingIssuerIdentity } from '../ports/billing-issuer-read.port';

const PAGE_TITLE = 'Estado de cuenta';

/** Concepto visible de cada fila (vocabulario del usuario, sin códigos internos). */
export const LEDGER_ROW_LABELS: Record<BillingStatementLedgerRowKind, string> = {
  SALDO_ANTERIOR: 'Saldo anterior',
  DOCUMENTO: 'Factura',
  DOCUMENTO_ANULADO: 'Factura anulada',
  CORTESIA: 'Cortesía',
  PAGO: 'Pago',
  RETENCION: 'Retención',
  PAGO_ANULADO: 'Pago anulado',
};

const MONEY_FORMAT = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `-1234.5` → `-$ 1.234,50`; formato fijo es-CO para que el PDF no dependa del ICU del host. */
export function formatLedgerMoney(value: string): string {
  const negative = value.startsWith('-');
  const amount = Number(negative ? value.slice(1) : value);
  return `${negative ? '-' : ''}$ ${MONEY_FORMAT.format(amount)}`;
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
export function formatLedgerDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export interface StatementLedgerPdfInput {
  ledger: BillingStatementLedger;
  issuer: BillingIssuerIdentity;
  /** Nombre del titular; se omite siempre que `ledger.buyerProtected` sea verdadero. */
  titularName?: string | null;
  /** Fecha de generación (AAAA-MM-DD, zona del tenant). */
  generatedOn: string;
}

const COLUMNS = [
  { title: 'Fecha', width: 62, align: 'left' as const },
  { title: 'Concepto', width: 104, align: 'left' as const },
  { title: 'Referencia', width: 92, align: 'left' as const },
  { title: 'Cargo', width: 80, align: 'right' as const },
  { title: 'Abono', width: 80, align: 'right' as const },
  { title: 'Saldo', width: 98, align: 'right' as const },
];

function drawRow(pdf: PDFKit.PDFDocument, cells: string[], bold = false): void {
  const top = pdf.y;
  let x = pdf.page.margins.left;
  pdf.font(bold ? PDF_FONT.bold : PDF_FONT.regular).fontSize(8);
  COLUMNS.forEach((column, index) => {
    pdf.text(cells[index] ?? '', x, top, {
      width: column.width - 4,
      align: column.align,
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  });
  pdf.x = pdf.page.margins.left;
  pdf.y = top + 14;
}

function ensureRoom(pdf: PDFKit.PDFDocument, height: number): void {
  if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom) {
    pdf.addPage();
    pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, PAGE_TITLE);
    drawRow(
      pdf,
      COLUMNS.map((column) => column.title),
      true,
    );
  }
}

/** PDF del libro del estado de cuenta (spec 2026-11-13 D4, CA-2). Sin datos del titular protegido. */
export async function renderStatementLedgerPdf(input: StatementLedgerPdfInput): Promise<Buffer> {
  const { ledger, issuer } = input;
  const pdf = new PDFDocument({
    size: 'LETTER',
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    pdf.once('end', () => resolve(Buffer.concat(chunks)));
    pdf.once('error', reject);
  });

  pdf.info.Title = PAGE_TITLE;
  registerBrandFonts(pdf);
  pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, PAGE_TITLE);
  pdf.font(PDF_FONT.regular).fontSize(10);
  if (issuer.legalName) pdf.text(issuer.legalName);
  if (issuer.nit) {
    pdf.text(`NIT: ${issuer.nit}${issuer.verificationDigit ? `-${issuer.verificationDigit}` : ''}`);
  }
  pdf.moveDown(0.5);
  if (!ledger.buyerProtected && input.titularName) pdf.text(`Cliente: ${input.titularName}`);
  pdf.text(
    ledger.from
      ? `Periodo: ${formatLedgerDate(ledger.from)} a ${formatLedgerDate(ledger.to)}`
      : `Movimientos hasta el ${formatLedgerDate(ledger.to)}`,
  );
  pdf.text(`Generado el ${formatLedgerDate(input.generatedOn)}`);
  pdf.moveDown();

  drawRow(
    pdf,
    COLUMNS.map((column) => column.title),
    true,
  );
  if (!ledger.rows.length) {
    pdf.font(PDF_FONT.regular).fontSize(9).text('Sin movimientos en el periodo.');
  }
  for (const row of ledger.rows) {
    ensureRoom(pdf, 28);
    const concept =
      row.kind === 'DOCUMENTO' && row.late
        ? `${LEDGER_ROW_LABELS[row.kind]} (pago tardío)`
        : LEDGER_ROW_LABELS[row.kind];
    const reference =
      row.receiptNumber != null ? `Recibo ${row.receiptNumber}` : (row.reference ?? '');
    drawRow(pdf, [
      formatLedgerDate(row.date),
      concept,
      reference,
      row.debit === '0.00' ? '' : formatLedgerMoney(row.debit),
      row.credit === '0.00' ? '' : formatLedgerMoney(row.credit),
      formatLedgerMoney(row.balance),
    ]);
    if (row.kind === 'DOCUMENTO' && row.dueDate) {
      pdf.font(PDF_FONT.regular).fontSize(7);
      pdf.text(`Vence el ${formatLedgerDate(row.dueDate)}`, pdf.page.margins.left + 62);
      pdf.x = pdf.page.margins.left;
    }
  }

  ensureRoom(pdf, 60);
  pdf.moveDown();
  const closing = ledger.closingBalance;
  pdf.font(PDF_FONT.bold).fontSize(11);
  pdf.text(`Saldo final: ${formatLedgerMoney(closing)}`, { align: 'right' });
  pdf.font(PDF_FONT.regular).fontSize(8);
  if (closing.startsWith('-')) pdf.text('Saldo a favor del cliente.', { align: 'right' });
  pdf.moveDown(2);
  pdf.fontSize(8).text('Documento informativo: no es factura electrónica de venta.', {
    align: 'center',
  });
  drawBrandFooter(pdf, PAGE_TITLE);
  pdf.end();
  return complete;
}
