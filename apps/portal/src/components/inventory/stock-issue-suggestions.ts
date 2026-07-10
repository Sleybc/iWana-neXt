import type { InventoryItemRecord, StockBalanceRecord } from '@/lib/api-client';
import { buildAvailableQuantityByItemAtLocation } from './stock-issue-balance-utils';

export interface StockIssueSuggestionRecord {
  itemId: string;
  productLabel: string;
  availableQty: number;
  helperLabel: string;
}

export interface BuildStockIssueSuggestionsInput {
  items: Array<Pick<InventoryItemRecord, 'id' | 'sku' | 'name' | 'unitOfMeasure'>>;
  balances: StockBalanceRecord[];
  sourceLocationId: string;
  search?: string;
  issueItemFrequency?: Record<string, number>;
  limit?: number;
}

export function buildStockIssueSuggestions(
  input: BuildStockIssueSuggestionsInput,
): StockIssueSuggestionRecord[] {
  const { sourceLocationId, issueItemFrequency = {}, limit = 50 } = input;
  if (!sourceLocationId.trim()) {
    return [];
  }

  const availableByItem = buildAvailableQuantityByItemAtLocation(input.balances, sourceLocationId);

  const query = input.search?.trim().toLowerCase() ?? '';

  const suggestions = input.items
    .map((item) => {
      const availableQty = availableByItem.get(item.id) ?? 0;
      return {
        itemId: item.id,
        productLabel: `${item.sku} · ${item.name}`,
        availableQty,
        unitOfMeasure: item.unitOfMeasure,
      };
    })
    .filter((entry) => entry.availableQty > 0)
    .filter((entry) => {
      if (!query) {
        return true;
      }
      return entry.productLabel.toLowerCase().includes(query);
    })
    .map((entry) => ({
      itemId: entry.itemId,
      productLabel: entry.productLabel,
      availableQty: entry.availableQty,
      helperLabel: `Disponible en origen: ${entry.availableQty} ${entry.unitOfMeasure}`,
    }));

  suggestions.sort((left, right) => {
    const leftFrequency = issueItemFrequency[left.itemId] ?? 0;
    const rightFrequency = issueItemFrequency[right.itemId] ?? 0;
    if (leftFrequency !== rightFrequency) {
      return rightFrequency - leftFrequency;
    }

    if (left.availableQty !== right.availableQty) {
      return right.availableQty - left.availableQty;
    }

    return left.productLabel.localeCompare(right.productLabel, 'es');
  });

  return suggestions.slice(0, limit);
}

export function buildIssueItemFrequencyFromIssueLines(
  issues: Array<{ lines: Array<{ itemId: string }> }>,
): Record<string, number> {
  const frequency: Record<string, number> = {};

  for (const issue of issues) {
    for (const line of issue.lines) {
      const itemId = line.itemId.trim();
      if (!itemId) {
        continue;
      }
      frequency[itemId] = (frequency[itemId] ?? 0) + 1;
    }
  }

  return frequency;
}
