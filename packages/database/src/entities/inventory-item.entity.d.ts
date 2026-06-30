import { InventoryItemCategory, InventoryItemKind, InventoryItemStatus, InventoryTrackingMode } from '@iwana/shared';
export declare class InventoryItem {
    id: string;
    tenantId: string;
    sku: string;
    name: string;
    description: string | null;
    brand: string | null;
    model: string | null;
    itemKind: InventoryItemKind;
    category: InventoryItemCategory;
    trackingMode: InventoryTrackingMode;
    unitOfMeasure: string;
    baseCost: string;
    minimumStock: string;
    purchasable: boolean;
    inventoryControlled: boolean;
    assetControlled: boolean;
    preferredSupplierRefId: string | null;
    supplierSku: string | null;
    purchaseUnitOfMeasure: string | null;
    purchaseToBaseUomFactor: string | null;
    standardCost: string;
    lastPurchaseCost: string | null;
    reorderPoint: string;
    targetStock: string;
    minimumOrderQty: string | null;
    orderMultiple: string | null;
    leadTimeDays: number | null;
    usefulLifeMonths: number | null;
    commercialReferenceId: string | null;
    status: InventoryItemStatus;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=inventory-item.entity.d.ts.map