import { StockMovementOrigin } from '@iwana/shared';
export declare class StockMovement {
    id: string;
    tenantId: string;
    movementNumber: string;
    origin: StockMovementOrigin;
    originContext: string;
    originRefId: string | null;
    idempotencyKey: string;
    notes: string | null;
    actorUserId: string | null;
    reversedByMovementId: string | null;
    isReversal: boolean;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=stock-movement.entity.d.ts.map