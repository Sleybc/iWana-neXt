import type { InventoryConsumptionRejectionReasonCode } from '@iwana/shared';

/** Rechazo de negocio terminal que MOD12 devuelve a MOD11 como resultado. */
export class InventoryBusinessRejection extends Error {
  constructor(readonly reasonCode: InventoryConsumptionRejectionReasonCode) {
    super(reasonCode);
    this.name = 'InventoryBusinessRejection';
  }
}
