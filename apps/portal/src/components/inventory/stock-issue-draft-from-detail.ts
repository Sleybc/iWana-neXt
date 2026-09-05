import {
  InventoryTrackingMode,
  StockBalanceCondition,
  type StockIssuePickableItem,
} from '@iwana/shared';
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

/**
 * Reconstruye el borrador desde el detalle (modo edición, S1). La hidratación
 * de cada línea sale del caché de elegibles B1 (`pickableById`, con `lots[]` y
 * `availability[]` de la bodega de origen); `itemsById` queda como respaldo
 * legacy para etiqueta y unidad. Sin hidratación de `trackingMode`, C3
 * persistiría por esta vía: una línea serializada nunca ofrecería serial.
 */
export function buildDraftFromIssueDetail(
  issue: StockIssueDetailRecord,
  itemsById: Map<string, InventoryItemRecord>,
  pickableById?: Map<string, StockIssuePickableItem>,
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
        const pickable = pickableById?.get(line.itemId);
        return {
          id: line.id,
          itemId: line.itemId,
          productLabel:
            pickable != null
              ? `${pickable.sku} · ${pickable.name}`
              : item
                ? `${item.sku} · ${item.name}`
                : line.itemId,
          requestedQty: line.requestedQty,
          unitOfMeasure: pickable?.unitOfMeasure ?? item?.unitOfMeasure ?? '',
          isManual: false,
          condition: line.condition ?? StockBalanceCondition.NEW,
          lotId: line.lotId ?? '',
          serializedAssetId: line.serializedAssetId ?? '',
          serializedAssetLabel: '',
          trackingMode:
            pickable?.trackingMode ?? item?.trackingMode ?? InventoryTrackingMode.CONSUMABLE,
          lots: pickable?.lots ?? [],
          availability: pickable?.availability ?? [],
          availableSerialCount: pickable?.availableSerialCount ?? 0,
        };
      }),
    },
  };
}
