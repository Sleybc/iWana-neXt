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
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { CustomerSegment, PersonType, TaxType } from '@iwana/shared';
import { Transform, Type } from 'class-transformer';
import { TAXATION_LIST_DEFAULT_LIMIT, TAXATION_LIST_MAX_LIMIT } from '../../../common/pagination';

const PERCENTAGE_0_100_PATTERN = /^(?:100(?:\.0{1,2})?|(?:0|[1-9]\d?)(?:\.\d{1,2})?)$/;

export class CreateTaxRuleDto {
  @ApiPropertyOptional({
    description: 'UUID de clasificación tributaria legacy (opcional; tabla eliminada en mig. 025)',
  })
  @IsOptional()
  @IsUUID()
  taxClassificationId?: string;

  @ApiPropertyOptional({ description: 'Segmento de cliente (null = todos)' })
  @IsOptional()
  @IsString()
  customerSegment?: string;

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
  @Matches(PERCENTAGE_0_100_PATTERN, { message: 'ratePercentage debe estar entre 0 y 100' })
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
  @Matches(PERCENTAGE_0_100_PATTERN, { message: 'ratePercentage debe estar entre 0 y 100' })
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

export class SimulateTaxDto {
  @ApiProperty({ enum: PersonType, description: 'Tipo de persona del cliente a simular' })
  @IsEnum(PersonType)
  personType: PersonType;

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
  @Min(0)
  @Max(100)
  rateOverride?: number | null;

  @ApiPropertyOptional({ minimum: 0, description: 'Prioridad de la aplicación' })
  @IsOptional()
  @IsInt()
  @Min(0)
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
  @Min(0)
  @Max(100)
  rateOverride?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TaxRuleListQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor opaco de la página anterior (`meta.nextCursor`).',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: TAXATION_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: TAXATION_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return TAXATION_LIST_DEFAULT_LIMIT;
    }
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @Max(TAXATION_LIST_MAX_LIMIT)
  limit?: number = TAXATION_LIST_DEFAULT_LIMIT;
}
