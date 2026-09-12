import PDFDocument from 'pdfkit';
import { PurchaseOrderStatus } from '@iwana/shared';
import {
  PDF_BRAND_TOKENS,
  PDF_FONT,
  drawBrandFooter,
  drawBrandHeader,
  registerBrandFonts,
} from './pdf-branding';

/**
 * Layout del PDF de orden de compra (MOD12 Compras, Fase 31): documento que el
 * operador descarga y envía al proveedor por su canal habitual. Marca y
 * estructura calcadas del PDF de RFQ (`pdf-branding.ts` compartido).
 *
 * La orden no persiste moneda: si el servicio la resuelve (todas las líneas
 * derivan de cotizaciones de la misma moneda) se muestra; si no, se omite —
 * nunca se inventa.
 */

const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: 'Borrador',
  [PurchaseOrderStatus.PENDING_APPROVAL]: 'Pendiente de aprobación',
  [PurchaseOrderStatus.APPROVED]: 'Aprobada',
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: 'Recibida parcialmente',
  [PurchaseOrderStatus.FULLY_RECEIVED]: 'Recibida',
  [PurchaseOrderStatus.CANCELLED]: 'Cancelada',
  [PurchaseOrderStatus.CLOSED]: 'Cerrada',
};

export function getPurchaseOrderStatusLabel(status: string): string {
  if (Object.values(PurchaseOrderStatus).includes(status as PurchaseOrderStatus)) {
    return PURCHASE_ORDER_STATUS_LABELS[status as PurchaseOrderStatus];
  }
  return status;
}

export interface PurchaseOrderPdfLineInput {
  /** Etiqueta compuesta por el servicio (SKU · nombre del ítem). */
  label: string;
  quantity: string;
  unitCost: string;
  lineAmount: string;
}

export interface PurchaseOrderPdfDocumentInput {
  orderNumber: string;
  requestNumber: string | null;
  issuedAt: Date;
  expectedDeliveryDate: string | null;
  status: PurchaseOrderStatus;
  /** Moneda resuelta; null = no determinable o mixta (se omite en el documento). */
  currency: string | null;
  /** Subtotal exacto en céntimos (compuesto por el servicio con aritmética entera). */
  subtotalCents: number;
  supplier: {
    displayName: string;
    primaryContact: string | null;
    phone: string | null;
    city: string | null;
  };
  notes: string | null;
  lines: PurchaseOrderPdfLineInput[];
  contact?: {
    contactEmail: string;
    phone: string | null;
    legalName: string | null;
  } | null;
}

const numberFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmountCents(cents: number): string {
  return numberFormatter.format(cents / 100);
}

function parseDecimalCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function formatDateOnly(value: string | null): string {
  if (!value) {
    return 'Sin fecha';
  }
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO');
}

/**
 * PDFKit serializa una cadena de metadatos como UTF-16 en cuanto contiene un
 * carácter no latino1, y toda la cadena deja de ser buscable como texto. Los
 * metadatos del documento se normalizan a ASCII (sin diacríticos), mismo
 * criterio del PDF de RFQ: el contenido visible conserva los acentos, los
 * metadatos los pierden.
 */
