import { Injectable } from '@nestjs/common';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryItemService } from '../services/inventory-item.service';

/** Recibo autoritativo de clasificación de un artículo del catálogo. */
export interface InventoryItemCategoryReceipt {
  itemId: string;
  categoryId: string;
  categoryCode: string;
}

export interface ConsumeFromExecutionOrderInput {
  executionOrderId: string;
  itemId: string;
  technicianCustodyId: string;
  quantity: number;
  serialNumber?: string | null;
  subscriberId?: string | null;
  customerSiteLocationId?: string | null;
  action: ExecutionOrderItemAction;
  finalDisposition: InventoryDisposition;
  idempotencyKey?: string | null;
}

export interface InventoryMovementPort {
  consumeFromExecutionOrder(
    input: ConsumeFromExecutionOrderInput,
    actor: JwtPayload,
  ): Promise<{ stockMovementId: string }>;

  /** Resuelve la categoría canónica desde el catálogo real de Inventario. */
  getItemCategoryReceipt(itemId: string): Promise<InventoryItemCategoryReceipt>;
}

export const INVENTORY_MOVEMENT_PORT = 'INVENTORY_MOVEMENT_PORT';

@Injectable()
export class InventoryMovementPortAdapter implements InventoryMovementPort {
  constructor(
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryItemService: InventoryItemService,
  ) {}

  async consumeFromExecutionOrder(
    input: ConsumeFromExecutionOrderInput,
    actor: JwtPayload,
  ): Promise<{ stockMovementId: string }> {
    const result = await this.stockLedgerService.recordExecutionOrderMovement(input, actor);
    return { stockMovementId: result.movement.id };
  }

  async getItemCategoryReceipt(itemId: string): Promise<InventoryItemCategoryReceipt> {
    const item = await this.inventoryItemService.getById(itemId);

    return {
      itemId: item.id,
      categoryId: item.categoryId,
      categoryCode: item.categoryCode,
    };
  }
}
