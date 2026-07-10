import { InventoryItemKind, InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import type {
  InventoryItemRecord,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import { getBalanceForItemAtLocation } from './stock-issue-balance-utils';

export function isSerializedInventoryItem(
  item: Pick<InventoryItemRecord, 'trackingMode' | 'itemKind'>,
): boolean {
  return (
    item.trackingMode === InventoryTrackingMode.SERIALIZED ||
    item.itemKind === InventoryItemKind.SERIALIZED
  );
}

export interface StockIssueLotOption {
  lotId: string;
  availableQty: number;
}

export function listLotOptionsForItemAtLocation(
  balances: StockBalanceRecord[],
  itemId: string,
  locationId: string,
  condition: StockBalanceCondition,
): StockIssueLotOption[] {
  if (!itemId || !locationId) {
    return [];
  }

  const byLot = new Map<string, number>();

  for (const balance of balances) {
    if (
      balance.itemId !== itemId ||
      balance.locationId !== locationId ||
      balance.condition !== condition ||
      !balance.lotId
    ) {
      continue;
    }

    const current = byLot.get(balance.lotId) ?? 0;
    byLot.set(balance.lotId, current + Number.parseFloat(balance.quantityOnHand));
  }

  return [...byLot.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([lotId, availableQty]) => ({ lotId, availableQty }))
    .sort((left, right) => left.lotId.localeCompare(right.lotId, 'es'));
}

export function getAvailableQtyForDraftLine(input: {
  balances: StockBalanceRecord[];
  itemId: string;
  sourceLocationId: string;
  condition: StockBalanceCondition;
  lotId: string;
  serializedAssetId: string;
}): number {
  if (!input.itemId || !input.sourceLocationId) {
    return 0;
  }

  if (input.serializedAssetId.trim()) {
    return 1;
  }

  return getBalanceForItemAtLocation(input.balances, input.itemId, input.sourceLocationId, {
    condition: input.condition,
    lotId: input.lotId.trim() ? input.lotId.trim() : null,
  });
}

export function listSerializedAssetsForItemAtLocation(
  assets: SerializedAssetRecord[],
  itemId: string,
  locationId: string,
): SerializedAssetRecord[] {
  if (!itemId || !locationId) {
    return [];
  }

  return assets
    .filter((asset) => asset.inventoryItemId === itemId && asset.currentLocationId === locationId)
    .sort((left, right) =>
      (left.serialNumber ?? left.assetTag ?? left.id).localeCompare(
        right.serialNumber ?? right.assetTag ?? right.id,
        'es',
      ),
    );
}

export function formatSerializedAssetLabel(asset: SerializedAssetRecord): string {
  if (asset.serialNumber?.trim()) {
    return asset.serialNumber.trim();
  }
  if (asset.assetTag?.trim()) {
    return asset.assetTag.trim();
  }
  return asset.id.slice(0, 8).toUpperCase();
}

export function formatLotOptionLabel(lotId: string, availableQty: number): string {
  return `Lote ${lotId.slice(0, 8).toUpperCase()} · ${availableQty}`;
}
