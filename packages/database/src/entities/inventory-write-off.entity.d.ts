import { WriteOffReason, WriteOffStatus } from '@iwana/shared';
export declare class InventoryWriteOff {
    id: string;
    tenantId: string;
    serializedAssetId: string | null;
    itemId: string | null;
    reason: WriteOffReason;
    status: WriteOffStatus;
    requestedByUserId: string;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    stockMovementId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=inventory-write-off.entity.d.ts.map