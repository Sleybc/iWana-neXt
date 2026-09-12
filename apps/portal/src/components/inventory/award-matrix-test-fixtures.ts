/**
 * Fixtures compartidos de los specs de la matriz de adjudicación
 * (MOD12 Compras, Fase 30, track FE-2).
 *
 * Caso canónico de la spec §1: productos P1..P4, cotizaciones Q1 (proveedor 1)
 * y Q2 (proveedor 2). Q1 gana en P1 (100) y P3 (300); Q2 gana en P2 (180) y
 * P4 (390). Sin PII: nombres genéricos de prueba.
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

export const AWARD_TEST_TENANT_ID = 'tenant-001';
export const AWARD_TEST_REQUEST_ID = 'pr-001';
const AWARD_TEST_NOW = '2026-09-11T00:00:00.000Z';

export const AWARD_TEST_SUPPLIER_LABELS: Record<string, string> = {
  'party-1': 'Proveedor 1',
  'party-2': 'Proveedor 2',
  'party-3': 'Proveedor 3',
  'party-4': 'Proveedor 4',
};

export function makeAwardTestRequest(
  overrides?: Partial<PurchaseRequestRecord>,
): PurchaseRequestRecord {
  return {
    id: AWARD_TEST_REQUEST_ID,
    tenantId: AWARD_TEST_TENANT_ID,
    requestNumber: 'PR-1',
    title: 'Solicitud de prueba',
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
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
    ...overrides,
  };
}

export function makeAwardTestLine(
  id: string,
  overrides?: Partial<PurchaseRequestLineRecord>,
): PurchaseRequestLineRecord {
  return {
    id,
    tenantId: AWARD_TEST_TENANT_ID,
    purchaseRequestId: AWARD_TEST_REQUEST_ID,
    sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    inventoryItemId: `item-${id}`,
    freeTextDescription: null,
    quantityRequested: '1.00',
    unitOfMeasure: 'unidad',
    suggestedPartyRefId: null,
    lineStatus: PurchaseRequestLineStatus.OPEN,
    notes: null,
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
    ...overrides,
  };
}

export function makeAwardTestItem(id: string, name: string, sku: string): InventoryItemRecord {
  return {
    id,
    tenantId: AWARD_TEST_TENANT_ID,
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
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
  };
}

function makeAwardTestQuoteLine(
  supplierQuoteId: string,
  purchaseRequestLineId: string,
  unitCost: string,
): SupplierQuoteLineRecord {
  return {
    id: `ql-${supplierQuoteId}-${purchaseRequestLineId}`,
    tenantId: AWARD_TEST_TENANT_ID,
    supplierQuoteId,
    purchaseRequestLineId,
    quantity: '1.00',
    unitCost,
    lineAmount: unitCost,
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
  };
}

export function makeAwardTestQuote(
  id: string,
  partyRefId: string,
  quoteNumber: string,
  currency: string,
  costsByLine: Record<string, string>,
  overrides?: Partial<SupplierQuoteRecord>,
): SupplierQuoteRecord {
  const lines = Object.entries(costsByLine).map(([lineId, unitCost]) =>
    makeAwardTestQuoteLine(id, lineId, unitCost),
  );
  const total = lines.reduce((sum, line) => sum + Number(line.lineAmount), 0);
  const payable = total.toFixed(2);

  return {
    id,
    tenantId: AWARD_TEST_TENANT_ID,
    purchaseRequestId: AWARD_TEST_REQUEST_ID,
    partyRefId,
    quoteNumber,
    amount: payable,
    shippingCost: '0.00',
    currency,
    validUntil: null,
    notes: null,
    lines,
    payableAmount: payable,
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
    ...overrides,
  };
}

export function makeAwardTestAward(
  id: string,
  purchaseRequestLineId: string,
  awardedPartyRefId: string,
  supplierQuoteId: string | null,
  awardedQuantity: string,
): PurchaseRequestLineAwardRecord {
  return {
    id,
    tenantId: AWARD_TEST_TENANT_ID,
    purchaseRequestLineId,
    supplierQuoteId,
    awardedPartyRefId,
    awardedQuantity,
    awardNotes: null,
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
  };
}

export function makeAwardTestOrder(id: string, partyRefId: string): PurchaseOrderRecord {
  return {
    id,
    tenantId: AWARD_TEST_TENANT_ID,
    orderNumber: `OC-${id}`,
    purchaseRequestId: AWARD_TEST_REQUEST_ID,
    partyRefId,
    status: PurchaseOrderStatus.APPROVED,
    expectedDeliveryDate: null,
    approvedByUserId: null,
    cancellationReason: null,
    cancelledByUserId: null,
    closedByUserId: null,
    notes: null,
    createdAt: AWARD_TEST_NOW,
    updatedAt: AWARD_TEST_NOW,
  };
}

export interface AwardTestDetailOverrides {
  request?: Partial<PurchaseRequestRecord>;
  lines?: PurchaseRequestLineRecord[];
  quotes?: SupplierQuoteRecord[];
  awards?: PurchaseRequestLineAwardRecord[];
  orders?: PurchaseOrderRecord[];
}

/** Caso canónico: P1..P4 libres; Q1 y Q2 cubren las cuatro líneas en COP. */
export function buildAwardTestDetail(
  overrides?: AwardTestDetailOverrides,
): PurchaseRequestDetailRecord {
  return {
    request: makeAwardTestRequest(overrides?.request),
    lines: overrides?.lines ?? [
      makeAwardTestLine('line-p1'),
      makeAwardTestLine('line-p2'),
      makeAwardTestLine('line-p3'),
      makeAwardTestLine('line-p4'),
    ],
    quotes: overrides?.quotes ?? [
      makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', {
        'line-p1': '100.00',
        'line-p2': '200.00',
        'line-p3': '300.00',
        'line-p4': '400.00',
      }),
      makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'COP', {
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

export function buildAwardTestItems(detail: PurchaseRequestDetailRecord): InventoryItemRecord[] {
  return detail.lines
    .filter(
      (line): line is PurchaseRequestLineRecord & { inventoryItemId: string } =>
        line.inventoryItemId !== null,
    )
    .map((line, index) =>
      makeAwardTestItem(line.inventoryItemId, `Producto ${index + 1}`, `SKU-${index + 1}`),
    );
}

/** P1 adjudicado al proveedor 1 (fila bloqueada con Revocar); resto libre. */
export function buildAwardedTestDetail(): PurchaseRequestDetailRecord {
  const lines = [
    makeAwardTestLine('line-p1', { lineStatus: PurchaseRequestLineStatus.AWARDED }),
    makeAwardTestLine('line-p2'),
    makeAwardTestLine('line-p3'),
    makeAwardTestLine('line-p4'),
  ];
  return buildAwardTestDetail({
    lines,
    awards: [makeAwardTestAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
  });
}

/** P1 ordenado al proveedor 1 (bloqueo duro, sin Revocar); resto libre. */
export function buildOrderedTestDetail(): PurchaseRequestDetailRecord {
  const lines = [
    makeAwardTestLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
    makeAwardTestLine('line-p2'),
    makeAwardTestLine('line-p3'),
    makeAwardTestLine('line-p4'),
  ];
  return buildAwardTestDetail({
    lines,
    awards: [makeAwardTestAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00')],
    orders: [makeAwardTestOrder('order-1', 'party-1')],
  });
}
