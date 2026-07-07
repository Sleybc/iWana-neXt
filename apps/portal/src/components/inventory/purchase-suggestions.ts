export type PurchaseSuggestionReason =
  | 'Sin stock'
  | 'Bajo minimo'
  | 'Consumo reciente alto'
  | 'Compra frecuente';

export interface PurchaseSuggestionRecord {
  itemId: string;
  reason: PurchaseSuggestionReason;
  quantityOnHand: number;
  priorityScore: number;
}

const REASON_PRIORITY: Record<PurchaseSuggestionReason, number> = {
  'Sin stock': 100,
  'Bajo minimo': 85,
  'Consumo reciente alto': 75,
  'Compra frecuente': 65,
};

function resolvePrimaryReason(
  candidates: PurchaseSuggestionReason[],
): PurchaseSuggestionReason | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => REASON_PRIORITY[right] - REASON_PRIORITY[left])[0]!;
}

export function buildPurchaseSuggestions(input: {
  items: Array<{
    id: string;
    minimumStock: string;
    reorderPoint?: string | null;
    targetStock?: string | null;
    purchasable: boolean;
  }>;
  balances: Array<{ itemId: string; quantityOnHand: string }>;
  purchaseItemFrequency?: Record<string, number>;
  limit: number;
}): PurchaseSuggestionRecord[] {
  const quantityByItem = new Map<string, number>();

  input.balances.forEach((balance) => {
    quantityByItem.set(
      balance.itemId,
      (quantityByItem.get(balance.itemId) ?? 0) + Number.parseFloat(balance.quantityOnHand),
    );
  });

  const suggestions: PurchaseSuggestionRecord[] = [];

  input.items
    .filter((item) => item.purchasable)
    .forEach((item) => {
      const quantityOnHand = quantityByItem.get(item.id) ?? 0;
      const minimumStock = Number.parseFloat(item.minimumStock || '0');
      const reorderPoint = Number.parseFloat(item.reorderPoint || item.minimumStock || '0');
      const targetStock = Number.parseFloat(item.targetStock || '0');
      const purchaseCount = input.purchaseItemFrequency?.[item.id] ?? 0;
      const candidates: PurchaseSuggestionReason[] = [];

      if (reorderPoint > 0 && quantityOnHand <= 0) {
        candidates.push('Sin stock');
      } else if (reorderPoint > 0 && quantityOnHand <= reorderPoint) {
        candidates.push('Bajo minimo');
      }

      if (
        targetStock > reorderPoint &&
        quantityOnHand <= reorderPoint &&
        targetStock - quantityOnHand >= Math.max(reorderPoint * 0.5, minimumStock)
      ) {
        candidates.push('Consumo reciente alto');
      }

      if (purchaseCount >= 2) {
        candidates.push('Compra frecuente');
      }

      const reason = resolvePrimaryReason(
        candidates.filter((candidate) => candidate !== 'Compra frecuente'),
      );
      if (!reason) {
        return;
      }

      suggestions.push({
        itemId: item.id,
        reason,
        quantityOnHand,
        priorityScore:
          REASON_PRIORITY[reason] +
          Math.min(purchaseCount, 5) +
          (candidates.includes('Consumo reciente alto') ? 3 : 0),
      });
    });

  return suggestions
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.quantityOnHand - right.quantityOnHand;
    })
    .slice(0, input.limit);
}
