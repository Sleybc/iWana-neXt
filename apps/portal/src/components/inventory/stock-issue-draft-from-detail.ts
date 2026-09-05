import {
  InventoryTrackingMode,
  StockBalanceCondition,
  type StockIssuePickableItem,
} from '@iwana/shared';
import type { InventoryItemRecord, StockIssueDetailRecord } from '@/lib/api-client';
import type { StockIssueDraftState } from './stock-issue-draft';
import { buildDraftProductLabel, resolveLineSerializedAssetIds } from './stock-issue-draft';

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
): {
  header: StockIssueHeaderFromDetail;
  draft: StockIssueDraftState;
  /** Etiquetas legibles del contrato §5.5, para sembrar `serialLabelsById`. */
  serialLabelsById: Record<string, string>;
} {
  const serialLabelsById: Record<string, string> = {};
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
        // Grupo v2.1 del detalle (§5.5): id + número de serie por elemento; en
        // transición cae al singular S1 cuando el detalle aún no lo trae.
        const serialRefs = line.serializedAssets ?? [];
        const serialIds =
          serialRefs.length > 0
            ? serialRefs.map((entry) => entry.id)
            : resolveLineSerializedAssetIds(line);
        for (const entry of serialRefs) {
          if (entry.serialNumber?.trim()) {
            serialLabelsById[entry.id] = entry.serialNumber.trim();
          }
        }
        return {
          id: line.id,
          itemId: line.itemId,
          sku: pickable?.sku ?? item?.sku ?? '',
          productLabel:
            pickable != null
              ? buildDraftProductLabel(pickable.name)
              : item
                ? buildDraftProductLabel(item.name, item.model)
                : line.itemId,
          requestedQty: line.requestedQty,
          unitOfMeasure: pickable?.unitOfMeasure ?? item?.unitOfMeasure ?? '',
          isManual: false,
          condition: line.condition ?? StockBalanceCondition.NEW,
          lotId: line.lotId ?? '',
          serializedAssetId: serialIds[0] ?? '',
          serializedAssetLabel: serialIds.length === 1 ? (serialRefs[0]?.serialNumber ?? '') : '',
          serializedAssetIds: serialIds,
          trackingMode:
            pickable?.trackingMode ?? item?.trackingMode ?? InventoryTrackingMode.CONSUMABLE,
          lots: pickable?.lots ?? [],
          availability: pickable?.availability ?? [],
          availableSerialCount: pickable?.availableSerialCount ?? 0,
        };
      }),
    },
    serialLabelsById,
  };
}
