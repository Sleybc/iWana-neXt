import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ChargeType,
  InstallationRule,
  NetworkType,
  ProductCategory,
  VatConcept,
} from '@iwana/shared';

export class UpdateCatalogItemDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    enum: VatConcept,
    description: 'Concepto fiscal aplicable al ítem. Omitir conserva el valor actual.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(VatConcept)
  vatConcept?: VatConcept;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  taxClassificationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  retentionApplicable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ─── Detalle PLAN ────────────────────────────────────────────────────────

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  technology?: string;

  @ApiPropertyOptional({ enum: NetworkType })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(NetworkType)
  networkType?: NetworkType;

  @ApiPropertyOptional({ enum: InstallationRule })
  @IsOptional()
  @IsEnum(InstallationRule)
  installationRule?: InstallationRule;

  // ─── Detalle PRODUCT ─────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: ProductCategory })
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLoan?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresInventory?: boolean;

  // ─── Detalle SERVICE ─────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: ChargeType })
  @IsOptional()
  @IsEnum(ChargeType)
  chargeType?: ChargeType;
}
