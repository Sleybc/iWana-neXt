import { PurchaseRequestLineSourceKind, PurchaseRequestLineStatus } from '@iwana/shared';
export declare class PurchaseRequestLine {
    id: string;
    tenantId: string;
    purchaseRequestId: string;
    sourceKind: PurchaseRequestLineSourceKind;
    inventoryItemId: string | null;
    freeTextDescription: string | null;
    quantityRequested: string;
    unitOfMeasure: string;
    suggestedPartyRefId: string | null;
    lineStatus: PurchaseRequestLineStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=purchase-request-line.entity.d.ts.map