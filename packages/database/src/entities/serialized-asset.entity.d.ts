import { InventoryResponsibleType, SerializedAssetStatus } from '@iwana/shared';
export declare class SerializedAsset {
    id: string;
    tenantId: string;
    inventoryItemId: string;
    serialNumber: string | null;
    normalizedSerialNumber: string | null;
    macAddress: string | null;
    normalizedMacAddress: string | null;
    assetTag: string | null;
    currentStatus: SerializedAssetStatus;
    currentLocationId: string | null;
    currentResponsibleType: InventoryResponsibleType;
    currentResponsibleRefId: string | null;
    subscriberRefId: string | null;
    contractRefId: string | null;
    purchaseOrderRef: string | null;
    purchaseDate: string | null;
    usefulLifeMonths: number | null;
    warrantyUntil: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=serialized-asset.entity.d.ts.map