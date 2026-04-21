import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { CustomerSegment, TaxType } from '@iwana/shared';

export class CreateTaxClassificationDto {
  @ApiProperty({ maxLength: 50, description: 'Código único por tenant (ej: IVA_FULL)' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false, description: 'El ítem está sujeto a IVA' })
  @IsOptional()
  @IsBoolean()
  appliesIva?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Aplica retención en la fuente' })
  @IsOptional()
  @IsBoolean()
  appliesRetefuente?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Aplica ReteICA' })
  @IsOptional()
  @IsBoolean()
  appliesReteIca?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Aplica estampillas' })
  @IsOptional()
  @IsBoolean()
  appliesEstampillas?: boolean;
}

export class UpdateTaxClassificationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'El ítem está sujeto a IVA' })
  @IsOptional()
  @IsBoolean()
  appliesIva?: boolean;

  @ApiPropertyOptional({ description: 'Aplica retención en la fuente' })
  @IsOptional()
  @IsBoolean()
  appliesRetefuente?: boolean;

  @ApiPropertyOptional({ description: 'Aplica ReteICA' })
  @IsOptional()
  @IsBoolean()
  appliesReteIca?: boolean;

  @ApiPropertyOptional({ description: 'Aplica estampillas' })
  @IsOptional()
  @IsBoolean()
  appliesEstampillas?: boolean;
}

export class CreateTaxRuleDto {
  @ApiProperty({ description: 'UUID de la clasificación tributaria' })
  @IsString()
  @IsNotEmpty()
  taxClassificationId: string;

  @ApiPropertyOptional({ description: 'Segmento de cliente (null = todos)' })
  @IsOptional()
  @IsString()
  customerSegment?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  estratoMin?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  estratoMax?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, description: 'Estrato mínimo (nuevo modelo)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  stratumFrom?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, description: 'Estrato máximo (nuevo modelo)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  stratumTo?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'Prioridad al resolver solapamientos',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional({ maxLength: 10, description: 'Código DANE del municipio' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  municipalityCode?: string;

  @ApiProperty({ enum: TaxType })
  @IsEnum(TaxType)
  taxType: TaxType;

  @ApiProperty({ example: '19.00', description: 'Tasa porcentual (0-100)' })
  @IsString()
  @IsNotEmpty()
  ratePercentage: string;

  @ApiPropertyOptional({ description: 'ISO 8601 inicio de vigencia (null = ahora)' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 fin de vigencia (null = sin vencimiento)' })
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class UpdateTaxRuleDto {
  @ApiPropertyOptional({ description: 'UUID de la clasificación tributaria' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taxClassificationId?: string;

  @ApiPropertyOptional({ description: 'Segmento de cliente (null = todos)' })
  @IsOptional()
  @IsString()
  customerSegment?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  estratoMin?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  estratoMax?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, description: 'Estrato mínimo (nuevo modelo)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  stratumFrom?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, description: 'Estrato máximo (nuevo modelo)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  stratumTo?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'Prioridad al resolver solapamientos',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional({ maxLength: 10, description: 'Código DANE del municipio' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  municipalityCode?: string;

  @ApiPropertyOptional({ enum: TaxType })
  @IsOptional()
  @IsEnum(TaxType)
  taxType?: TaxType;

  @ApiPropertyOptional({ example: '19.00', description: 'Tasa porcentual (0-100)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ratePercentage?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 inicio de vigencia' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 fin de vigencia' })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResolveTaxDto {
  @ApiProperty({ enum: CustomerSegment })
  @IsEnum(CustomerSegment)
  segment: CustomerSegment;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  stratum?: number;
}

export class SimulateTaxDto {
  @ApiProperty({ enum: CustomerSegment, description: 'Segmento del cliente a simular' })
  @IsEnum(CustomerSegment)
  segment: CustomerSegment;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, description: 'Estrato socioeconómico (1-6)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  stratum?: number;

  @ApiPropertyOptional({ maxLength: 10, description: 'Código DANE del municipio' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  municipalityCode?: string;
}

export class CreateTaxRuleApplicationDto {
  @ApiProperty({ description: 'UUID de la regla tributaria (TaxRule)' })
  @IsUUID()
  taxRuleId: string;

  @ApiProperty({ description: 'UUID de la definición tributaria en catálogo MOD07' })
  @IsUUID()
  taxDefinitionId: string;

  @ApiProperty({ enum: ['STANDARD', 'EXEMPT', 'EXCLUDED', 'FIXED'] })
  @IsIn(['STANDARD', 'EXEMPT', 'EXCLUDED', 'FIXED'])
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';

  @ApiPropertyOptional({ description: 'Tasa override que sobreescribe baseRate del catálogo' })
  @IsOptional()
  @IsNumber()
  rateOverride?: number | null;

  @ApiPropertyOptional({ minimum: 0, description: 'Prioridad de la aplicación' })
  @IsOptional()
  @IsInt()
  priority?: number;
}

export class UpdateTaxRuleApplicationDto {
  @ApiPropertyOptional({ enum: ['STANDARD', 'EXEMPT', 'EXCLUDED', 'FIXED'] })
  @IsOptional()
  @IsIn(['STANDARD', 'EXEMPT', 'EXCLUDED', 'FIXED'])
  treatment?: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';

  @ApiPropertyOptional({ description: 'Tasa override (null = usar baseRate del catálogo)' })
  @IsOptional()
  @IsNumber()
  rateOverride?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
