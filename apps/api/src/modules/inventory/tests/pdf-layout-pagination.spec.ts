import PDFDocument from 'pdfkit';
import { PurchaseOrderStatus } from '@iwana/shared';
import { registerBrandFonts } from '../services/pdf-branding';
import {
  drawLinesTable as drawPurchaseOrderLines,
  type PurchaseOrderPdfDocumentInput,
} from '../services/purchase-order-pdf.layout';
import {
  drawLinesTable as drawRfqLines,
  type RfqPdfDocumentInput,
} from '../services/rfq-pdf.layout';

/**
 * Invariante de paginación de las tablas de los dos PDF de compras.
 *
 * Por qué este spec existe aparte: el defecto que cubre —`rowTop` calculado
 * ANTES del salto de página y no recalculado, con lo que la primera fila de
 * cada página nueva se dibujaba con la coordenada de la anterior, encabalgada
 * sobre el membrete— ya se perdió una vez al reescribirse un layout, y la
 * suite entera siguió en verde. La razón es que los specs de servicio leen el
 * PDF con `extractPdfSearchableText`, que sobre fuentes TTF embebidas solo
 * alcanza los METADATOS (`Title`, `Subject`, `Keywords`): el cuerpo dibujado
 * va como códigos de glifo. Un documento con el cuerpo en blanco y metadatos
 * correctos pasaría aquellos tests.
 *
 * Por eso aquí no se lee el PDF: se espía el documento. Se envuelve
 * `doc.text()` para registrar la coordenada `y` de cada llamada y se afirma el
 * invariante directamente — determinista, ajeno a glifos y a compresión.
 */

interface DrawnText {
  y: number;
  pageIndex: number;
  text: string;
}

/**
 * Ejecuta `draw` sobre un documento real espiando `text()` y `addPage()`.
 * Devuelve las coordenadas dibujadas con el índice de página de cada una.
 */
function captureDrawnRows(draw: (doc: PDFKit.PDFDocument, startY: number) => void): {
  drawn: DrawnText[];
  pageCount: number;
  marginTop: number;
} {
  const doc = new PDFDocument({
    size: 'A4',
    compress: false,
    bufferPages: true,
    margins: { top: 96, bottom: 56, left: 48, right: 48 },
  });
  // Sin consumir el stream, PDFKit acumula en memoria y `end()` nunca hace
  // falta: este spec no produce un PDF, solo observa las llamadas de dibujo.
  doc.on('data', () => undefined);
  registerBrandFonts(doc);

  const drawn: DrawnText[] = [];
  let pageIndex = 0;
  const originalText = doc.text.bind(doc);
  const originalAddPage = doc.addPage.bind(doc);

  doc.addPage = ((...args: Parameters<typeof originalAddPage>) => {
    pageIndex += 1;
    return originalAddPage(...args);
  }) as typeof doc.addPage;

  // `doc.text` está sobrecargado (con y sin coordenadas); se envuelve con una
  // firma laxa para poder leer el tercer argumento cuando viene.
  const spiedText = (...args: unknown[]): PDFKit.PDFDocument => {
    const y = args[2];
    if (typeof y === 'number') {
      drawn.push({ y, pageIndex, text: typeof args[0] === 'string' ? args[0] : '' });
    }
    return (originalText as unknown as (...rest: unknown[]) => PDFKit.PDFDocument)(...args);
  };
  doc.text = spiedText as unknown as typeof doc.text;

  draw(doc, 200);

  return { drawn, pageCount: pageIndex + 1, marginTop: 96 };
}

/**
 * La cabecera se repite en cada página: una tabla partida sin rótulos deja
 * columnas de cifras sin identificar. Cubre la mutación de suprimir el
 * `drawTableHeader` del salto, que el invariante de monotonía no detecta.
 */
function assertHeaderOnEveryPage(drawn: DrawnText[], pageCount: number): void {
  const pagesWithHeader = new Set(
    drawn.filter((entry) => entry.text === 'Descripción').map((entry) => entry.pageIndex),
  );
  expect(pagesWithHeader.size).toBe(pageCount);
}

