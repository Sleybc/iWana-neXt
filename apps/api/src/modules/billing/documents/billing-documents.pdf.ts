import PDFDocument from 'pdfkit';
import { BILLING_BLOCKED_BUYER_DISPLAY_NAME, type BillingDocumentResponse } from '@iwana/shared';
import {
  drawBrandHeader,
  drawBrandFooter,
  registerBrandFonts,
  PDF_FONT,
} from '../../../common/pdf/pdf-branding';

/** Renderiza el documento interno sin enviar ni incluir datos que la vista haya ocultado. */
export async function renderBillingDocumentPdf(
  document: BillingDocumentResponse & {
    periodStart?: string | null;
    periodEnd?: string | null;
    coveredStart?: string | null;
  },
): Promise<Buffer> {
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

  pdf.info.Title = `Documento de cobro ${document.number ?? document.id}`;
  registerBrandFonts(pdf);
  pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, 'Documento de cobro');
  pdf.font(PDF_FONT.regular);
  pdf.fontSize(11).text(`Número: ${document.number ?? 'Sin número'}`);
  pdf.text(`Fecha de emisión: ${document.issueDate ?? 'Pendiente'}`);
  pdf.text(`Vencimiento: ${document.dueDate}`);
  pdf.text(`Estado: ${document.status}`);
  pdf.text(
    `Periodo: ${document.periodStart ?? 'Pendiente'} a ${document.periodEnd ?? 'Pendiente'}`,
  );
  if (document.coveredStart) pdf.text(`Inicio de cobertura: ${document.coveredStart}`);
  pdf.moveDown();
  pdf.fontSize(12).text('Adquirente');
  pdf.fontSize(10).text(document.buyerSnapshot?.displayName ?? BILLING_BLOCKED_BUYER_DISPLAY_NAME);
  if (document.buyerSnapshot?.documentType)
    pdf.text(`Tipo de documento: ${document.buyerSnapshot.documentType}`);
  if (document.buyerSnapshot?.documentNumber)
    pdf.text(`Documento: ${document.buyerSnapshot.documentNumber}`);
  if (document.buyerSnapshot?.address) pdf.text(document.buyerSnapshot.address);
  pdf.moveDown();
  pdf.fontSize(12).text('Emisor');
  pdf.fontSize(10).text(document.issuerSnapshot?.legalName ?? '');
  if (document.issuerSnapshot?.nit) {
    const dv = document.issuerSnapshot.verificationDigit;
    pdf.text(`NIT: ${document.issuerSnapshot.nit}${dv ? `-${dv}` : ''}`);
  }
  pdf.moveDown();
  pdf.fontSize(12).text('Detalle');
  pdf.moveDown(0.5);
  pdf.fontSize(9).text('Concepto                         Base          IVA          Total');
  pdf.moveDown(0.3);
  for (const line of document.lines ?? []) {
    if (pdf.y + 30 > pdf.page.height - pdf.page.margins.bottom) {
      pdf.addPage();
      pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, 'Documento de cobro');
      pdf.font(PDF_FONT.regular).fontSize(9);
      pdf.text('Concepto                         Base          IVA          Total');
    }
    pdf.text(
      `${line.description.slice(0, 30).padEnd(32)} ${line.baseAmount.padStart(10)} ${line.taxAmount.padStart(10)} ${line.total.padStart(10)}`,
    );
  }
  if (pdf.y + 110 > pdf.page.height - pdf.page.margins.bottom) {
    pdf.addPage();
    pdf.y = drawBrandHeader(pdf, pdf.page.width, 48, 'Documento de cobro');
  }
  pdf.moveDown();
  pdf.fontSize(10).text(`Subtotal: ${document.subtotal}`, { align: 'right' });
  pdf.text(`IVA: ${document.taxTotal}`, { align: 'right' });
  pdf.fontSize(12).text(`Total: ${document.total}`, { align: 'right' });
  pdf.moveDown(2);
  pdf
    .fontSize(9)
    .text('Documento interno: no es factura electrónica de venta.', { align: 'center' });
  drawBrandFooter(pdf, document.number ?? document.id);
  pdf.end();
  return complete;
}
