import type { InventoryItemRecord, StockBalanceRecord } from '@/lib/api-client';

export type StockOverviewStatus = 'out' | 'below-minimum' | 'below-reorder' | 'ok';

export const STOCK_OVERVIEW_STATUS_LABELS: Record<StockOverviewStatus, string> = {
  out: 'Agotado',
  'below-minimum': 'Bajo mínimo',
  'below-reorder': 'Bajo punto de reorden',
  ok: 'En nivel',
};

export interface StockOverviewRow {
  item: InventoryItemRecord;
  onHand: number;
  reserved: number;
  available: number;
  minimumStock: number;
  reorderPoint: number;
  targetStock: number;
  status: StockOverviewStatus;
  statusLabel: string;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveStockOverviewStatus(input: {
  available: number;
  minimumStock: number;
  reorderPoint: number;
}): StockOverviewStatus {
  if (input.available <= 0) {
    return 'out';
  }

  if (input.available < input.minimumStock) {
    return 'below-minimum';
  }

  if (input.available < input.reorderPoint) {
    return 'below-reorder';
  }

  return 'ok';
}

export function buildStockOverviewRows(
  items: InventoryItemRecord[],
  balances: StockBalanceRecord[],
  options?: { locationId?: string | null },
): StockOverviewRow[] {
  const locationId = options?.locationId?.trim() || null;
  const totalsByItem = new Map<string, { onHand: number; reserved: number }>();

  for (const balance of balances) {
    if (locationId && balance.locationId !== locationId) {
      continue;
    }

    const current = totalsByItem.get(balance.itemId) ?? { onHand: 0, reserved: 0 };
    current.onHand += toNumber(balance.quantityOnHand);
    current.reserved += toNumber(balance.quantityReserved);
    totalsByItem.set(balance.itemId, current);
  }

  return items.map((item) => {
    const totals = totalsByItem.get(item.id) ?? { onHand: 0, reserved: 0 };
    const available = totals.onHand - totals.reserved;
    const minimumStock = toNumber(item.minimumStock);
    const reorderPoint = toNumber(item.reorderPoint);
    const targetStock = toNumber(item.targetStock);
    const status = deriveStockOverviewStatus({ available, minimumStock, reorderPoint });

    return {
      item,
      onHand: totals.onHand,
      reserved: totals.reserved,
      available,
      minimumStock,
      reorderPoint,
      targetStock,
      status,
      statusLabel: STOCK_OVERVIEW_STATUS_LABELS[status],
    };
  });
}

export function filterStockOverviewRows(
  rows: StockOverviewRow[],
  filters: { search?: string; onlyBelowMinimum?: boolean },
): StockOverviewRow[] {
  const search = filters.search?.trim().toLowerCase() ?? '';

  return rows.filter((row) => {
    if (filters.onlyBelowMinimum && row.status !== 'out' && row.status !== 'below-minimum') {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      row.item.name.toLowerCase().includes(search) || row.item.sku.toLowerCase().includes(search)
    );
  });
}
