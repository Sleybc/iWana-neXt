import { StockBalanceCondition } from '@iwana/shared';
import type { StockBalanceRecord } from '@/lib/api-client';

export interface StockIssueBalanceLookupOptions {
  condition?: StockBalanceCondition;
  lotId?: string | null;
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

/**
 * Disponible canónico de un saldo: existencia menos lo reservado (misma fórmula que
 * `buildStockOverviewRows`). El backend rechaza salidas y traslados por encima del
 * disponible, así que la UI nunca debe ofrecer material ya comprometido.
 */
export function getAvailableQtyFromBalance(
  balance: Pick<StockBalanceRecord, 'quantityOnHand' | 'quantityReserved'>,
): number {
  return toNumber(balance.quantityOnHand) - toNumber(balance.quantityReserved);
}

export function getBalanceForItemAtLocation(
  balances: StockBalanceRecord[],
  itemId: string,
  locationId: string,
  options: StockIssueBalanceLookupOptions = {},
): number {
  if (!itemId.trim() || !locationId.trim()) {
    return 0;
  }

  const condition = options.condition ?? StockBalanceCondition.NEW;
  const lotId = options.lotId ?? null;

  return balances
    .filter(
      (balance) =>
        balance.itemId === itemId &&
        balance.locationId === locationId &&
        balance.condition === condition &&
        (balance.lotId ?? null) === lotId,
    )
    .reduce((total, balance) => total + getAvailableQtyFromBalance(balance), 0);
}

export function buildAvailableQuantityByItemAtLocation(
  balances: StockBalanceRecord[],
  locationId: string,
  options: StockIssueBalanceLookupOptions = {},
): Map<string, number> {
  if (!locationId.trim()) {
    return new Map();
  }

  const condition = options.condition ?? StockBalanceCondition.NEW;
  const lotId = options.lotId ?? null;
  const quantities = new Map<string, number>();

  for (const balance of balances) {
    if (
      balance.locationId !== locationId ||
      balance.condition !== condition ||
      (balance.lotId ?? null) !== lotId
    ) {
      continue;
    }

    const current = quantities.get(balance.itemId) ?? 0;
    quantities.set(balance.itemId, current + getAvailableQtyFromBalance(balance));
  }

  return quantities;
}

export function isRequestedQtyExceedingAvailable(
  requestedQty: string | number,
  availableQty: number,
): boolean {
  const requested =
    typeof requestedQty === 'number' ? requestedQty : Number.parseFloat(requestedQty);
  if (!Number.isFinite(requested) || requested <= 0) {
    return false;
  }

  return requested > availableQty;
}
