import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockBalanceCondition,
} from '@iwana/shared';
import { ListMetaDto } from '../../../common/pagination/list-meta.dto';

/**
 * Proyección OpenAPI del contrato congelado `ExecutorCustodyResponse`
 * (`@iwana/shared` → contracts/inventory/executor-custody.ts). No agrega
 * comportamiento: documenta la respuesta de `GET /inventory/custody`.
 */
export class ExecutorCustodyLocationResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty({ example: 'Móvil técnico zona norte' })
  @Allow()
  name!: string;

  @ApiProperty({ enum: ['MOBILE_TECHNICIAN', 'MOBILE_CREW'] })
  @Allow()
  type!: 'MOBILE_TECHNICIAN' | 'MOBILE_CREW';

  @ApiProperty({ enum: ['TECHNICIAN', 'CREW'] })
  @Allow()
  responsibleType!: 'TECHNICIAN' | 'CREW';

  @ApiProperty({ format: 'uuid' })
  @Allow()
  responsibleRefId!: string;
}

export class ExecutorCustodyAssetResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  inventoryItemId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  serialNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  normalizedSerialNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  macAddress!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  normalizedMacAddress!: string | null;

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
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  updatedAt!: string;
}

export class ExecutorCustodyBalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  locationId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  lotId!: string | null;

  @ApiProperty({ enum: StockBalanceCondition })
  @Allow()
  condition!: StockBalanceCondition;

  @ApiProperty({ example: '12.00', description: 'Cantidad en existencia (decimal como cadena).' })
  @Allow()
  quantityOnHand!: string;

  @ApiProperty({
    example: '2.00',
    description: 'Cantidad comprometida (decimal como cadena).',
  })
  @Allow()
  quantityReserved!: string;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  updatedAt!: string;
}

export class ExecutorCustodyAssetsPageResponseDto {
  @ApiProperty({ type: [ExecutorCustodyAssetResponseDto] })
  @Allow()
  items!: ExecutorCustodyAssetResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  @Allow()
  meta!: ListMetaDto;
}

export class ExecutorCustodyBalancesPageResponseDto {
  @ApiProperty({ type: [ExecutorCustodyBalanceResponseDto] })
  @Allow()
  items!: ExecutorCustodyBalanceResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  @Allow()
  meta!: ListMetaDto;
}

export class ExecutorCustodyResponseDto {
  @ApiProperty({
    type: ExecutorCustodyLocationResponseDto,
    nullable: true,
    description: 'Ubicación móvil activa del responsable; null si no tiene custodia activa.',
  })
  @Allow()
  location!: ExecutorCustodyLocationResponseDto | null;

  @ApiProperty({ type: ExecutorCustodyAssetsPageResponseDto })
  @Allow()
  assets!: ExecutorCustodyAssetsPageResponseDto;

  @ApiProperty({ type: ExecutorCustodyBalancesPageResponseDto })
  @Allow()
  balances!: ExecutorCustodyBalancesPageResponseDto;
}
