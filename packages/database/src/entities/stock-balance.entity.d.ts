import { StockBalanceCondition } from '@iwana/shared';
export declare class StockBalance {
    id: string;
    tenantId: string;
    itemId: string;
    locationId: string;
    lotId: string | null;
    condition: StockBalanceCondition;
    quantityOnHand: string;
    quantityReserved: string;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=stock-balance.entity.d.ts.map