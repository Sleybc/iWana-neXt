import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';
export declare class ExecutionOrderItemUsage {
    id: string;
    executionOrderId: string;
    tenantId: string;
    itemId: string;
    technicianCustodyId: string;
    quantity: string;
    serialNumber: string | null;
    action: ExecutionOrderItemAction;
    finalDisposition: InventoryDisposition;
    stockMovementId: string | null;
    actorUserId: string | null;
    createdAt: Date;
}
//# sourceMappingURL=execution-order-item-usage.entity.d.ts.map