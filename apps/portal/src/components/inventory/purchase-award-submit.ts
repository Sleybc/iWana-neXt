import type { PurchaseRequestLineAwardInput as ContractAwardInput } from '@iwana/shared';
import type {
  CreatePurchaseRequestAwardsDto,
  PurchaseRequestLineAwardInput as ApiAwardInput,
} from '@/lib/api-client';

/**
 * Punto de integración FE-3 (MOD12 Compras, Fase 30): el contrato congelado
 * viaja con cantidades como cadena decimal (`@iwana/shared`,
 * `toCreateAwardsDto`) y el DTO del api-client con números. Este módulo puro
 * (sin React) es la única sede del mapeo string→number, consumida por
 * `InventoryClient.handleCreateAwards`.
 *
 * Una cadena no numérica cae a 0 y el servidor la rechaza con su validación;
 * el panel ya valida cantidades y costo antes de enviar, así que ese camino
 * no ocurre en uso normal.
 */
export function mapContractAwardToApiInput(draft: ContractAwardInput): ApiAwardInput {
  const quantity = Number(draft.awardedQuantity);
  const unitCost = draft.unitCost === undefined ? undefined : Number(draft.unitCost);
  return {
    purchaseRequestLineId: draft.purchaseRequestLineId,
    awardedPartyRefId: draft.awardedPartyRefId,
    awardedQuantity: Number.isFinite(quantity) ? quantity : 0,
    ...(draft.supplierQuoteId ? { supplierQuoteId: draft.supplierQuoteId } : {}),
    ...(draft.awardNotes ? { awardNotes: draft.awardNotes } : {}),
    ...(unitCost !== undefined ? { unitCost: Number.isFinite(unitCost) ? unitCost : 0 } : {}),
  };
}

export function mapContractAwardsToApiDto(
  drafts: ContractAwardInput[],
): CreatePurchaseRequestAwardsDto {
  return { awards: drafts.map(mapContractAwardToApiInput) };
}
