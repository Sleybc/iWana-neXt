import { Injectable } from '@nestjs/common';
import type { InventoryDisposition } from '@iwana/shared';

/** Línea de consumo efectiva de una OT cerrada: sin reversos confirmados ni movimientos rechazados. */
export interface ClosedInstallationConsumptionLine {
  itemId: string;
  quantity: number;
  serialNumber: string | null;
  finalDisposition: InventoryDisposition;
}

export interface ClosedInstallationConsumption {
  executionOrderId: string;
  executionOrderNumber: string;
  subscriberId: string | null;
  closedAt: string;
  lines: ClosedInstallationConsumptionLine[];
}

/**
 * Puerto de MOD11 que expone el consumo de una OT de instalación cerrada como ejecutada
 * (spec MOD14 2026-11-13, bloque A). Consumido por MOD14 para asociarlo al contrato.
 */
@Injectable()
export abstract class ExecutionOrderConsumptionReadPort {
  /**
   * Null si la OT no existe en el tenant, no es de instalación, está anulada o no cerró con
   * resultado ejecutado. Solo cuentan los consumos que quedan en el cliente o se gastan en la
   * instalación (`INSTALLED_AT_CUSTOMER`, `INTERNAL_CONSUMPTION`).
   */
  abstract getClosedInstallationConsumption(
    executionOrderId: string,
  ): Promise<ClosedInstallationConsumption | null>;
}
