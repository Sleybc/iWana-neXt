import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Marca compartida de los documentos PDF del módulo de compras (Fase 31):
 * tokens, fuentes, logo, membrete y pie que consumen `rfq-pdf.layout.ts` y
 * `purchase-order-pdf.layout.ts`. Único dueño de los assets para que ambos
 * documentos no diverjan.
 */

/** Tokens Firma iWana (hex canónicos de packages/ui globals.css). */
export const PDF_BRAND_TOKENS = {
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

/** Nombres registrados por `registerBrandFonts`, para que cada layout componga su texto con la misma familia. */
export const PDF_FONT = {
  regular: FONT_REGULAR,
  semibold: FONT_SEMIBOLD,
  bold: FONT_BOLD,
  mono: FONT_MONO,
} as const;

/**
 * PDFKit serializa una cadena de metadatos como UTF-16 en cuanto contiene un
 * carácter fuera de ASCII —el umbral real es `charCodeAt(i) > 0x7F`, no
 * latin1—, y entonces TODA la cadena deja de ser buscable como texto. El matiz
 * importa: `á` (U+00E1) y `ñ` (U+00F1) SÍ son latin1 y aun así disparan la
 * conversión, que es justamente por lo que esta normalización hace falta. Por eso los metadatos del documento (`Title`, `Subject`, `Keywords`)
 * se normalizan a ASCII sin diacríticos: el contenido visible del PDF conserva
 * los acentos, solo los metadatos los pierden.
 *
 * Lo aplican los dos PDF del módulo de compras (`rfq-pdf.layout.ts` y
 * `purchase-order-pdf.layout.ts`); vive aquí para que no vuelvan a divergir.
 * Normalizar siempre el resultado final ya compuesto —no cada fragmento— para
 * no alterar la composición de la cadena.
 */
export function toAsciiMetadata(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function resolveApiAssetsRoot(): string {
  // Desde src|dist/modules/inventory/services → apps/api
  return join(__dirname, '../../../../assets');
}

function requireAsset(relativePath: string): string {
  const absolute = join(resolveApiAssetsRoot(), relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Asset de PDF no encontrado: ${absolute}`);
  }
  return absolute;
}

/** Caché de buffers: evita re-leer TTF/PNG en cada PDF bajo carga concurrente (tests CI / ZIP multi-documento). */
const assetBufferCache = new Map<string, Buffer>();

export function requireAssetBuffer(relativePath: string): Buffer {
  const cached = assetBufferCache.get(relativePath);
  if (cached) {
    return cached;
  }
  const buffer = readFileSync(requireAsset(relativePath));
  assetBufferCache.set(relativePath, buffer);
  return buffer;
}

export function registerBrandFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(FONT_REGULAR, requireAssetBuffer('fonts/Exo2-Regular.ttf'));
  doc.registerFont(FONT_SEMIBOLD, requireAssetBuffer('fonts/Exo2-SemiBold.ttf'));
  doc.registerFont(FONT_BOLD, requireAssetBuffer('fonts/Exo2-Bold.ttf'));
  doc.registerFont(FONT_MONO, requireAssetBuffer('fonts/JetBrainsMono-Regular.ttf'));
}

/**
 * PDFKit crea una página nueva si `text()` cae fuera de los márgenes.
 * Al dibujar membrete/pie en la franja de margen hay que anular temporalmente
 * top/bottom para no generar páginas vacías.
 */
export function withOpenVerticalMargins(doc: PDFKit.PDFDocument, draw: () => void): void {
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

/** Membrete con banda suave, logo, título del documento y barra accent. Devuelve el Y donde inicia el contenido. */
export function drawBrandHeader(
  doc: PDFKit.PDFDocument,
  pageWidth: number,
  margin: number,
  title: string,
): number {
  const headerTop = 28;
  const headerHeight = 52;
  const contentWidth = pageWidth - margin * 2;
  let contentStartY = headerTop + headerHeight + 20;

  withOpenVerticalMargins(doc, () => {
    doc.save();
    doc.rect(margin, headerTop, contentWidth, headerHeight).fill(PDF_BRAND_TOKENS.surfaceSoft);
    doc.restore();

    const logoBuffer = requireAssetBuffer('brand/iwiso6.png');
    const logoHeight = 28;
    doc.image(logoBuffer, margin + 8, headerTop + 12, { height: logoHeight });

    doc
      .fillColor(PDF_BRAND_TOKENS.primary)
      .font(FONT_BOLD)
      .fontSize(16)
      .text(title, margin + 56, headerTop + 16, {
        width: contentWidth - 64,
        align: 'left',
        lineBreak: false,
      });

    const barY = headerTop + headerHeight + 4;
    doc.save();
    doc.rect(margin, barY, contentWidth, 3.5).fill(PDF_BRAND_TOKENS.accent);
    doc.restore();

    contentStartY = barY + 16;
  });

  return contentStartY;
}

/** Pie en todas las páginas: hairline, «Documento generado por iWana neXt» y numeración `documento · i/total`. */
export function drawBrandFooter(doc: PDFKit.PDFDocument, documentNumber: string): void {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i += 1) {
    doc.switchToPage(range.start + i);
    withOpenVerticalMargins(doc, () => {
      const bottom = doc.page.height - 28;
      const margin = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc
        .strokeColor(PDF_BRAND_TOKENS.hairline)
        .lineWidth(0.5)
        .moveTo(margin, bottom - 14)
        .lineTo(margin + width, bottom - 14)
        .stroke();

      doc
        .fillColor(PDF_BRAND_TOKENS.primary)
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
        .text(`${documentNumber}  ·  ${i + 1}/${totalPages}`, margin + width * 0.55, bottom - 8, {
          width: width * 0.45,
          align: 'right',
          lineBreak: false,
        });
    });
  }
}
