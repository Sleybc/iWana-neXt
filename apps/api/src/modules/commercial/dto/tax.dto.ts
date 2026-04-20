import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { TaxType } from '@iwana/shared';

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
