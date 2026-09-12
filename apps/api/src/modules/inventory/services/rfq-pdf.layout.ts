import PDFDocument from 'pdfkit';
import { PurchaseRfqStatus } from '@iwana/shared';
import {
  PDF_BRAND_TOKENS,
  PDF_FONT,
  drawBrandFooter,
  drawBrandHeader,
  registerBrandFonts,
  toAsciiMetadata,
} from './pdf-branding';

/** Alias histórico: el spec de servicio referencia los tokens por este nombre. */
export { PDF_BRAND_TOKENS as RFQ_PDF_TOKENS };

const PURCHASE_RFQ_STATUS_LABELS: Record<PurchaseRfqStatus, string> = {
  [PurchaseRfqStatus.DRAFT]: 'Borrador',
  [PurchaseRfqStatus.SENT]: 'Enviada',
  [PurchaseRfqStatus.RECEIVING]: 'Recibiendo respuestas',
  [PurchaseRfqStatus.CLOSED]: 'Cerrada',
  [PurchaseRfqStatus.CANCELLED]: 'Cancelada',
};

export interface RfqPdfLineInput {
  inventoryItemId: string | null;
  freeTextDescription: string | null;
  quantityRequested: string;
  unitOfMeasure: string;
}

export interface RfqPdfDocumentInput {
  rfqNumber: string;
  requestNumber: string;
  requestTitle: string;
  currency: string;
  responseDeadline: string | null;
  status: string;
  notes: string | null;
  supplierNames: string[];
  directedToName?: string | null;
  contact?: {
    contactEmail: string;
    phone: string | null;
    legalName: string | null;
  } | null;
  lines: RfqPdfLineInput[];
  itemLabels: Map<string, string>;
}

export function getRfqStatusLabel(status: string): string {
  if (Object.values(PurchaseRfqStatus).includes(status as PurchaseRfqStatus)) {
    return PURCHASE_RFQ_STATUS_LABELS[status as PurchaseRfqStatus];
  }
  return status;
}

function formatDeadline(responseDeadline: string | null): string {
  if (!responseDeadline) {
    return 'Sin fecha límite';
  }
  return new Date(`${responseDeadline}T00:00:00`).toLocaleDateString('es-CO');
}

function lineLabel(line: RfqPdfLineInput, itemLabels: Map<string, string>): string {
  return (
    line.freeTextDescription?.trim() ??
    (line.inventoryItemId ? itemLabels.get(line.inventoryItemId) : null) ??
    'Línea de solicitud'
  );
}

/**
 * Metadatos buscables de la RFQ: se normalizan a ASCII con el
 * `toAsciiMetadata` compartido de `pdf-branding.ts`, igual que el PDF de orden
 * de compra. El contenido visible conserva los acentos; solo
 * Title/Subject/Keywords los pierden. La normalización se aplica sobre la
 * cadena ya compuesta (el condicional de `Subject`, el `join` de `Keywords`)
 * para no alterar cómo se arman.
 */
function applySearchableMetadata(doc: PDFKit.PDFDocument, input: RfqPdfDocumentInput): void {
  const directed = input.directedToName?.trim() || '';
  const suppliers = input.supplierNames.join(';');
  const contactBits = [
    input.contact?.legalName?.trim(),
    input.contact?.contactEmail,
    input.contact?.phone?.trim(),
  ]
    .filter(Boolean)
    .join(';');

  doc.info.Title = toAsciiMetadata(`Solicitud de cotizacion ${input.rfqNumber}`);
  doc.info.Author = 'iWana neXt';
  doc.info.Subject = toAsciiMetadata(
    directed ? `Cotizacion dirigida a: ${directed}` : `Solicitud de cotizacion ${input.rfqNumber}`,
  );
  doc.info.Keywords = toAsciiMetadata(
    [
      'Destinatario',
      suppliers,
      directed,
      'Descripcion',
      'Cantidad',
      'UdM',
      contactBits,
      'Documento generado por iWana neXt',
      input.rfqNumber,
      getRfqStatusLabel(input.status),
    ]
      .filter(Boolean)
      .join(';'),
  );
}

/**
 * Exportada para test por el mismo motivo que su gemela de orden de compra:
 * el invariante de paginación (ninguna fila después de un salto se dibuja con
 * la coordenada de la página anterior) solo es observable espiando `doc.text`.
 */
