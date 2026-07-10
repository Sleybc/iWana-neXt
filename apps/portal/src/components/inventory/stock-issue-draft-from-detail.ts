import { StockBalanceCondition } from '@iwana/shared';
import type { InventoryItemRecord, StockIssueDetailRecord } from '@/lib/api-client';
import type { StockIssueDraftState } from './stock-issue-draft';

export interface StockIssueHeaderFromDetail {
  type: StockIssueDetailRecord['type'];
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
}

export function buildDraftFromIssueDetail(
  issue: StockIssueDetailRecord,
  itemsById: Map<string, InventoryItemRecord>,
): { header: StockIssueHeaderFromDetail; draft: StockIssueDraftState } {
  return {
    header: {
      type: issue.type,
      sourceLocationId: issue.sourceLocationId,
      destinationLocationId: issue.destinationLocationId ?? '',
      commercialRefId: issue.commercialRefId ?? '',
      originRefId: issue.originRefId ?? '',
      costCenter: issue.costCenter ?? '',
      reason: issue.reason ?? '',
    },
    draft: {
      lines: issue.lines.map((line) => {
        const item = itemsById.get(line.itemId);
        return {
          id: line.id,
          itemId: line.itemId,
          productLabel: item ? `${item.sku} · ${item.name}` : line.itemId,
          requestedQty: line.requestedQty,
          unitOfMeasure: item?.unitOfMeasure ?? '',
          isManual: false,
          condition: line.condition ?? StockBalanceCondition.NEW,
          lotId: line.lotId ?? '',
          serializedAssetId: line.serializedAssetId ?? '',
        };
      }),
    },
  };
}
