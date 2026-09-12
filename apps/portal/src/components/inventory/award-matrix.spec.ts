/**
 * Cobertura de la lógica pura de la matriz de adjudicación (Fase 30, FE-1).
 * Fixtures del caso canónico de la spec: productos P1..P4, cotizaciones
 * Q1 (proveedor 1) y Q2 (proveedor 2). La adjudicación canónica es
 * P1+P3 → proveedor 1 y P2+P4 → proveedor 2 (dos órdenes de compra).
 */

import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type {
  InventoryItemRecord,
  PurchaseOrderRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestLineAwardRecord,
  PurchaseRequestLineRecord,
  PurchaseRequestRecord,
  SupplierQuoteLineRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';
import type { AwardMatrixCell, AwardMatrixRow } from '@iwana/shared';
import type { AwardMatrixState } from './award-matrix';
import {
  assignQuoteColumn,
  buildAwardMatrix,
  getAwardEmptySelectionNotice,
  getAwardMatrixProgress,
  moveAwardToQuote,
  setLineQuantity,
  summarizeBySupplier,
  toCreateAwardsDto,
  toggleCell,
  validateMatrixSelection,
} from './award-matrix';

const TENANT_ID = 'tenant-001';
const REQUEST_ID = 'pr-001';
const NOW = '2026-09-11T00:00:00.000Z';

/**
 * Accesos estrictos para las aserciones: fallan con mensaje claro en vez de
 * propagar `undefined` (el tsconfig exige noUncheckedIndexedAccess).
 */
function rowOf(state: AwardMatrixState, lineId: string): AwardMatrixRow {
  const row = state.rows.find((entry) => entry.purchaseRequestLineId === lineId);
  if (!row) {
    throw new Error(`Fila ${lineId} ausente en la matriz`);
  }
  return row;
}

function cellOf(state: AwardMatrixState, lineId: string, quoteId: string): AwardMatrixCell {
  const cell = rowOf(state, lineId).cells[quoteId];
  if (!cell) {
    throw new Error(`Celda (${lineId}, ${quoteId}) ausente en la matriz`);
  }
  return cell;
}

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Índice ${index} fuera de rango`);
  }
  return item;
}

function makeRequest(overrides?: Partial<PurchaseRequestRecord>): PurchaseRequestRecord {
  return {
    id: REQUEST_ID,
    tenantId: TENANT_ID,
    requestNumber: 'PR-1',
    title: 'Solicitud canónica',
    status: PurchaseRequestStatus.APPROVED,
    requestType: PurchaseRequestType.REPLENISHMENT,
    priority: PurchaseRequestPriority.NORMAL,
    requestedByUserId: 'user-1',
    requestingArea: null,
    justification: null,
    operationalRefType: null,
    operationalRefId: null,
    exceptionReason: null,
    approvedByUserId: 'user-1',
    neededByDate: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeLine(
  id: string,
  overrides?: Partial<PurchaseRequestLineRecord>,
): PurchaseRequestLineRecord {
  return {
    id,
    tenantId: TENANT_ID,
    purchaseRequestId: REQUEST_ID,
    sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    inventoryItemId: `item-${id}`,
    freeTextDescription: null,
    quantityRequested: '1.00',
    unitOfMeasure: 'unidad',
    suggestedPartyRefId: null,
    lineStatus: PurchaseRequestLineStatus.OPEN,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeItem(id: string, name: string, sku: string): InventoryItemRecord {
  return {
    id,
    tenantId: TENANT_ID,
    sku,
    name,
    description: null,
    brand: null,
    model: null,
    itemKind: InventoryItemKind.CONSUMABLE,
    category: InventoryItemCategory.MATERIALS,
    categoryId: 'cat-1',
    categoryName: 'Materiales',
    categoryCode: 'MAT',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'unidad',
    baseCost: '0.00',
    minimumStock: '0.00',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: false,
    preferredSupplierRefId: null,
    supplierSku: null,
    purchaseUnitOfMeasure: null,
    purchaseToBaseUomFactor: null,
    standardCost: '0.00',
    lastPurchaseCost: null,
    averageCost: '0.00',
    reorderPoint: '0.00',
    targetStock: '0.00',
    minimumOrderQty: null,
    orderMultiple: null,
    leadTimeDays: null,
    usefulLifeMonths: null,
    commercialReferenceId: null,
    status: InventoryItemStatus.ACTIVE,
    barcode: null,
    barcodeType: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeQuoteLine(
  supplierQuoteId: string,
  purchaseRequestLineId: string,
  unitCost: string,
): SupplierQuoteLineRecord {
  return {
    id: `ql-${supplierQuoteId}-${purchaseRequestLineId}`,
    tenantId: TENANT_ID,
    supplierQuoteId,
    purchaseRequestLineId,
    quantity: '1.00',
    unitCost,
    lineAmount: unitCost,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeQuote(
  id: string,
  partyRefId: string,
  quoteNumber: string,
  currency: string,
  costsByLine: Record<string, string>,
  overrides?: Partial<SupplierQuoteRecord>,
): SupplierQuoteRecord {
  const lines = Object.entries(costsByLine).map(([lineId, unitCost]) =>
    makeQuoteLine(id, lineId, unitCost),
  );
  const total = lines.reduce((sum, line) => sum + Number(line.lineAmount), 0);
  const payable = total.toFixed(2);

  return {
    id,
    tenantId: TENANT_ID,
    purchaseRequestId: REQUEST_ID,
    partyRefId,
    quoteNumber,
    amount: payable,
    shippingCost: '0.00',
    currency,
    validUntil: null,
    notes: null,
    lines,
    payableAmount: payable,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeAward(
  id: string,
  purchaseRequestLineId: string,
  awardedPartyRefId: string,
  supplierQuoteId: string | null,
  awardedQuantity: string,
): PurchaseRequestLineAwardRecord {
  return {
    id,
    tenantId: TENANT_ID,
    purchaseRequestLineId,
    supplierQuoteId,
    awardedPartyRefId,
    awardedQuantity,
    awardNotes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeOrder(
  id: string,
  partyRefId: string,
  status: PurchaseOrderStatus,
): PurchaseOrderRecord {
  return {
    id,
    tenantId: TENANT_ID,
    orderNumber: `OC-${id}`,
    purchaseRequestId: REQUEST_ID,
    partyRefId,
    status,
    expectedDeliveryDate: null,
    approvedByUserId: null,
    cancellationReason: null,
    cancelledByUserId: null,
    closedByUserId: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/**
 * Caso canónico (spec §1): P1..P4 libres; Q1 y Q2 cubren las cuatro líneas.
 * Precios: Q1 gana en P1 (100 vs 110) y P3 (300 vs 320); Q2 gana en
 * P2 (180 vs 200) y P4 (390 vs 400).
 */
function buildCanonicalDetail(overrides?: {
  request?: Partial<PurchaseRequestRecord>;
  lines?: PurchaseRequestLineRecord[];
  quotes?: SupplierQuoteRecord[];
  awards?: PurchaseRequestLineAwardRecord[];
  orders?: PurchaseOrderRecord[];
}): PurchaseRequestDetailRecord {
  return {
    request: makeRequest(overrides?.request),
    lines: overrides?.lines ?? [
      makeLine('line-p1'),
      makeLine('line-p2'),
      makeLine('line-p3'),
      makeLine('line-p4'),
    ],
    quotes: overrides?.quotes ?? [
      makeQuote('quote-1', 'party-1', 'COT-1', 'COP', {
        'line-p1': '100.00',
        'line-p2': '200.00',
        'line-p3': '300.00',
        'line-p4': '400.00',
      }),
      makeQuote('quote-2', 'party-2', 'COT-2', 'COP', {
        'line-p1': '110.00',
        'line-p2': '180.00',
        'line-p3': '320.00',
        'line-p4': '390.00',
      }),
    ],
    awards: overrides?.awards ?? [],
    orders: overrides?.orders ?? [],
    estimatedAmount: 1000,
    approvalPolicy: {
      canApprove: true,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'LEVEL_1',
    },
    rfq: null,
  };
}

const SUPPLIER_LABELS = { 'party-1': 'Proveedor 1', 'party-2': 'Proveedor 2' };

function buildItems(detail: PurchaseRequestDetailRecord): InventoryItemRecord[] {
  return detail.lines
    .filter(
      (line): line is PurchaseRequestLineRecord & { inventoryItemId: string } =>
        line.inventoryItemId !== null,
    )
    .map((line, index) =>
      makeItem(line.inventoryItemId, `Producto ${index + 1}`, `SKU-${index + 1}`),
    );
}

describe('buildAwardMatrix', () => {
  it('construye una columna por cotización con proveedor, número, moneda y payableAmount', () => {
    const detail = buildCanonicalDetail();
    const state = buildAwardMatrix(detail, buildItems(detail), { supplierLabels: SUPPLIER_LABELS });

    expect(state.columns).toHaveLength(2);
    expect(at(state.columns, 0)).toMatchObject({
      quoteId: 'quote-1',
      supplierPartyRefId: 'party-1',
      supplierLabel: 'Proveedor 1',
      quoteNumber: 'COT-1',
      currency: 'COP',
      payableAmount: '1000.00',
    });
    expect(at(state.columns, 1).supplierLabel).toBe('Proveedor 2');
    expect(at(state.columns, 0).lines['line-p1']).toEqual({
      unitCost: '100.00',
      lineAmount: '100.00',
    });
  });

  it('usa el amount como payableAmount de reserva en cotizaciones legacy sin neto a pagar', () => {
    const quoted = makeQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' });
    const legacy: SupplierQuoteRecord = { ...quoted };
    // Simula una cotización previa a la columna payableAmount (Fase 25).
    delete legacy.payableAmount;

    const detail = buildCanonicalDetail({ quotes: [legacy] });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(at(state.columns, 0).payableAmount).toBe('100.00');
  });

  it('deja las celdas cubiertas como disponibles y las no cubiertas como sin-cotizar', () => {
    const detail = buildCanonicalDetail({
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', {
          'line-p1': '100.00',
          'line-p2': '200.00',
          'line-p3': '300.00',
          'line-p4': '400.00',
        }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'COP', {
          'line-p1': '110.00',
          'line-p2': '180.00',
          // quote-2 no cubre line-p3 ni line-p4
        }),
      ],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.rows).toHaveLength(4);
    expect(cellOf(state, 'line-p1', 'quote-1').state).toBe('disponible');
    expect(cellOf(state, 'line-p1', 'quote-1').cheapest).toBe(true);
    expect(cellOf(state, 'line-p3', 'quote-1')).toEqual({ state: 'disponible' });
    expect(cellOf(state, 'line-p3', 'quote-2')).toEqual({ state: 'sin-cotizar' });
  });

  it('marca «Más barato» solo en la celda de menor costo cuando la moneda es compartida', () => {
    const detail = buildCanonicalDetail();
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.currencyMixed).toBe(false);
    expect(cellOf(state, 'line-p1', 'quote-1')).toEqual({ state: 'disponible', cheapest: true });
    expect(cellOf(state, 'line-p1', 'quote-2').cheapest).toBeUndefined();
    // P2: Q2 (180) es más barata que Q1 (200)
    expect(cellOf(state, 'line-p2', 'quote-2')).toEqual({ state: 'disponible', cheapest: true });
    expect(cellOf(state, 'line-p2', 'quote-1').cheapest).toBeUndefined();
  });

  it('no marca «Más barato» ni ordena por precio con monedas mixtas (regla quotesShareCurrency)', () => {
    const detail = buildCanonicalDetail({
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', {
          'line-p1': '100.00',
          'line-p2': '200.00',
          'line-p3': '300.00',
          'line-p4': '400.00',
        }),
        // Precios numéricamente «más baratos» en USD: compararlos induciría
        // una recomendación falsa (spec §6.3).
        makeQuote('quote-2', 'party-2', 'COT-2', 'USD', {
          'line-p1': '0.01',
          'line-p2': '0.02',
          'line-p3': '0.03',
          'line-p4': '0.04',
        }),
      ],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.currencyMixed).toBe(true);
    for (const row of state.rows) {
      for (const cell of Object.values(row.cells)) {
        expect(cell.cheapest).toBeUndefined();
      }
    }
  });

  it('marca toda la fila como adjudicada con award vigente sin orden viva', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.locks['line-p1']).toMatchObject({
      awardId: 'award-1',
      ordered: false,
      awardedPartyRefId: 'party-1',
      awardedQuoteId: 'quote-1',
      splitAcrossAwards: false,
    });
    for (const cell of Object.values(rowOf(state, 'line-p1').cells)) {
      expect(cell.state).toBe('adjudicado');
    }
    expect(rowOf(state, 'line-p1').awardedQuoteId).toBe('quote-1');
    expect(rowOf(state, 'line-p1').awardedPartyRefId).toBe('party-1');
    expect(rowOf(state, 'line-p1').awardedQuantity).toBe('1.00');
  });

  it('marca toda la fila como ordenada cuando hay orden viva del proveedor (lineStatus ordenado + orden no cancelada)', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
      orders: [makeOrder('po-1', 'party-1', PurchaseOrderStatus.APPROVED)],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.locks['line-p1']?.ordered).toBe(true);
    for (const cell of Object.values(rowOf(state, 'line-p1').cells)) {
      expect(cell.state).toBe('ordenado');
    }
  });

  it('degrada a adjudicado cuando la única orden del proveedor está cancelada', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
      orders: [makeOrder('po-1', 'party-1', PurchaseOrderStatus.CANCELLED)],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.locks['line-p1']?.ordered).toBe(false);
    for (const cell of Object.values(rowOf(state, 'line-p1').cells)) {
      expect(cell.state).toBe('adjudicado');
    }
  });

  it('no considera orden viva una orden de OTRO proveedor', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
      orders: [makeOrder('po-1', 'party-2', PurchaseOrderStatus.APPROVED)],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.locks['line-p1']?.ordered).toBe(false);
  });

  it('excluye de la matriz las líneas canceladas, rechazadas y sin producto de catálogo', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1'),
        makeLine('line-p2', { lineStatus: PurchaseRequestLineStatus.CANCELLED }),
        makeLine('line-p3', { lineStatus: PurchaseRequestLineStatus.REJECTED }),
        makeLine('line-free', { inventoryItemId: null, freeTextDescription: 'Servicio externo' }),
        makeLine('line-p4'),
      ],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.rows.map((row) => row.purchaseRequestLineId)).toEqual(['line-p1', 'line-p4']);
    expect(state.locks['line-p2']).toBeUndefined();
  });

  it('edita solo con solicitud aprobada y sin disabled (paridad con el panel actual)', () => {
    const detail = buildCanonicalDetail();
    expect(buildAwardMatrix(detail, buildItems(detail)).canEdit).toBe(true);
    expect(buildAwardMatrix(detail, buildItems(detail), { disabled: true }).canEdit).toBe(false);
    expect(
      buildAwardMatrix(
        buildCanonicalDetail({ request: { status: PurchaseRequestStatus.PENDING_APPROVAL } }),
        buildItems(detail),
      ).canEdit,
    ).toBe(false);
  });

  it('rellena nombre y sku desde el catálogo y arranca sin draft', () => {
    const detail = buildCanonicalDetail();
    const state = buildAwardMatrix(detail, buildItems(detail), { supplierLabels: SUPPLIER_LABELS });

    expect(rowOf(state, 'line-p1')).toMatchObject({
      purchaseRequestLineId: 'line-p1',
      itemName: 'Producto 1',
      sku: 'SKU-1',
      quantityRequested: '1.00',
      unitOfMeasure: 'unidad',
      awardedQuantity: '1.00',
    });
    expect(state.selections).toEqual({});
    expect(state.quantityByLine).toEqual({});
    expect(state.pendingRevokes).toEqual({});
    expect(state.requestType).toBe(PurchaseRequestType.REPLENISHMENT);
  });
});

describe('toggleCell', () => {
  it('marca una celda libre como seleccionada', () => {
    const detail = buildCanonicalDetail();
    const state = buildAwardMatrix(detail, buildItems(detail));
    const next = toggleCell(state, 'line-p1', 'quote-1');

    expect(next.selections).toEqual({ 'line-p1': 'quote-1' });
    expect(cellOf(next, 'line-p1', 'quote-1')).toEqual({ state: 'seleccionado', cheapest: true });
    expect(cellOf(next, 'line-p1', 'quote-2').state).toBe('disponible');
  });

  it('mueve P1 de Q1 a Q2 sin duplicar la marca (CA-UX-02)', () => {
    const detail = buildCanonicalDetail();
    const state = toggleCell(buildAwardMatrix(detail, buildItems(detail)), 'line-p1', 'quote-1');
    const moved = toggleCell(state, 'line-p1', 'quote-2');

    expect(moved.selections).toEqual({ 'line-p1': 'quote-2' });
    expect(cellOf(moved, 'line-p1', 'quote-1').state).toBe('disponible');
    expect(cellOf(moved, 'line-p1', 'quote-2').state).toBe('seleccionado');
    expect(
      Object.values(rowOf(moved, 'line-p1').cells).filter((cell) => cell.state === 'seleccionado'),
    ).toHaveLength(1);
  });

  it('deselecciona al marcar de nuevo la celda ya seleccionada', () => {
    const detail = buildCanonicalDetail();
    const state = toggleCell(buildAwardMatrix(detail, buildItems(detail)), 'line-p1', 'quote-1');
    const deselected = toggleCell(state, 'line-p1', 'quote-1');

    expect(deselected.selections).toEqual({});
    expect(cellOf(deselected, 'line-p1', 'quote-1').state).toBe('disponible');
  });

  it('no toca filas adjudicadas ni ordenadas ante ninguna acción (CA-UX-06)', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [
        makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00'),
        makeAward('award-2', 'line-p2', 'party-1', 'quote-1', '1.00'),
      ],
      orders: [makeOrder('po-1', 'party-1', PurchaseOrderStatus.APPROVED)],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    // Las celdas de filas tomadas no responden a ninguna acción de selección.
    expect(toggleCell(state, 'line-p1', 'quote-2')).toBe(state);
    expect(toggleCell(state, 'line-p2', 'quote-2')).toBe(state);
    expect(moveAwardToQuote(state, 'line-p2', 'quote-2')).toBe(state);

    // «Seleccionar todo» adjudica las libres pero NUNCA roba las tomadas.
    const afterAssign = assignQuoteColumn(state, 'quote-2');
    expect(afterAssign.selections).toEqual({ 'line-p3': 'quote-2', 'line-p4': 'quote-2' });
    expect(cellOf(afterAssign, 'line-p1', 'quote-2').state).toBe('adjudicado');
    expect(cellOf(afterAssign, 'line-p2', 'quote-2').state).toBe('ordenado');
  });

  it('no selecciona celdas sin cotización ni opera con panel deshabilitado', () => {
    const detail = buildCanonicalDetail({
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', {
          'line-p1': '100.00',
          'line-p2': '200.00',
          'line-p3': '300.00',
          'line-p4': '400.00',
        }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'COP', { 'line-p1': '110.00' }),
      ],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));
    expect(toggleCell(state, 'line-p3', 'quote-2')).toBe(state);

    const disabled = buildAwardMatrix(detail, buildItems(detail), { disabled: true });
    expect(toggleCell(disabled, 'line-p1', 'quote-1')).toBe(disabled);
  });

  it('nunca muta el estado recibido', () => {
    const detail = buildCanonicalDetail();
    const state = buildAwardMatrix(detail, buildItems(detail));
    const next = toggleCell(state, 'line-p1', 'quote-1');

    expect(next).not.toBe(state);
    expect(state.selections).toEqual({});
    expect(cellOf(state, 'line-p1', 'quote-1').state).toBe('disponible');
    expect(cellOf(next, 'line-p1', 'quote-1').state).toBe('seleccionado');
  });
});

describe('assignQuoteColumn', () => {
  function buildPartialDetail(): PurchaseRequestDetailRecord {
    return buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', {
          'line-p1': '100.00',
          'line-p2': '200.00',
          'line-p3': '300.00',
          'line-p4': '400.00',
        }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'COP', {
          'line-p1': '110.00',
          'line-p2': '180.00',
          // no cubre p3
          'line-p4': '390.00',
        }),
      ],
    });
  }

  it('marca solo los productos libres que la columna cubre (CA-UX-03)', () => {
    const detail = buildPartialDetail();
    const state = buildAwardMatrix(detail, buildItems(detail));
    const next = assignQuoteColumn(state, 'quote-2');

    expect(next.selections).toEqual({ 'line-p2': 'quote-2', 'line-p4': 'quote-2' });
    // La fila adjudicada queda intocada.
    expect(next.locks['line-p1']).toBeDefined();
    expect(Object.values(rowOf(next, 'line-p1').cells)).toEqual([
      { state: 'adjudicado' },
      { state: 'adjudicado' },
    ]);
    // La celda sin cotización no se marca.
    expect(cellOf(next, 'line-p3', 'quote-2').state).toBe('sin-cotizar');
  });

  it('no roba una línea ya marcada en otra columna', () => {
    const detail = buildCanonicalDetail();
    const marked = toggleCell(buildAwardMatrix(detail, buildItems(detail)), 'line-p2', 'quote-1');
    const next = assignQuoteColumn(marked, 'quote-2');

    expect(next.selections).toEqual({
      'line-p1': 'quote-2',
      'line-p2': 'quote-1',
      'line-p3': 'quote-2',
      'line-p4': 'quote-2',
    });
  });

  it('la segunda invocación deselecciona las marcas vigentes de esa columna', () => {
    const detail = buildCanonicalDetail();
    const state = buildAwardMatrix(detail, buildItems(detail));
    const selected = assignQuoteColumn(state, 'quote-2');
    const deselected = assignQuoteColumn(selected, 'quote-2');

    expect(deselected.selections).toEqual({});
    expect(cellOf(deselected, 'line-p2', 'quote-2').state).toBe('disponible');
  });

  it('conserva las marcas que el usuario movió a otra columna tras el seleccionar todo', () => {
    const detail = buildCanonicalDetail();
    const selected = assignQuoteColumn(buildAwardMatrix(detail, buildItems(detail)), 'quote-2');
    const movedOne = toggleCell(selected, 'line-p2', 'quote-1');
    const deselected = assignQuoteColumn(movedOne, 'quote-2');

    expect(deselected.selections).toEqual({ 'line-p2': 'quote-1' });
  });

  it('es no-op con panel deshabilitado o con una cotización que no existe', () => {
    const detail = buildCanonicalDetail();
    const disabled = buildAwardMatrix(detail, buildItems(detail), { disabled: true });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(assignQuoteColumn(disabled, 'quote-2')).toBe(disabled);
    expect(assignQuoteColumn(state, 'quote-inexistente')).toBe(state);
  });
});

describe('moveAwardToQuote', () => {
  function buildAdjudicatedDetail(lineStatus: PurchaseRequestLineStatus) {
    return buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
    });
  }

  it('desbloquea la fila, marca el nuevo destino y deja el award pendiente de revocar', () => {
    const detail = buildAdjudicatedDetail(PurchaseRequestLineStatus.AWARDED);
    const state = buildAwardMatrix(detail, buildItems(detail));
    const next = moveAwardToQuote(state, 'line-p1', 'quote-2');

    expect(next.locks['line-p1']).toBeUndefined();
    expect(next.selections).toEqual({ 'line-p1': 'quote-2' });
    expect(next.pendingRevokes).toEqual({ 'line-p1': 'award-1' });
    expect(cellOf(next, 'line-p1', 'quote-1').state).toBe('disponible');
    expect(cellOf(next, 'line-p1', 'quote-2').state).toBe('seleccionado');

    const dto = toCreateAwardsDto(next);
    expect(dto.awards).toEqual([
      {
        purchaseRequestLineId: 'line-p1',
        supplierQuoteId: 'quote-2',
        awardedPartyRefId: 'party-2',
        awardedQuantity: '1.00',
      },
    ]);
  });

  it('la fila desbloqueada no hereda proveedor ni cotización de la adjudicación revocada', () => {
    const detail = buildAdjudicatedDetail(PurchaseRequestLineStatus.AWARDED);
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(rowOf(state, 'line-p1').awardedPartyRefId).toBe('party-1');
    expect(rowOf(state, 'line-p1').awardedQuoteId).toBe('quote-1');

    const next = moveAwardToQuote(state, 'line-p1', 'quote-2');

    expect(rowOf(next, 'line-p1').awardedPartyRefId).toBeUndefined();
    expect(rowOf(next, 'line-p1').awardedQuoteId).toBeUndefined();
  });

  it('cancela la revocación pendiente si el usuario deselecciona el destino', () => {
    const detail = buildAdjudicatedDetail(PurchaseRequestLineStatus.AWARDED);
    const state = buildAwardMatrix(detail, buildItems(detail));
    const moved = moveAwardToQuote(state, 'line-p1', 'quote-2');
    const deselected = toggleCell(moved, 'line-p1', 'quote-2');

    expect(deselected.selections).toEqual({});
    expect(deselected.pendingRevokes).toEqual({});
  });

  it('es no-op si el destino ya es la cotización del award vigente', () => {
    const detail = buildAdjudicatedDetail(PurchaseRequestLineStatus.AWARDED);
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.locks['line-p1']?.awardedQuoteId).toBe('quote-1');
    expect(moveAwardToQuote(state, 'line-p1', 'quote-1')).toBe(state);
  });

  it('no aplica a una fila ordenada (bloqueo duro)', () => {
    const detail = buildAdjudicatedDetail(PurchaseRequestLineStatus.ORDERED);
    // Con la orden viva del proveedor la fila queda ordenada (CA-UX-06).
    const orderedState = buildAwardMatrix(
      { ...detail, orders: [makeOrder('po-1', 'party-1', PurchaseOrderStatus.APPROVED)] },
      buildItems(detail),
    );

    expect(orderedState.locks['line-p1']?.ordered).toBe(true);
    expect(moveAwardToQuote(orderedState, 'line-p1', 'quote-2')).toBe(orderedState);
  });

  it('no aplica a líneas con reparto entre varios awards (PROJECT)', () => {
    const detail = buildCanonicalDetail({
      request: { requestType: PurchaseRequestType.PROJECT },
      lines: [
        makeLine('line-p1', {
          quantityRequested: '2.00',
          lineStatus: PurchaseRequestLineStatus.AWARDED,
        }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [
        makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00'),
        makeAward('award-2', 'line-p1', 'party-2', 'quote-2', '1.00'),
      ],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(state.locks['line-p1']?.splitAcrossAwards).toBe(true);
    expect(moveAwardToQuote(state, 'line-p1', 'quote-2')).toBe(state);
  });

  it('no aplica cuando el destino no cubre la línea o el panel no es editable', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'COP', {}), // no cubre nada
      ],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));
    const disabled = buildAwardMatrix(detail, buildItems(detail), { disabled: true });

    expect(moveAwardToQuote(state, 'line-p1', 'quote-2')).toBe(state);
    expect(moveAwardToQuote(disabled, 'line-p1', 'quote-1')).toBe(disabled);
  });
});

describe('summarizeBySupplier', () => {
  it('resume el caso canónico: 2 proveedores con 2 productos cada uno (CA-UX-01)', () => {
    const detail = buildCanonicalDetail();
    let state = buildAwardMatrix(detail, buildItems(detail), { supplierLabels: SUPPLIER_LABELS });
    state = toggleCell(state, 'line-p1', 'quote-1');
    state = toggleCell(state, 'line-p3', 'quote-1');
    state = toggleCell(state, 'line-p2', 'quote-2');
    state = toggleCell(state, 'line-p4', 'quote-2');

    expect(summarizeBySupplier(state)).toEqual([
      {
        supplierPartyRefId: 'party-1',
        supplierLabel: 'Proveedor 1',
        productCount: 2,
        totalsByCurrency: [{ currency: 'COP', total: '400.00' }],
      },
      {
        supplierPartyRefId: 'party-2',
        supplierLabel: 'Proveedor 2',
        productCount: 2,
        totalsByCurrency: [{ currency: 'COP', total: '570.00' }],
      },
    ]);
  });

  it('separa los totales por moneda sin sumarlas (CA-UX-04)', () => {
    const detail = buildCanonicalDetail({
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeQuote('quote-2', 'party-1', 'COT-2', 'USD', { 'line-p2': '10.00' }),
      ],
    });
    let state = buildAwardMatrix(detail, buildItems(detail));
    state = toggleCell(state, 'line-p1', 'quote-1');
    state = toggleCell(state, 'line-p2', 'quote-2');

    const summaries = summarizeBySupplier(state);
    expect(summaries).toHaveLength(1);
    expect(at(summaries, 0).productCount).toBe(2);
    expect(at(summaries, 0).totalsByCurrency).toEqual([
      { currency: 'COP', total: '100.00' },
      { currency: 'USD', total: '10.00' },
    ]);
  });

  it('suma importes no representables en binario con exactitud decimal (acumulación en céntimos)', () => {
    // 0.10 + 0.20 + 0.30 y 105.47 + 89.99 + 233.05 derivan en flotante
    // (0.30000000000000004 / 428.51000000000005): la suma debe salir EXACTA
    // (0.60 / 428.51) por acumulación en céntimos enteros, sin depender del
    // redondeo final para disimular el drift.
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1'),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
        makeLine('line-p5'),
        makeLine('line-p6'),
      ],
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', {
          'line-p1': '0.10',
          'line-p2': '0.20',
          'line-p3': '0.30',
        }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'COP', {
          'line-p4': '105.47',
          'line-p5': '89.99',
          'line-p6': '233.05',
        }),
      ],
    });
    let state = buildAwardMatrix(detail, buildItems(detail), { supplierLabels: SUPPLIER_LABELS });
    state = toggleCell(state, 'line-p1', 'quote-1');
    state = toggleCell(state, 'line-p2', 'quote-1');
    state = toggleCell(state, 'line-p3', 'quote-1');
    state = toggleCell(state, 'line-p4', 'quote-2');
    state = toggleCell(state, 'line-p5', 'quote-2');
    state = toggleCell(state, 'line-p6', 'quote-2');

    expect(summarizeBySupplier(state)).toEqual([
      {
        supplierPartyRefId: 'party-1',
        supplierLabel: 'Proveedor 1',
        productCount: 3,
        totalsByCurrency: [{ currency: 'COP', total: '0.60' }],
      },
      {
        supplierPartyRefId: 'party-2',
        supplierLabel: 'Proveedor 2',
        productCount: 3,
        totalsByCurrency: [{ currency: 'COP', total: '428.51' }],
      },
    ]);
  });

  it('devuelve un arreglo vacío sin selecciones', () => {
    const detail = buildCanonicalDetail();
    const summaries = summarizeBySupplier(buildAwardMatrix(detail, buildItems(detail)));

    expect(summaries).toEqual([]);
  });
});

describe('getAwardEmptySelectionNotice', () => {
  it('con filas libres pide seleccionar al menos un producto', () => {
    const detail = buildCanonicalDetail();
    const notice = getAwardEmptySelectionNotice(buildAwardMatrix(detail, buildItems(detail)));

    expect(notice).toBe('Selecciona al menos un producto en la matriz para adjudicar.');
  });

  it('con todas las filas con orden viva explica que la adjudicación ya está cerrada', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p2', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
      ],
      awards: [
        makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00'),
        makeAward('award-2', 'line-p2', 'party-2', 'quote-2', '1.00'),
      ],
      orders: [
        makeOrder('order-1', 'party-1', PurchaseOrderStatus.APPROVED),
        makeOrder('order-2', 'party-2', PurchaseOrderStatus.APPROVED),
      ],
    });
    const notice = getAwardEmptySelectionNotice(buildAwardMatrix(detail, buildItems(detail)));

    expect(notice).toBe(
      'Todos los productos ya están adjudicados y tienen una orden de compra en curso.',
    );
  });

  it('con todas las filas adjudicadas sin orden apunta a la revocación', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
      ],
      awards: [
        makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00'),
        makeAward('award-2', 'line-p2', 'party-2', 'quote-2', '1.00'),
      ],
    });
    const notice = getAwardEmptySelectionNotice(buildAwardMatrix(detail, buildItems(detail)));

    expect(notice).toBe(
      'Todos los productos están adjudicados: revoca una adjudicación para cambiarla.',
    );
  });

  it('con filas libres y bloqueadas mezcladas pide seleccionar (las libres mandan)', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p2'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
      orders: [makeOrder('order-1', 'party-1', PurchaseOrderStatus.APPROVED)],
    });
    const notice = getAwardEmptySelectionNotice(buildAwardMatrix(detail, buildItems(detail)));

    expect(notice).toBe('Selecciona al menos un producto en la matriz para adjudicar.');
  });
});

describe('validateMatrixSelection', () => {
  it('explica por qué la CTA está deshabilitada con cero selecciones (CA-UX-07)', () => {
    const detail = buildCanonicalDetail();
    const result = validateMatrixSelection(buildAwardMatrix(detail, buildItems(detail)));

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        code: 'EMPTY_SELECTION',
        message: 'Selecciona al menos un producto en la matriz para adjudicar.',
      },
    ]);
  });

  it('con todas las filas bloqueadas por orden viva, el aviso de EMPTY_SELECTION explica el bloqueo', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeLine('line-p2', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
      ],
      awards: [
        makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00'),
        makeAward('award-2', 'line-p2', 'party-2', 'quote-2', '1.00'),
      ],
      orders: [
        makeOrder('order-1', 'party-1', PurchaseOrderStatus.APPROVED),
        makeOrder('order-2', 'party-2', PurchaseOrderStatus.APPROVED),
      ],
    });
    const result = validateMatrixSelection(buildAwardMatrix(detail, buildItems(detail)));

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        code: 'EMPTY_SELECTION',
        message: 'Todos los productos ya están adjudicados y tienen una orden de compra en curso.',
      },
    ]);
  });

  it('valida una selección completa en moneda única', () => {
    const detail = buildCanonicalDetail();
    let state = buildAwardMatrix(detail, buildItems(detail));
    state = toggleCell(state, 'line-p1', 'quote-1');
    state = toggleCell(state, 'line-p2', 'quote-2');

    expect(validateMatrixSelection(state)).toEqual({ ok: true, issues: [] });
  });

  it('reporta monedas mixtas como aviso sin bloquear la adjudicación', () => {
    const detail = buildCanonicalDetail({
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'USD', { 'line-p1': '0.02', 'line-p2': '10.00' }),
      ],
    });
    const state = toggleCell(buildAwardMatrix(detail, buildItems(detail)), 'line-p1', 'quote-1');
    const result = validateMatrixSelection(state);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      {
        code: 'CURRENCY_MIXED',
        message:
          'Las cotizaciones están en monedas distintas: la comparación de precios está desactivada.',
      },
    ]);
  });

  it('el aviso de monedas mixtas no cancela un bloqueante que coincida con él', () => {
    const detail = buildCanonicalDetail({
      quotes: [
        makeQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeQuote('quote-2', 'party-2', 'COT-2', 'USD', { 'line-p1': '0.02' }),
      ],
    });
    // Sin selección: conviven EMPTY_SELECTION (bloquea) y CURRENCY_MIXED (avisa).
    const result = validateMatrixSelection(buildAwardMatrix(detail, buildItems(detail)));

    expect(result.issues.map((issue) => issue.code)).toEqual(['EMPTY_SELECTION', 'CURRENCY_MIXED']);
    expect(result.ok).toBe(false);
  });

  it('rechaza cantidades inválidas en PROJECT (cero, vacía o superior a la solicitada)', () => {
    const detail = buildCanonicalDetail({ request: { requestType: PurchaseRequestType.PROJECT } });
    const base = buildAwardMatrix(detail, buildItems(detail));
    const empty = setLineQuantity(base, 'line-p1', '');
    const zero = setLineQuantity(base, 'line-p1', '0');
    const exceeded = setLineQuantity(base, 'line-p1', '5');

    for (const invalid of [empty, zero, exceeded]) {
      const state = toggleCell(invalid, 'line-p1', 'quote-1');
      const result = validateMatrixSelection(state);
      expect(result.ok).toBe(false);
      expect(at(result.issues, 0).code).toBe('INVALID_QUANTITY');
      expect(at(result.issues, 0).message).toContain('Producto 1');
    }

    const valid = toggleCell(setLineQuantity(base, 'line-p1', '0.50'), 'line-p1', 'quote-1');
    expect(validateMatrixSelection(valid).ok).toBe(true);
  });

  it('ignora overrides de cantidad fuera de PROJECT (la cantidad queda en la solicitada)', () => {
    const detail = buildCanonicalDetail();
    const state = toggleCell(
      setLineQuantity(buildAwardMatrix(detail, buildItems(detail)), 'line-p1', '0'),
      'line-p1',
      'quote-1',
    );

    expect(validateMatrixSelection(state).ok).toBe(true);
    expect(rowOf(state, 'line-p1').awardedQuantity).toBe('1.00');
  });

  it('es no-op sobre filas bloqueadas o líneas inexistentes en PROJECT', () => {
    const detail = buildCanonicalDetail({
      request: { requestType: PurchaseRequestType.PROJECT },
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
    });
    const state = buildAwardMatrix(detail, buildItems(detail));

    expect(setLineQuantity(state, 'line-p1', '9')).toBe(state);
    expect(setLineQuantity(state, 'line-inexistente', '9')).toBe(state);
  });
});

describe('toCreateAwardsDto', () => {
  it('garantiza el invariante: un purchaseRequestLineId aparece como máximo una vez', () => {
    const detail = buildCanonicalDetail();
    let state = buildAwardMatrix(detail, buildItems(detail));
    state = toggleCell(state, 'line-p1', 'quote-1');
    state = toggleCell(state, 'line-p2', 'quote-2');
    state = toggleCell(state, 'line-p3', 'quote-1');
    state = toggleCell(state, 'line-p4', 'quote-2');

    const dto = toCreateAwardsDto(state);
    expect(dto.awards).toHaveLength(4);
    const lineIds = dto.awards.map((award) => award.purchaseRequestLineId);
    expect(new Set(lineIds).size).toBe(lineIds.length);
  });

  it('emite un award por línea seleccionada con cantidad decimal y SIN unitCost', () => {
    const detail = buildCanonicalDetail();
    let state = buildAwardMatrix(detail, buildItems(detail));
    state = toggleCell(state, 'line-p1', 'quote-1');
    state = toggleCell(state, 'line-p4', 'quote-2');

    expect(toCreateAwardsDto(state).awards).toEqual([
      {
        purchaseRequestLineId: 'line-p1',
        supplierQuoteId: 'quote-1',
        awardedPartyRefId: 'party-1',
        awardedQuantity: '1.00',
      },
      {
        purchaseRequestLineId: 'line-p4',
        supplierQuoteId: 'quote-2',
        awardedPartyRefId: 'party-2',
        awardedQuantity: '1.00',
      },
    ]);
    for (const award of toCreateAwardsDto(state).awards) {
      expect(Object.prototype.hasOwnProperty.call(award, 'unitCost')).toBe(false);
    }
  });

  it('usa el override de cantidad en PROJECT y la solicitada fuera de PROJECT', () => {
    const projectDetail = buildCanonicalDetail({
      request: { requestType: PurchaseRequestType.PROJECT },
    });
    const projectState = toggleCell(
      setLineQuantity(
        buildAwardMatrix(projectDetail, buildItems(projectDetail)),
        'line-p1',
        '0.75',
      ),
      'line-p1',
      'quote-1',
    );
    expect(at(toCreateAwardsDto(projectState).awards, 0).awardedQuantity).toBe('0.75');

    const plainDetail = buildCanonicalDetail();
    const plainState = toggleCell(
      setLineQuantity(buildAwardMatrix(plainDetail, buildItems(plainDetail)), 'line-p1', '0.75'),
      'line-p1',
      'quote-1',
    );
    expect(at(toCreateAwardsDto(plainState).awards, 0).awardedQuantity).toBe('1.00');
  });

  it('devuelve un payload vacío sin selecciones', () => {
    const detail = buildCanonicalDetail();
    expect(toCreateAwardsDto(buildAwardMatrix(detail, buildItems(detail)))).toEqual({ awards: [] });
  });
});

describe('helpers de la barra de selección', () => {
  it('buildAwardMatrix deriva canEdit y currencyMixed en el estado', () => {
    const detail = buildCanonicalDetail();
    expect(buildAwardMatrix(detail, buildItems(detail)).canEdit).toBe(true);
    expect(buildAwardMatrix(detail, buildItems(detail)).currencyMixed).toBe(false);
    expect(
      buildAwardMatrix(
        buildCanonicalDetail({
          quotes: [
            makeQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
            makeQuote('quote-2', 'party-2', 'COT-2', 'USD', { 'line-p1': '0.02' }),
          ],
        }),
        buildItems(detail),
      ).currencyMixed,
    ).toBe(true);
  });

  it('getAwardMatrixProgress cuenta persistidas más draft contra el total («3 de 4 · 1 pendiente»)', () => {
    const detail = buildCanonicalDetail({
      lines: [
        makeLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
        makeLine('line-p2'),
        makeLine('line-p3'),
        makeLine('line-p4'),
      ],
      awards: [makeAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
    });
    const state = toggleCell(buildAwardMatrix(detail, buildItems(detail)), 'line-p2', 'quote-2');

    expect(getAwardMatrixProgress(state)).toEqual({
      totalCount: 4,
      awardedCount: 2,
      pendingCount: 2,
    });
    expect(getAwardMatrixProgress(buildAwardMatrix(detail, buildItems(detail)))).toEqual({
      totalCount: 4,
      awardedCount: 1,
      pendingCount: 3,
    });
  });
});
