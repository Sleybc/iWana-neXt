import {
  AssetLifecycleEventType,
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockLocationType,
} from '@iwana/shared';
import { StockMovementKardexRecord } from '../services/stock-movement-query.service';

export type UsefulLifeStatus = 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';

export interface SerializedAssetItemSummary {
  id: string;
  sku: string;
  name: string;
  categoryName: string | null;
}

export interface SerializedAssetLocationSummary {
  id: string;
  code: string;
  name: string;
  type: StockLocationType;
}

export interface SerializedAssetPurchaseOrigin {
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  goodsReceiptId: string | null;
  receivedAt: Date | null;
  supplierPartyRefId: string | null;
  supplierDisplayName: string | null;
  unitCost: string | null;
}

export interface SerializedAssetUsefulLife {
  monthsTotal: number | null;
  monthsElapsed: number | null;
  monthsRemaining: number | null;
  warrantyUntil: string | null;
  status: UsefulLifeStatus;
}

export interface AssetLifecycleEventRecord {
  id: string;
  eventType: AssetLifecycleEventType;
  fromStatus: SerializedAssetStatus | null;
  toStatus: SerializedAssetStatus | null;
  locationId: string | null;
  locationName: string | null;
  responsibleRefId: string | null;
  actorUserId: string | null;
  notes: string | null;
  occurredAt: Date;
  stockMovementId: string | null;
}

export interface AssetLoanRecord {
  id: string;
  serializedAssetId: string;
  subscriberRefId: string;
  contractRefId: string | null;
  installedAt: Date;
  removedAt: Date | null;
  executionOrderRefId: string | null;
  stockMovementId: string | null;
  status: 'abierto' | 'cerrado';
}

export interface SerializedAssetDetailRecord {
  id: string;
  inventoryItemId: string;
  serialNumber: string | null;
  macAddress: string | null;
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
  item: SerializedAssetItemSummary | null;
  currentLocation: SerializedAssetLocationSummary | null;
  purchaseOrigin: SerializedAssetPurchaseOrigin | null;
  usefulLife: SerializedAssetUsefulLife;
  lifecycle: {
    data: AssetLifecycleEventRecord[];
    total: number;
    page: number;
    limit: number;
  };
  movements: {
    data: StockMovementKardexRecord[];
    total: number;
    page: number;
    limit: number;
  };
  loans: {
    data: AssetLoanRecord[];
    total: number;
  };
}
