import type {
  CreatePurchaseOrderDto,
  PurchaseOrderBatchOrderInput,
  PurchaseRequestDetailRecord,
  PurchaseRequestLineAwardRecord,
  PurchaseRequestLineRecord,
  SupplierQuoteLineRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';

export interface AwardOrderPreviewLine {
  purchaseRequestLineId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  unitCostSource: 'quote' | 'missing';
  label: string;
}

export interface AwardOrderPreview {
  partyRefId: string;
  partyLabel: string;
  lines: AwardOrderPreviewLine[];
  subtotal: number;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number.parseFloat(value ?? '0') || 0;
}

function findQuoteLine(
  quotes: SupplierQuoteRecord[],
  award: PurchaseRequestLineAwardRecord,
): SupplierQuoteLineRecord | null {
  if (!award.supplierQuoteId) {
    return null;
  }

  const quote = quotes.find((entry) => entry.id === award.supplierQuoteId);
  if (!quote?.lines?.length) {
    return null;
  }

  return (
    quote.lines.find((line) => line.purchaseRequestLineId === award.purchaseRequestLineId) ?? null
  );
}

function resolveLineItemId(line: PurchaseRequestLineRecord | undefined): string | null {
  return line?.inventoryItemId ?? null;
}

/**
 * Agrupa awards por proveedor y construye el preview / payload batch `orders[]`.
 */
export function buildOrdersFromAwards(
  detail: PurchaseRequestDetailRecord,
  options?: {
    supplierLabels?: Record<string, string>;
    lineLabels?: Record<string, string>;
    unitCostOverrides?: Record<string, number>;
  },
): AwardOrderPreview[] {
  const awards = detail.awards;
  if (awards.length === 0) {
    return [];
  }

  const linesById = new Map(detail.lines.map((line) => [line.id, line]));
  const groups = new Map<string, AwardOrderPreview>();

  for (const award of awards) {
    const requestLine = linesById.get(award.purchaseRequestLineId);
    const itemId = resolveLineItemId(requestLine);
    if (!itemId) {
      continue;
    }

    const quoteLine = findQuoteLine(detail.quotes, award);
    const overrideKey = `${award.awardedPartyRefId}:${award.purchaseRequestLineId}`;
    const override = options?.unitCostOverrides?.[overrideKey];
    const hasResolvedCost = override !== undefined || Boolean(quoteLine);
    const unitCost = hasResolvedCost ? (override ?? toNumeric(quoteLine?.unitCost)) : 0;
    const unitCostSource: AwardOrderPreviewLine['unitCostSource'] = hasResolvedCost
      ? 'quote'
      : 'missing';

    const existing = groups.get(award.awardedPartyRefId);
    const previewLine: AwardOrderPreviewLine = {
      purchaseRequestLineId: award.purchaseRequestLineId,
      itemId,
      quantity: toNumeric(award.awardedQuantity),
      unitCost,
      unitCostSource,
      label:
        options?.lineLabels?.[award.purchaseRequestLineId] ??
        requestLine?.freeTextDescription?.trim() ??
        'Línea adjudicada',
    };

    if (existing) {
      existing.lines.push(previewLine);
      existing.subtotal += previewLine.quantity * previewLine.unitCost;
      continue;
    }

    groups.set(award.awardedPartyRefId, {
      partyRefId: award.awardedPartyRefId,
      partyLabel: options?.supplierLabels?.[award.awardedPartyRefId] ?? award.awardedPartyRefId,
      lines: [previewLine],
      subtotal: previewLine.quantity * previewLine.unitCost,
    });
  }

  return Array.from(groups.values());
}

export function previewsToCreateOrderDto(
  purchaseRequestId: string,
  previews: AwardOrderPreview[],
  options?: {
    expectedDeliveryDate?: string | null;
    notes?: string | null;
  },
): CreatePurchaseOrderDto {
  const orders: PurchaseOrderBatchOrderInput[] = previews.map((preview) => ({
    partyRefId: preview.partyRefId,
    expectedDeliveryDate: options?.expectedDeliveryDate ?? null,
    notes: options?.notes ?? null,
    lines: preview.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      purchaseRequestLineId: line.purchaseRequestLineId,
    })),
  }));

  return {
    purchaseRequestId,
    orders,
  };
}

export function canGenerateOrdersFromAwards(detail: PurchaseRequestDetailRecord): boolean {
  return buildOrdersFromAwards(detail).length > 0;
}

export function hasMissingUnitCosts(previews: AwardOrderPreview[]): boolean {
  return previews.some((preview) =>
    preview.lines.some((line) => line.unitCostSource === 'missing' || line.unitCost <= 0),
  );
}