/**
 * El invariante: dentro de una misma página, las coordenadas verticales se
 * dibujan de arriba abajo, nunca retrocediendo.
 *
 * Es la formulación que detecta el defecto y no otra. Al heredarse, `rowTop`
 * conserva el valor GRANDE de la página anterior (cerca del pie), así que la
 * primera fila de la página nueva no cae por encima del margen —cae demasiado
 * abajo— y la siguiente vuelve al principio: la secuencia retrocede. Una
 * primera versión de este test afirmaba `y >= marginTop` y pasaba en verde con
 * el defecto reintroducido; se corrigió tras comprobarlo por mutación.
 */
function assertRowsFlowDownwards(drawn: DrawnText[], pageCount: number): void {
  // Si no hubo salto, el test no probaría nada: la guarda es parte del test.
  expect(pageCount).toBeGreaterThanOrEqual(2);

  const regressions: Array<{ pageIndex: number; from: number; to: number }> = [];
  const lastYByPage = new Map<number, number>();
  for (const entry of drawn) {
    const previous = lastYByPage.get(entry.pageIndex);
    if (previous !== undefined && entry.y < previous) {
      regressions.push({ pageIndex: entry.pageIndex, from: previous, to: entry.y });
    }
    lastYByPage.set(entry.pageIndex, entry.y);
  }

  expect(regressions).toEqual([]);
}

describe('Paginación de las tablas de PDF (invariante compartido)', () => {
  // PDFKit embebe TTF reales (Exo2 + JetBrainsMono ~274KB).
  jest.setTimeout(20_000);

  it('orden de compra: ninguna fila cae sobre el membrete tras el salto de página', () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      label: `SKU-${index} · Cable UTP categoría 6 exterior`,
      quantity: '2.00',
      unitCost: '1500.00',
      lineAmount: '3000.00',
    }));
    const input: PurchaseOrderPdfDocumentInput = {
      orderNumber: 'PO-000001',
      requestNumber: 'SC-000001',
      issuedAt: new Date('2026-09-12T10:00:00.000Z'),
      expectedDeliveryDate: '2026-09-20',
      status: PurchaseOrderStatus.APPROVED,
      currency: 'COP',
      subtotalCents: 18000000,
      supplier: { displayName: 'Proveedor Alfa', primaryContact: null, phone: null, city: null },
      notes: null,
      lines,
      contact: null,
    };

    const { drawn, pageCount } = captureDrawnRows((doc, startY) => {
      drawPurchaseOrderLines(doc, input, startY);
    });

    assertRowsFlowDownwards(drawn, pageCount);
    assertHeaderOnEveryPage(drawn, pageCount);
  });

  it('RFQ: ninguna fila cae sobre el membrete tras el salto de página', () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      inventoryItemId: null,
      freeTextDescription: `Línea ${index} · Cable UTP categoría 6 exterior`,
      quantityRequested: '2.00',
      unitOfMeasure: 'UND',
    }));
    const input: RfqPdfDocumentInput = {
      rfqNumber: 'RFQ-000001',
      requestNumber: 'SC-000001',
      requestTitle: 'Compra de material',
      currency: 'COP',
      responseDeadline: '2026-09-20',
      status: 'SENT',
      notes: null,
      supplierNames: ['Proveedor Alfa'],
      lines,
      itemLabels: new Map<string, string>(),
      contact: null,
    };

    const { drawn, pageCount } = captureDrawnRows((doc, startY) => {
      drawRfqLines(doc, input, startY);
    });

    assertRowsFlowDownwards(drawn, pageCount);
    // Sin `assertHeaderOnEveryPage`: el layout de RFQ NO repite la cabecera
    // todavía (deuda registrada). Afirmarlo aquí fijaría el comportamiento
    // defectuoso; afirmar lo contrario daría falsa sensación de paridad.
  });
});
