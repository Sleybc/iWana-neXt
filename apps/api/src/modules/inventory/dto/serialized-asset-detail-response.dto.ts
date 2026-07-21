import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  AssetLifecycleEventType,
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockLocationType,
  StockMovementOrigin,
} from '@iwana/shared';

export class SerializedAssetDetailItemResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  sku!: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  categoryName!: string | null;
}

export class SerializedAssetDetailLocationResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  code!: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiProperty({ enum: StockLocationType })
  @Allow()
  type!: StockLocationType;
}

export class SerializedAssetPurchaseOriginResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  purchaseOrderId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  purchaseOrderNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  goodsReceiptId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Allow()
  receivedAt!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  supplierPartyRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  supplierDisplayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  unitCost!: string | null;
}

export class SerializedAssetUsefulLifeResponseDto {
  @ApiPropertyOptional({ type: Number, nullable: true })
  @Allow()
  monthsTotal!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Allow()
  monthsElapsed!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Allow()
  monthsRemaining!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  warrantyUntil!: string | null;

  @ApiProperty({ enum: ['sin-dato', 'vigente', 'por-vencer', 'vencida'] })
  @Allow()
  status!: 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';
}

export class AssetLifecycleEventResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty({ enum: AssetLifecycleEventType })
  @Allow()
  eventType!: AssetLifecycleEventType;

  @ApiPropertyOptional({ enum: SerializedAssetStatus, nullable: true })
  @Allow()
  fromStatus!: SerializedAssetStatus | null;

  @ApiPropertyOptional({ enum: SerializedAssetStatus, nullable: true })
  @Allow()
  toStatus!: SerializedAssetStatus | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  locationId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  locationName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  responsibleRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  actorUserId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  occurredAt!: Date;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Movimiento de ledger que originó el evento, cuando aplica.',
  })
  @Allow()
  stockMovementId!: string | null;
}

export class PaginatedAssetLifecycleEventsResponseDto {
  @ApiProperty({ type: [AssetLifecycleEventResponseDto] })
  @Allow()
  data!: AssetLifecycleEventResponseDto[];

  @ApiProperty()
  @Allow()
  total!: number;

  @ApiProperty()
  @Allow()
  page!: number;

  @ApiProperty()
  @Allow()
  limit!: number;
}

export class StockMovementKardexLineResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  itemName!: string;

  @ApiProperty()
  @Allow()
  itemSku!: string;

  @ApiProperty()
  @Allow()
  locationId!: string;

  @ApiProperty()
  @Allow()
  locationName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  lotId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  lotNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  serializedAssetId!: string | null;

  @ApiProperty()
  @Allow()
  quantity!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  unitCost!: string | null;
}

export class StockMovementKardexResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  movementNumber!: string;

  @ApiProperty({ enum: StockMovementOrigin })
  @Allow()
  origin!: StockMovementOrigin;

  @ApiProperty()
  @Allow()
  originContext!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  originRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  adjustmentReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  notes!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  actorUserId!: string | null;

  @ApiProperty()
  @Allow()
  isReversal!: boolean;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  createdAt!: Date;

  @ApiProperty({ type: [StockMovementKardexLineResponseDto] })
  @Allow()
  lines!: StockMovementKardexLineResponseDto[];
}

export class PaginatedAssetMovementsResponseDto {
  @ApiProperty({ type: [StockMovementKardexResponseDto] })
  @Allow()
  data!: StockMovementKardexResponseDto[];

  @ApiProperty()
  @Allow()
  total!: number;

  @ApiProperty()
  @Allow()
  page!: number;

  @ApiProperty()
  @Allow()
  limit!: number;
}

export class AssetLoanResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  serializedAssetId!: string;

  @ApiProperty()
  @Allow()
  subscriberRefId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  contractRefId!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  installedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @Allow()
  removedAt!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  executionOrderRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  stockMovementId!: string | null;

  @ApiProperty({ enum: ['abierto', 'cerrado'] })
  @Allow()
  status!: 'abierto' | 'cerrado';
}

export class AssetLoansSectionResponseDto {
  @ApiProperty({ type: [AssetLoanResponseDto] })
  @Allow()
  data!: AssetLoanResponseDto[];

  @ApiProperty()
  @Allow()
  total!: number;
}

export class SerializedAssetDetailResponseDto {
  @ApiProperty()
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  inventoryItemId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  serialNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  macAddress!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  assetTag!: string | null;

  @ApiProperty({ enum: SerializedAssetStatus })
  @Allow()
  currentStatus!: SerializedAssetStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  currentLocationId!: string | null;

  @ApiProperty({ enum: InventoryResponsibleType })
  @Allow()
  currentResponsibleType!: InventoryResponsibleType;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  currentResponsibleRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  subscriberRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  contractRefId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  purchaseOrderRef!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  purchaseDate!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Allow()
  usefulLifeMonths!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  warrantyUntil!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: SerializedAssetDetailItemResponseDto, nullable: true })
  @Allow()
  item!: SerializedAssetDetailItemResponseDto | null;

  @ApiPropertyOptional({ type: SerializedAssetDetailLocationResponseDto, nullable: true })
  @Allow()
  currentLocation!: SerializedAssetDetailLocationResponseDto | null;

  @ApiPropertyOptional({ type: SerializedAssetPurchaseOriginResponseDto, nullable: true })
  @Allow()
  purchaseOrigin!: SerializedAssetPurchaseOriginResponseDto | null;

  @ApiProperty({ type: SerializedAssetUsefulLifeResponseDto })
  @Allow()
  usefulLife!: SerializedAssetUsefulLifeResponseDto;

  @ApiProperty({ type: PaginatedAssetLifecycleEventsResponseDto })
  @Allow()
  lifecycle!: PaginatedAssetLifecycleEventsResponseDto;

  @ApiProperty({ type: PaginatedAssetMovementsResponseDto })
  @Allow()
  movements!: PaginatedAssetMovementsResponseDto;

  @ApiProperty({ type: AssetLoansSectionResponseDto })
  @Allow()
  loans!: AssetLoansSectionResponseDto;
}
