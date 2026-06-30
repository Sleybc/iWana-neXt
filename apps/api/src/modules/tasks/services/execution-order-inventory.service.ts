import { Inject, Injectable, Optional } from '@nestjs/common';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPort,
} from '../../inventory/ports/inventory-movement.port';

export interface ConsumeTechnicianCustodyInput {
  executionOrderId: string;
  itemId: string;
  technicianCustodyId: string;
  quantity: number;
  serialNumber?: string | null;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  stockMovementId?: string | null;
}

@Injectable()
export class ExecutionOrderInventoryService {
  constructor(
    @Optional()
    @Inject(INVENTORY_MOVEMENT_PORT)
    private readonly inventoryMovementPort?: InventoryMovementPort,
  ) {}

  /**
   * Adaptador MVP: conserva la trazabilidad operativa sin acoplar todavía
   * un bounded context formal de inventario. Cuando exista ese módulo,
   * este servicio debe delegar a un puerto tipado.
   */
  async consumeTechnicianCustody(
    input: ConsumeTechnicianCustodyInput,
    actor: JwtPayload,
  ): Promise<{ stockMovementId: string; finalDisposition: InventoryDisposition }> {
    if (this.inventoryMovementPort) {
      const result = await this.inventoryMovementPort.consumeFromExecutionOrder(
        {
          executionOrderId: input.executionOrderId,
          itemId: input.itemId,
          technicianCustodyId: input.technicianCustodyId,
          quantity: input.quantity,
          serialNumber: input.serialNumber ?? null,
          action: input.action,
          finalDisposition: input.finalDisposition,
          idempotencyKey: input.stockMovementId ?? null,
        },
        actor,
      );

      return {
        stockMovementId: result.stockMovementId,
        finalDisposition: input.finalDisposition,
      };
    }

    const stockMovementId =
      input.stockMovementId?.trim() ||
      `eo-${input.executionOrderId.slice(0, 8)}-${actor.sub.slice(0, 8)}-${Date.now()}`;

    return {
      stockMovementId,
      finalDisposition: input.finalDisposition,
    };
  }
}
