import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
export declare class PurchaseRequest {
    id: string;
    tenantId: string;
    requestNumber: string;
    title: string;
    status: PurchaseRequestStatus;
    requestType: PurchaseRequestType;
    priority: PurchaseRequestPriority;
    requestedByUserId: string;
    requestingArea: string | null;
    justification: string | null;
    operationalRefType: string | null;
    operationalRefId: string | null;
    exceptionReason: string | null;
    approvedByUserId: string | null;
    neededByDate: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=purchase-request.entity.d.ts.map