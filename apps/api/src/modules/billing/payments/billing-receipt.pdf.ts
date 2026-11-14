import PDFDocument from 'pdfkit';
import type {
  BillingPaymentMethod,
  BillingPaymentStatus,
  BillingWithholdingTaxCode,
} from '@iwana/shared';
import {
  drawBrandFooter,
  drawBrandHeader,
  registerBrandFonts,
  PDF_BRAND_TOKENS,
  PDF_FONT,
} from '../../../common/pdf/pdf-branding';
import type { BillingIssuerIdentity } from '../ports/billing-issuer-read.port';

const PAGE_TITLE = 'Recibo de pago';

const METHOD_LABELS: Record<BillingPaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CONSIGNACION: 'Consignación',
  DATAFONO: 'Datáfono',
  OTRO: 'Otro',
};

const WITHHOLDING_LABELS: Record<BillingWithholdingTaxCode, string> = {
  RETE_FUENTE_SERVICIOS: 'Retención en la fuente por servicios',
  RETE_ICA: 'Retención de ICA',
};

/** Datos ya protegidos para el lector: el renderizador no decide qué ocultar. */
export type BillingReceiptPdfInput = {
  receiptNumber: number;
  status: BillingPaymentStatus;
  paidAt: string;
  method: BillingPaymentMethod;
  /** Valor recibido. */
  amount: string;
  reference: string | null;
  /** Nombre del titular o la leyenda de dato protegido. */
  titularName: string;
  issuer: BillingIssuerIdentity;
  /** Facturas cubiertas: número de iWana o número externo, con el importe aplicado. */
  documents: Array<{ label: string; amount: string }>;
  withholdings: Array<{
    taxCode: BillingWithholdingTaxCode;
    documentLabel: string;
    rate: string;
    amount: string;
  }>;
  /** Saldo a favor del pago; `null` si el pago está anulado. */
  creditBalance: string | null;
};

/** Moneda colombiana con separadores de es-CO; el valor llega como decimal exacto en texto. */
export function formatReceiptMoney(value: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

/** Fecha civil `YYYY-MM-DD` como `DD/MM/YYYY`, sin pasar por zonas horarias. */
export function formatReceiptDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function ensureRoom(pdf: PDFKit.PDFDocument, height: number): void {
  if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom) {
    pdf.addPage();
    pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, PAGE_TITLE);
    pdf.font(PDF_FONT.regular).fontSize(9);
  }
}

/** Recibo de pago (spec MOD05↔MOD14 2026-11-13 R3): interno, no es factura electrónica. */
export async function renderBillingReceiptPdf(input: BillingReceiptPdfInput): Promise<Buffer> {
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

  const voided = input.status === 'ANULADO';
  // Metadatos en ASCII: el número del recibo queda buscable en el PDF.
  pdf.info.Title = `Recibo de pago ${input.receiptNumber}${voided ? ' ANULADO' : ''}`;
  registerBrandFonts(pdf);
  pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, PAGE_TITLE);

  if (voided) {
    pdf
      .font(PDF_FONT.bold)
      .fontSize(18)
      .fillColor(PDF_BRAND_TOKENS.primary)
      .text('ANULADO', { align: 'center' });
    pdf.fillColor('black').moveDown(0.5);
  }

  pdf.font(PDF_FONT.regular).fontSize(11);
  pdf.text(`Recibo N.º ${input.receiptNumber}`);
  pdf.text(`Fecha del pago: ${formatReceiptDate(input.paidAt)}`);
  pdf.text(`Medio de pago: ${METHOD_LABELS[input.method]}`);
  if (input.reference) pdf.text(`Referencia: ${input.reference}`);
  pdf.moveDown();

  pdf.fontSize(12).text('Emisor');
  pdf.fontSize(10).text(input.issuer.legalName ?? '');
  if (input.issuer.nit) {
    const dv = input.issuer.verificationDigit;
    pdf.text(`NIT: ${input.issuer.nit}${dv ? `-${dv}` : ''}`);
  }
  pdf.moveDown();
  pdf.fontSize(12).text('Recibido de');
  pdf.fontSize(10).text(input.titularName);
  pdf.moveDown();

  pdf.fontSize(12).text(`Valor recibido: ${formatReceiptMoney(input.amount)}`);
  pdf.moveDown();

  pdf.fontSize(12).text('Facturas cubiertas');
  pdf.fontSize(9);
  if (input.documents.length === 0) pdf.text('Ninguna.');
  for (const document of input.documents) {
    ensureRoom(pdf, 20);
    pdf.text(`${document.label.slice(0, 40).padEnd(42)} ${formatReceiptMoney(document.amount)}`);
  }

  if (input.withholdings.length > 0) {
    ensureRoom(pdf, 50);
    pdf.moveDown();
    pdf.fontSize(12).text('Retenciones practicadas por el cliente');
    pdf.fontSize(9);
    for (const line of input.withholdings) {
      ensureRoom(pdf, 20);
      pdf.text(
        `${WITHHOLDING_LABELS[line.taxCode]} (${line.rate} %) sobre ${line.documentLabel}: ` +
          formatReceiptMoney(line.amount),
      );
    }
  }

  ensureRoom(pdf, 60);
  pdf.moveDown();
  pdf
    .fontSize(10)
    .text(
      input.creditBalance === null
        ? 'Saldo a favor: no aplica (pago anulado).'
        : `Saldo a favor: ${formatReceiptMoney(input.creditBalance)}`,
      { align: 'right' },
    );
  pdf.moveDown(2);
  pdf.fontSize(9).text('Recibo interno: no es factura electrónica de venta.', { align: 'center' });
  drawBrandFooter(pdf, `Recibo ${input.receiptNumber}`);
  pdf.end();
  return complete;
}
