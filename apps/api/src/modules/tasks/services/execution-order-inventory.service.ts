import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPort,
} from '../../inventory/ports/inventory-movement.port';
import type { InventoryItemCategoryReceipt } from '../../inventory/ports/inventory-movement.port';

export interface ConsumeTechnicianCustodyInput {
  executionOrderId: string;
  itemId: string;
  technicianCustodyId: string;
  quantity: number;
  serialNumber?: string | null;
  subscriberId?: string | null;
  customerSiteLocationId?: string | null;
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
          subscriberId: input.subscriberId ?? null,
          customerSiteLocationId: input.customerSiteLocationId ?? null,
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

    // Nunca fabricar un identificador: sin MOD12 no existe movimiento
    // confirmado y la solicitud debe quedar reintentable/reconciliable.
    throw new ServiceUnavailableException({
      code: 'INVENTORY_MOVEMENT_UNAVAILABLE',
      message: 'El movimiento de inventario no está disponible temporalmente.',
    });
  }

  /**
   * Obtiene la clasificación desde Inventario; nunca se deriva del itemId ni
   * se acepta una categoría declarada por el cliente.
   */
  async getItemCategoryReceipt(itemId: string): Promise<InventoryItemCategoryReceipt> {
    if (!this.inventoryMovementPort) {
      throw new ServiceUnavailableException({
        code: 'INVENTORY_CATALOG_UNAVAILABLE',
        message: 'La clasificación del artículo no está disponible temporalmente.',
      });
    }

    return this.inventoryMovementPort.getItemCategoryReceipt(itemId);
  }
}