export function drawLinesTable(
  doc: PDFKit.PDFDocument,
  input: RfqPdfDocumentInput,
  startY: number,
): number {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colDesc = contentWidth * 0.62;
  const colQty = contentWidth * 0.18;
  const colUom = contentWidth * 0.2;
  let y = startY;

  doc
    .fillColor(PDF_BRAND_TOKENS.primary)
    .font(PDF_FONT.semibold)
    .fontSize(12)
    .text('Líneas solicitadas', margin, y);
  y = doc.y + 8;

  const headerH = 18;
  doc.save();
  doc.rect(margin, y, contentWidth, headerH).fill(PDF_BRAND_TOKENS.primary);
  doc.restore();

  doc
    .fillColor(PDF_BRAND_TOKENS.white)
    .font(PDF_FONT.semibold)
    .fontSize(9)
    .text('Descripción', margin + 6, y + 4, { width: colDesc - 12 })
    .text('Cantidad', margin + colDesc, y + 4, { width: colQty - 6, align: 'right' })
    .text('UdM', margin + colDesc + colQty, y + 4, { width: colUom - 6, align: 'left' });

  y += headerH;

  if (input.lines.length === 0) {
    doc
      .fillColor(PDF_BRAND_TOKENS.primary)
      .font(PDF_FONT.regular)
      .fontSize(9)
      .text('Sin líneas solicitadas.', margin + 6, y + 8);
    return y + 28;
  }

  for (const line of input.lines) {
    const label = lineLabel(line, input.itemLabels);
    doc.font(PDF_FONT.regular).fontSize(9).fillColor(PDF_BRAND_TOKENS.primary);
    const labelHeight = doc.heightOfString(label, { width: colDesc - 12 });
    const rowHeight = Math.max(18, labelHeight + 8);

    if (y + rowHeight > doc.page.height - 72) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    // `rowTop` se deriva DESPUÉS del posible salto de página. Calculado antes,
    // conservaba la coordenada de la página anterior y la primera fila de cada
    // página nueva se dibujaba encabalgada sobre el membrete.
    //
    // La paridad con `purchase-order-pdf.layout.ts` alcanza SOLO a esta regla:
    // aquel repite además la cabecera en cada página y este no, así que una
    // tabla de RFQ partida deja las columnas sin rótulo a partir de la página 2
    // (deuda conocida, no la afirma ningún test para no fijarla como correcta).
    const rowTop = y + 4;

    doc
      .font(PDF_FONT.regular)
      .fontSize(9)
      .fillColor(PDF_BRAND_TOKENS.primary)
      .text(label, margin + 6, rowTop, { width: colDesc - 12 });

    doc
      .font(PDF_FONT.mono)
      .fontSize(9)
      .text(line.quantityRequested, margin + colDesc, rowTop, {
        width: colQty - 6,
        align: 'right',
      });

    doc
      .font(PDF_FONT.regular)
      .fontSize(9)
      .text(line.unitOfMeasure, margin + colDesc + colQty, rowTop, {
        width: colUom - 6,
      });

    y += rowHeight;
    doc
      .strokeColor(PDF_BRAND_TOKENS.hairline)
      .lineWidth(0.4)
      .moveTo(margin, y)
      .lineTo(margin + contentWidth, y)
      .stroke();
  }

  return y + 12;
}

export function buildRfqPdfDocument(input: RfqPdfDocumentInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 48;
    const doc = new PDFDocument({
      size: 'A4',
      compress: false,
      bufferPages: true,
      // Reserva franja inferior para el pie; el membrete usa withOpenVerticalMargins.
      margins: { top: 96, bottom: 56, left: margin, right: margin },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerBrandFonts(doc);
    applySearchableMetadata(doc, input);

    const pageWidth = doc.page.width;
    let y = drawBrandHeader(doc, pageWidth, margin, 'Solicitud de cotización');

    doc.x = margin;
    doc.y = y;

    doc.fillColor(PDF_BRAND_TOKENS.primary).font(PDF_FONT.regular).fontSize(10);
    doc.font(PDF_FONT.mono).text(`Número: ${input.rfqNumber}`);
    doc.font(PDF_FONT.regular).text(`Solicitud: ${input.requestNumber} — ${input.requestTitle}`);
    doc.font(PDF_FONT.mono).text(`Moneda: ${input.currency}`);
    doc.font(PDF_FONT.regular).text(`Fecha límite: ${formatDeadline(input.responseDeadline)}`);
    doc.text(`Estado: ${getRfqStatusLabel(input.status)}`);

    if (input.directedToName?.trim()) {
      doc.moveDown(0.5);
      doc
        .font(PDF_FONT.semibold)
        .fontSize(11)
        .fillColor(PDF_BRAND_TOKENS.primary)
        .text(`Cotización dirigida a: ${input.directedToName.trim()}`);
    }

    if (input.notes?.trim()) {
      doc.moveDown(0.4);
      doc
        .font(PDF_FONT.regular)
        .fontSize(10)
        .fillColor(PDF_BRAND_TOKENS.primary)
        .text(`Notas: ${input.notes.trim()}`);
    }

    doc.moveDown(0.7);
    doc
      .font(PDF_FONT.semibold)
      .fontSize(12)
      .fillColor(PDF_BRAND_TOKENS.primary)
      .text('Destinatario');
    doc.moveDown(0.25);
    doc.font(PDF_FONT.regular).fontSize(10);
    if (input.supplierNames.length === 0) {
      doc.text('Sin destinatario.');
    } else {
      input.supplierNames.forEach((name, index) => {
        doc.text(`${index + 1}. ${name}`);
      });
    }

    y = drawLinesTable(doc, input, doc.y + 10);
    doc.x = margin;
    doc.y = y;

    if (input.contact) {
      doc.moveDown(0.3);
      doc.font(PDF_FONT.semibold).fontSize(12).fillColor(PDF_BRAND_TOKENS.primary).text('Contacto');
      doc.moveDown(0.25);
      doc.font(PDF_FONT.regular).fontSize(10);
      if (input.contact.legalName?.trim()) {
        doc.text(`Empresa: ${input.contact.legalName.trim()}`);
      }
      doc.text(`Correo: ${input.contact.contactEmail}`);
      doc.text(`Teléfono: ${input.contact.phone?.trim() || 'No registrado'}`);
    }

    drawBrandFooter(doc, input.rfqNumber);
    doc.end();
  });
}
