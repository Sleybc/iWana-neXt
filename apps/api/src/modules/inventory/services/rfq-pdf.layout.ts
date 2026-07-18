import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { PurchaseRfqStatus } from '@iwana/shared';

/** Tokens Firma iWana (hex canónicos de packages/ui globals.css). */
export const RFQ_PDF_TOKENS = {
  primary: '#17163A',
  accent: '#A5C330',
  accentText: '#6A7A1C',
  surfaceSoft: '#F8FAF5',
  hairline: '#AEAEAD',
  white: '#FFFFFF',
} as const;

const FONT_REGULAR = 'Exo2';
const FONT_SEMIBOLD = 'Exo2-SemiBold';
const FONT_BOLD = 'Exo2-Bold';
const FONT_MONO = 'JetBrainsMono';

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

function resolveApiAssetsRoot(): string {
  // Desde src|dist/modules/inventory/services → apps/api
  return join(__dirname, '../../../../assets');
}

function requireAsset(relativePath: string): string {
  const absolute = join(resolveApiAssetsRoot(), relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Asset de PDF RFQ no encontrado: ${absolute}`);
  }
  return absolute;
}

/** Caché de buffers: evita re-leer TTF/PNG en cada PDF bajo carga concurrente (tests CI / ZIP multi-proveedor). */
const assetBufferCache = new Map<string, Buffer>();

function requireAssetBuffer(relativePath: string): Buffer {
  const cached = assetBufferCache.get(relativePath);
  if (cached) {
    return cached;
  }
  const buffer = readFileSync(requireAsset(relativePath));
  assetBufferCache.set(relativePath, buffer);
  return buffer;
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

function registerFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(FONT_REGULAR, requireAssetBuffer('fonts/Exo2-Regular.ttf'));
  doc.registerFont(FONT_SEMIBOLD, requireAssetBuffer('fonts/Exo2-SemiBold.ttf'));
  doc.registerFont(FONT_BOLD, requireAssetBuffer('fonts/Exo2-Bold.ttf'));
  doc.registerFont(FONT_MONO, requireAssetBuffer('fonts/JetBrainsMono-Regular.ttf'));
}

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

  doc.info.Title = `Solicitud de cotizacion ${input.rfqNumber}`;
  doc.info.Author = 'iWana neXt';
  doc.info.Subject = directed
    ? `Cotizacion dirigida a: ${directed}`
    : `Solicitud de cotizacion ${input.rfqNumber}`;
  doc.info.Keywords = [
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
    .join(';');
}

/**
 * PDFKit crea una página nueva si `text()` cae fuera de los márgenes.
 * Al dibujar membrete/pie en la franja de margen hay que anular temporalmente
 * top/bottom para no generar páginas vacías.
 */
function withOpenVerticalMargins(doc: PDFKit.PDFDocument, draw: () => void): void {
  const previousTop = doc.page.margins.top;
  const previousBottom = doc.page.margins.bottom;
  doc.page.margins.top = 0;
  doc.page.margins.bottom = 0;
  try {
    draw();
  } finally {
    doc.page.margins.top = previousTop;
    doc.page.margins.bottom = previousBottom;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, pageWidth: number, margin: number): number {
  const headerTop = 28;
  const headerHeight = 52;
  const contentWidth = pageWidth - margin * 2;
  let contentStartY = headerTop + headerHeight + 20;

  withOpenVerticalMargins(doc, () => {
    doc.save();
    doc.rect(margin, headerTop, contentWidth, headerHeight).fill(RFQ_PDF_TOKENS.surfaceSoft);
    doc.restore();

    const logoBuffer = requireAssetBuffer('brand/iwiso6.png');
    const logoHeight = 28;
    doc.image(logoBuffer, margin + 8, headerTop + 12, { height: logoHeight });

    doc
      .fillColor(RFQ_PDF_TOKENS.primary)
      .font(FONT_BOLD)
      .fontSize(16)
      .text('Solicitud de cotización', margin + 56, headerTop + 16, {
        width: contentWidth - 64,
        align: 'left',
        lineBreak: false,
      });

    const barY = headerTop + headerHeight + 4;
    doc.save();
    doc.rect(margin, barY, contentWidth, 3.5).fill(RFQ_PDF_TOKENS.accent);
    doc.restore();

    contentStartY = barY + 16;
  });

  return contentStartY;
}

function drawFooter(doc: PDFKit.PDFDocument, rfqNumber: string): void {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i += 1) {
    doc.switchToPage(range.start + i);
    withOpenVerticalMargins(doc, () => {
      const bottom = doc.page.height - 28;
      const margin = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc
        .strokeColor(RFQ_PDF_TOKENS.hairline)
        .lineWidth(0.5)
        .moveTo(margin, bottom - 14)
        .lineTo(margin + width, bottom - 14)
        .stroke();

      doc
        .fillColor(RFQ_PDF_TOKENS.primary)
        .font(FONT_REGULAR)
        .fontSize(8)
        .text('Documento generado por iWana neXt', margin, bottom - 8, {
          width: width * 0.55,
          align: 'left',
          lineBreak: false,
        });

      doc
        .font(FONT_MONO)
        .fontSize(8)
        .text(`${rfqNumber}  ·  ${i + 1}/${totalPages}`, margin + width * 0.55, bottom - 8, {
          width: width * 0.45,
          align: 'right',
          lineBreak: false,
        });
    });
  }
}

function drawLinesTable(
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
    .fillColor(RFQ_PDF_TOKENS.primary)
    .font(FONT_SEMIBOLD)
    .fontSize(12)
    .text('Líneas solicitadas', margin, y);
  y = doc.y + 8;

  const headerH = 18;
  doc.save();
  doc.rect(margin, y, contentWidth, headerH).fill(RFQ_PDF_TOKENS.primary);
  doc.restore();

  doc
    .fillColor(RFQ_PDF_TOKENS.white)
    .font(FONT_SEMIBOLD)
    .fontSize(9)
    .text('Descripción', margin + 6, y + 4, { width: colDesc - 12 })
    .text('Cantidad', margin + colDesc, y + 4, { width: colQty - 6, align: 'right' })
    .text('UdM', margin + colDesc + colQty, y + 4, { width: colUom - 6, align: 'left' });

  y += headerH;

  if (input.lines.length === 0) {
    doc
      .fillColor(RFQ_PDF_TOKENS.primary)
      .font(FONT_REGULAR)
      .fontSize(9)
      .text('Sin líneas solicitadas.', margin + 6, y + 8);
    return y + 28;
  }

  for (const line of input.lines) {
    const label = lineLabel(line, input.itemLabels);
    const rowTop = y + 4;
    doc.font(FONT_REGULAR).fontSize(9).fillColor(RFQ_PDF_TOKENS.primary);
    const labelHeight = doc.heightOfString(label, { width: colDesc - 12 });
    const rowHeight = Math.max(18, labelHeight + 8);

    if (y + rowHeight > doc.page.height - 72) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .fillColor(RFQ_PDF_TOKENS.primary)
      .text(label, margin + 6, rowTop, { width: colDesc - 12 });

    doc
      .font(FONT_MONO)
      .fontSize(9)
      .text(line.quantityRequested, margin + colDesc, rowTop, {
        width: colQty - 6,
        align: 'right',
      });

    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .text(line.unitOfMeasure, margin + colDesc + colQty, rowTop, {
        width: colUom - 6,
      });

    y += rowHeight;
    doc
      .strokeColor(RFQ_PDF_TOKENS.hairline)
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

    registerFonts(doc);
    applySearchableMetadata(doc, input);

    const pageWidth = doc.page.width;
    let y = drawHeader(doc, pageWidth, margin);

    doc.x = margin;
    doc.y = y;

    doc.fillColor(RFQ_PDF_TOKENS.primary).font(FONT_REGULAR).fontSize(10);
    doc.font(FONT_MONO).text(`Número: ${input.rfqNumber}`);
    doc.font(FONT_REGULAR).text(`Solicitud: ${input.requestNumber} — ${input.requestTitle}`);
    doc.font(FONT_MONO).text(`Moneda: ${input.currency}`);
    doc.font(FONT_REGULAR).text(`Fecha límite: ${formatDeadline(input.responseDeadline)}`);
    doc.text(`Estado: ${getRfqStatusLabel(input.status)}`);

    if (input.directedToName?.trim()) {
      doc.moveDown(0.5);
      doc
        .font(FONT_SEMIBOLD)
        .fontSize(11)
        .fillColor(RFQ_PDF_TOKENS.primary)
        .text(`Cotización dirigida a: ${input.directedToName.trim()}`);
    }

    if (input.notes?.trim()) {
      doc.moveDown(0.4);
      doc
        .font(FONT_REGULAR)
        .fontSize(10)
        .fillColor(RFQ_PDF_TOKENS.primary)
        .text(`Notas: ${input.notes.trim()}`);
    }

    doc.moveDown(0.7);
    doc.font(FONT_SEMIBOLD).fontSize(12).fillColor(RFQ_PDF_TOKENS.primary).text('Destinatario');
    doc.moveDown(0.25);
    doc.font(FONT_REGULAR).fontSize(10);
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
      doc.font(FONT_SEMIBOLD).fontSize(12).fillColor(RFQ_PDF_TOKENS.primary).text('Contacto');
      doc.moveDown(0.25);
      doc.font(FONT_REGULAR).fontSize(10);
      if (input.contact.legalName?.trim()) {
        doc.text(`Empresa: ${input.contact.legalName.trim()}`);
      }
      doc.text(`Correo: ${input.contact.contactEmail}`);
      doc.text(`Teléfono: ${input.contact.phone?.trim() || 'No registrado'}`);
    }

    drawFooter(doc, input.rfqNumber);
    doc.end();
  });
}
