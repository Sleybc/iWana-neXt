import { Injectable } from '@nestjs/common';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockLedgerService } from '../services/stock-ledger.service';

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
}

export const INVENTORY_MOVEMENT_PORT = 'INVENTORY_MOVEMENT_PORT';

@Injectable()
export class InventoryMovementPortAdapter implements InventoryMovementPort {
  constructor(private readonly stockLedgerService: StockLedgerService) {}

  async consumeFromExecutionOrder(
    input: ConsumeFromExecutionOrderInput,
    actor: JwtPayload,
  ): Promise<{ stockMovementId: string }> {
    const result = await this.stockLedgerService.recordExecutionOrderMovement(input, actor);
    return { stockMovementId: result.movement.id };
  }
}
