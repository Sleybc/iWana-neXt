import type {
  InventoryConsumptionRejectionReasonCode,
  InventoryReversalRejectionReasonCode,
} from '@iwana/shared';

export type InventoryBusinessRejectionReasonCode =
  | InventoryConsumptionRejectionReasonCode
  | InventoryReversalRejectionReasonCode;

/** Rechazo de negocio terminal que MOD12 devuelve a MOD11 como resultado. */
export class InventoryBusinessRejection extends Error {
  constructor(readonly reasonCode: InventoryBusinessRejectionReasonCode) {
    super(reasonCode);
    this.name = 'InventoryBusinessRejection';
  }
}