function toAsciiMetadata(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function applySearchableMetadata(
  doc: PDFKit.PDFDocument,
  input: PurchaseOrderPdfDocumentInput,
): void {
  const supplierBits = [
    input.supplier.displayName,
    input.supplier.primaryContact?.trim(),
    input.supplier.phone?.trim(),
    input.supplier.city?.trim(),
  ]
    .filter(Boolean)
    .join(';');
  const contactBits = [
    input.contact?.legalName?.trim(),
    input.contact?.contactEmail,
    input.contact?.phone?.trim(),
  ]
    .filter(Boolean)
    .join(';');

  doc.info.Title = toAsciiMetadata(`Orden de compra ${input.orderNumber}`);
  doc.info.Author = 'iWana neXt';
  doc.info.Subject = toAsciiMetadata(`Proveedor: ${input.supplier.displayName}`);
  doc.info.Keywords = toAsciiMetadata(
    [
      'Orden de compra',
      input.orderNumber,
      input.requestNumber,
      input.currency ? `Moneda ${input.currency}` : null,
      'Proveedor',
      supplierBits,
      'Descripcion',
      'Cantidad',
      'Costo unitario',
      'Importe',
      contactBits,
      'Documento generado por iWana neXt',
      getPurchaseOrderStatusLabel(input.status),
    ]
      .filter(Boolean)
      .join(';'),
  );
}

function drawLinesTable(
  doc: PDFKit.PDFDocument,
  input: PurchaseOrderPdfDocumentInput,
  startY: number,
): number {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colDesc = contentWidth * 0.46;
  const colQty = contentWidth * 0.15;
  const colCost = contentWidth * 0.19;
  const colAmount = contentWidth * 0.2;
  let y = startY;

  doc
    .fillColor(PDF_BRAND_TOKENS.primary)
    .font(PDF_FONT.semibold)
    .fontSize(12)
    .text('Líneas de la orden', margin, y);
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
    .text('Costo unitario', margin + colDesc + colQty, y + 4, {
      width: colCost - 6,
      align: 'right',
    })
    .text('Importe', margin + colDesc + colQty + colCost, y + 4, {
      width: colAmount - 6,
      align: 'right',
    });

  y += headerH;

  if (input.lines.length === 0) {
    doc
      .fillColor(PDF_BRAND_TOKENS.primary)
      .font(PDF_FONT.regular)
      .fontSize(9)
      .text('Sin líneas en la orden.', margin + 6, y + 8);
    return y + 28;
  }

  for (const line of input.lines) {
    const rowTop = y + 4;
    doc.font(PDF_FONT.regular).fontSize(9).fillColor(PDF_BRAND_TOKENS.primary);
    const labelHeight = doc.heightOfString(line.label, { width: colDesc - 12 });
    const rowHeight = Math.max(18, labelHeight + 8);

    if (y + rowHeight > doc.page.height - 72) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc
      .font(PDF_FONT.regular)
      .fontSize(9)
      .fillColor(PDF_BRAND_TOKENS.primary)
      .text(line.label, margin + 6, rowTop, { width: colDesc - 12 });

    doc
      .font(PDF_FONT.mono)
      .fontSize(9)
      .text(line.quantity, margin + colDesc, rowTop, { width: colQty - 6, align: 'right' });

    doc
      .font(PDF_FONT.mono)
      .fontSize(9)
      .text(
        formatAmountCents(parseDecimalCents(line.unitCost)),
        margin + colDesc + colQty,
        rowTop,
        {
          width: colCost - 6,
          align: 'right',
        },
      );

    doc
      .font(PDF_FONT.mono)
      .fontSize(9)
      .text(
        formatAmountCents(parseDecimalCents(line.lineAmount)),
        margin + colDesc + colQty + colCost,
        rowTop,
        { width: colAmount - 6, align: 'right' },
      );

    y += rowHeight;
    doc
      .strokeColor(PDF_BRAND_TOKENS.hairline)
      .lineWidth(0.4)
      .moveTo(margin, y)
      .lineTo(margin + contentWidth, y)
      .stroke();
  }

  doc.moveDown(0.4);
  y = doc.y + 6;
  doc
    .fillColor(PDF_BRAND_TOKENS.primary)
    .font(PDF_FONT.semibold)
    .fontSize(10)
    .text('Subtotal', margin, y, { width: contentWidth - 120, align: 'left' });
  doc
    .font(PDF_FONT.mono)
    .fontSize(10)
    .text(formatAmountCents(input.subtotalCents), margin + contentWidth - 120, y, {
      width: 120,
      align: 'right',
    });

  return doc.y + 12;
}

export function buildPurchaseOrderPdfDocument(
  input: PurchaseOrderPdfDocumentInput,
): Promise<Buffer> {
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
    let y = drawBrandHeader(doc, pageWidth, margin, 'Orden de compra');

    doc.x = margin;
    doc.y = y;

    doc.fillColor(PDF_BRAND_TOKENS.primary).font(PDF_FONT.regular).fontSize(10);
    doc.font(PDF_FONT.mono).text(`Número: ${input.orderNumber}`);
    if (input.requestNumber) {
      doc.font(PDF_FONT.regular).text(`Solicitud: ${input.requestNumber}`);
    }
    doc
      .font(PDF_FONT.regular)
      .text(`Fecha de emisión: ${input.issuedAt.toLocaleDateString('es-CO')}`);
    doc
      .font(PDF_FONT.regular)
      .text(`Entrega esperada: ${formatDateOnly(input.expectedDeliveryDate)}`);
    doc.text(`Estado: ${getPurchaseOrderStatusLabel(input.status)}`);
    if (input.currency) {
      doc.font(PDF_FONT.mono).text(`Moneda: ${input.currency}`);
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
    doc.font(PDF_FONT.semibold).fontSize(12).fillColor(PDF_BRAND_TOKENS.primary).text('Proveedor');
    doc.moveDown(0.25);
    doc.font(PDF_FONT.regular).fontSize(10);
    doc.text(input.supplier.displayName);
    if (input.supplier.primaryContact?.trim()) {
      doc.text(`Contacto: ${input.supplier.primaryContact.trim()}`);
    }
    if (input.supplier.phone?.trim()) {
      doc.text(`Teléfono: ${input.supplier.phone.trim()}`);
    }
    if (input.supplier.city?.trim()) {
      doc.text(`Ciudad: ${input.supplier.city.trim()}`);
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

    drawBrandFooter(doc, input.orderNumber);
    doc.end();
  });
}
