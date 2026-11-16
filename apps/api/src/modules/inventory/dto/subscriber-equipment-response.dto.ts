import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  AssetLifecycleEventType,
  SerializedAssetStatus,
  type SubscriberEquipmentHistoryItem,
  type SubscriberEquipmentItem,
  type SubscriberEquipmentResponse,
  type SubscriberMaterialItem,
} from '@iwana/shared';
import { ListMetaDto } from '../../../common/pagination/list-meta.dto';
import { SerializedAssetUsefulLifeResponseDto } from './serialized-asset-detail-response.dto';

/**
 * Proyección OpenAPI del contrato congelado A1 v1.0 `SubscriberEquipmentResponse`
 * (`@iwana/shared` → contracts/inventory/subscriber-equipment.ts). No agrega
 * comportamiento: documenta `GET /inventory/subscribers/:subscriberRefId/equipment`.
 */
export class SubscriberEquipmentItemResponseDto implements SubscriberEquipmentItem {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  loanId!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  assetId!: string;

  @ApiProperty({ example: 'ONT GPON doble banda' })
  @Allow()
  itemName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'HG8145V5' })
  @Allow()
  model!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'SN-EJEMPLO-0001' })
  @Allow()
  serialNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '00:11:22:33:44:55' })
  @Allow()
  macAddress!: string | null;

  @ApiProperty({ enum: SerializedAssetStatus, description: 'Estado actual del activo.' })
  @Allow()
  status!: SerializedAssetStatus;

  @ApiProperty({ format: 'date-time', description: 'Inicio del comodato.' })
  @Allow()
  installedAt!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cierre del comodato; null si sigue abierto.',
  })
  @Allow()
  removedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Referencia opaca a la OT que originó el comodato.',
  })
  @Allow()
  executionOrderRefId!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Referencia opaca al contrato del suscriptor.',
  })
  @Allow()
  contractRefId!: string | null;

  @ApiProperty({
    type: SerializedAssetUsefulLifeResponseDto,
    description: 'Vida útil y garantía derivadas, igual que la ficha 360 del activo.',
  })
  @Allow()
  usefulLife!: SerializedAssetUsefulLifeResponseDto;
}

export class SubscriberMaterialItemResponseDto implements SubscriberMaterialItem {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  movementId!: string;

  @ApiProperty({ example: 'MOV-000123' })
  @Allow()
  movementNumber!: string;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  occurredAt!: string;

  @ApiProperty({ example: 'Cable drop 1 hilo' })
  @Allow()
  itemName!: string;

  @ApiProperty({ example: '35.00', description: 'Cantidad positiva (decimal como cadena).' })
  @Allow()
  quantity!: string;

  @ApiProperty({ example: 'METER', description: 'Código de unidad de medida del ítem.' })
  @Allow()
  unitOfMeasure!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Referencia opaca a la OT del movimiento.',
  })
  @Allow()
  executionOrderRefId!: string | null;
}

export class SubscriberEquipmentHistoryItemResponseDto implements SubscriberEquipmentHistoryItem {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  assetId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Allow()
  serialNumber!: string | null;

  @ApiProperty({ enum: AssetLifecycleEventType })
  @Allow()
  eventType!: AssetLifecycleEventType;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  occurredAt!: string;
}

export class SubscriberMaterialsPageResponseDto {
  @ApiProperty({ type: [SubscriberMaterialItemResponseDto] })
  @Allow()
  items!: SubscriberMaterialItemResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  @Allow()
  meta!: ListMetaDto;
}

export class SubscriberEquipmentHistoryPageResponseDto {
  @ApiProperty({ type: [SubscriberEquipmentHistoryItemResponseDto] })
  @Allow()
  items!: SubscriberEquipmentHistoryItemResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  @Allow()
  meta!: ListMetaDto;
}

export class SubscriberEquipmentResponseDto implements SubscriberEquipmentResponse {
  @ApiProperty({
    type: [SubscriberEquipmentItemResponseDto],
    description:
      'Todos los comodatos del suscriptor: abiertos primero, luego por instalación descendente.',
  })
  @Allow()
  equipment!: SubscriberEquipmentItemResponseDto[];

  @ApiProperty({ type: SubscriberMaterialsPageResponseDto })
  @Allow()
  materials!: SubscriberMaterialsPageResponseDto;

  @ApiProperty({ type: SubscriberEquipmentHistoryPageResponseDto })
  @Allow()
  history!: SubscriberEquipmentHistoryPageResponseDto;
}
