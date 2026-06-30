import { PurchaseOrderStatus } from '@iwana/shared';
export declare class PurchaseOrder {
    id: string;
    tenantId: string;
    orderNumber: string;
    purchaseRequestId: string | null;
    partyRefId: string;
    status: PurchaseOrderStatus;
    expectedDeliveryDate: string | null;
    approvedByUserId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=purchase-order.entity.d.ts.map