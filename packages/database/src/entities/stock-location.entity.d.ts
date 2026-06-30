import { StockLocationStatus, StockLocationType } from '@iwana/shared';
export declare class StockLocation {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    type: StockLocationType;
    status: StockLocationStatus;
    responsibleRefId: string | null;
    maxCapacity: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=stock-location.entity.d.ts.map