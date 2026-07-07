import type { PurchaseRequestDetailRecord } from '@/lib/api-client';

export const PURCHASE_SOURCE_TAB_STORAGE_KEY = 'iwana.portal.purchase-composer-source-tab';

export type PurchaseSourceTab = 'suggestions' | 'catalog';

export function readStoredPurchaseSourceTab(): PurchaseSourceTab | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(PURCHASE_SOURCE_TAB_STORAGE_KEY);
  return stored === 'suggestions' || stored === 'catalog' ? stored : null;
}

export function writeStoredPurchaseSourceTab(tab: PurchaseSourceTab): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PURCHASE_SOURCE_TAB_STORAGE_KEY, tab);
}

export function buildPurchaseItemFrequency(
  details: Pick<PurchaseRequestDetailRecord, 'lines'>[],
): Record<string, number> {
  const frequency: Record<string, number> = {};

  details.forEach((detail) => {
    detail.lines.forEach((line) => {
      if (!line.inventoryItemId) {
        return;
      }

      frequency[line.inventoryItemId] = (frequency[line.inventoryItemId] ?? 0) + 1;
    });
  });

  return frequency;
}
