import type { PurchaseDraftLine } from './purchase-request-draft';

export interface PurchaseDraftEstimate {
  total: number;
  coveredLines: number;
  uncoveredLines: number;
}

export function estimatePurchaseDraftTotal(
  lines: PurchaseDraftLine[],
  unitCostByItemId: Record<string, number>,
): PurchaseDraftEstimate {
  let total = 0;
  let coveredLines = 0;
  let uncoveredLines = 0;

  lines.forEach((line) => {
    const quantity = Number.parseFloat(line.quantityRequested || '0');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      uncoveredLines += 1;
      return;
    }

    const unitCost = unitCostByItemId[line.inventoryItemId];
    if (unitCost === undefined || !Number.isFinite(unitCost) || unitCost <= 0) {
      uncoveredLines += 1;
      return;
    }

    total += unitCost * quantity;
    coveredLines += 1;
  });

  return { total, coveredLines, uncoveredLines };
}

export function buildCatalogUnitCostMap(
  catalogOptions: Array<{ id: string; standardCost: string }>,
): Record<string, number> {
  return Object.fromEntries(
    catalogOptions
      .map((option) => [option.id, Number.parseFloat(option.standardCost || '0')] as const)
      .filter(([, cost]) => Number.isFinite(cost) && cost > 0),
  );
}
