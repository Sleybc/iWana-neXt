import { ApiProperty, ApiPropertyOptional, ApiSchema, OmitType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CatalogItemType, ChargeType, InstallationRule, ProductCategory } from '@iwana/shared';

export class CreateCatalogItemDto {
  @ApiProperty({ enum: CatalogItemType })
  @IsEnum(CatalogItemType)
  type: CatalogItemType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'UUID de la clasificación tributaria' })
  @IsOptional()
  @IsUUID()
  taxClassificationId?: string;

  @ApiPropertyOptional({ description: 'Marca si el ítem está sujeto a retención' })
  @IsOptional()
  @IsBoolean()
  retentionApplicable?: boolean;

  // ─── Detalle según type ─────────────────────────────────────────────────

  /** Solo para type=PLAN */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  downloadSpeedMbps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  uploadSpeedMbps?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technology?: string;

  @ApiPropertyOptional({ enum: InstallationRule })
  @IsOptional()
  @IsEnum(InstallationRule)
  installationRule?: InstallationRule;

  /** Solo para type=PRODUCT */
  @ApiPropertyOptional({ enum: ProductCategory })
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @ApiPropertyOptional()
  @IsOptional()
  isLoan?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  requiresInventory?: boolean;

  /** Solo para type=SERVICE */
  @ApiPropertyOptional({ enum: ChargeType })
  @IsOptional()
  @IsEnum(ChargeType)
  chargeType?: ChargeType;
}

@ApiSchema({ name: 'CommercialCreatePlanCatalogItemDto' })
export class CreatePlanCatalogItemDto extends OmitType(CreateCatalogItemDto, ['type'] as const) {}

export class CreateProductCatalogItemDto extends OmitType(CreateCatalogItemDto, [
  'type',
] as const) {}

export class CreateServiceCatalogItemDto extends OmitType(CreateCatalogItemDto, [
  'type',
] as const) {}
