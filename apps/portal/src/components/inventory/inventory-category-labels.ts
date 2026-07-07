'use client';

import { InventoryCategoryStatus } from '@iwana/shared';

export const INVENTORY_CATEGORY_STATUS_LABELS: Record<InventoryCategoryStatus, string> = {
  [InventoryCategoryStatus.ACTIVE]: 'Activa',
  [InventoryCategoryStatus.INACTIVE]: 'Inactiva',
};

export function getInventoryCategoryStatusLabel(value: InventoryCategoryStatus): string {
  return INVENTORY_CATEGORY_STATUS_LABELS[value] ?? value;
}

export function getInventoryCategoryStatusBadgeVariant(
  value: InventoryCategoryStatus,
): 'success' | 'neutral' {
  return value === InventoryCategoryStatus.ACTIVE ? 'success' : 'neutral';
}
