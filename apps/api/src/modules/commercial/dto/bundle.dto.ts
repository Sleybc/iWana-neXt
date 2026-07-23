import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DiscountType } from '@iwana/shared';

export class CreateBundleDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: '10.00' })
  @IsString()
  @IsNotEmpty()
  discountValue: string;

  @ApiProperty({ description: 'ISO 8601 fecha de inicio de vigencia' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 fecha de fin de vigencia (null = sin vencimiento)',
  })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  /** UUIDs de los ítems que componen el bundle (al menos 2) */
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds: string[];

  /** Cuáles de esos ítems son opcionales (false = opcional). Por defecto todos requeridos. */
  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs de ítems opcionales dentro del bundle',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  optionalItemIds?: string[];
}

/** Campos de listado de bundle (documentación OpenAPI). */
export class BundleListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: DiscountType })
  discountType: DiscountType;

  @ApiProperty()
  discountValue: string;

  @ApiProperty()
  validFrom: string;

  @ApiPropertyOptional({ nullable: true })
  validTo: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ description: 'Cantidad de ítems del bundle (catalog_bundle_items)' })
  itemCount: number;
}

export class UpdateBundleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discountValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
