import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ChargeType,
  InstallationRule,
  NetworkType,
  ProductCategory,
  CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN,
  VatConcept,
  VatTreatment,
} from '@iwana/shared';
import { Transform } from 'class-transformer';

/** Normaliza el código de base legal a mayúsculas sin espacios alrededor. */
function upperCode({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

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

  /**
   * Solo productos y servicios (spec MOD14 2026-11-12 R1). Omitido conserva el valor actual.
   * Un plan no lo admite: su internet sigue la regla del estrato (ADR-093).
   */
  @ApiPropertyOptional({
    enum: VatTreatment,
    description:
      'IVA del producto o servicio: STANDARD (19 %), EXEMPT o EXCLUDED. Omitido: conserva el actual. ' +
      'No aplica a planes.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(VatTreatment)
  vatTreatment?: VatTreatment;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 40,
    pattern: CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN.source,
    description:
      'Código de la base legal (p. ej. ET_468). Obligatorio al pasar a EXEMPT o EXCLUDED; al pasar ' +
      'a STANDARD sin él usa ET_468.',
  })
  @IsOptional()
  @Transform(upperCode)
  @IsString()
  @Matches(CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN)
  vatLegalBasis?: string | null;

  /** Solo planes: IVA del cargo de instalación (spec MOD14 2026-11-12 R2). */
  @ApiPropertyOptional({
    enum: VatTreatment,
    description:
      'Solo planes: IVA del cargo de instalación. Omitido: conserva el actual. El internet del plan ' +
      'conserva la regla del estrato.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(VatTreatment)
  installationVatTreatment?: VatTreatment;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 40,
    pattern: CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN.source,
    description:
      'Solo planes: base legal del IVA de la instalación. Obligatoria con EXEMPT o EXCLUDED.',
  })
  @IsOptional()
  @Transform(upperCode)
  @IsString()
  @Matches(CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN)
  installationVatLegalBasis?: string | null;

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
