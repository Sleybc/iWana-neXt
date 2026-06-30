import { GoodsReceiptStatus } from '@iwana/shared';
export declare class GoodsReceipt {
    id: string;
    tenantId: string;
    receiptNumber: string;
    purchaseOrderId: string;
    status: GoodsReceiptStatus;
    receivedAt: Date;
    receivedByUserId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=goods-receipt.entity.d.ts.map