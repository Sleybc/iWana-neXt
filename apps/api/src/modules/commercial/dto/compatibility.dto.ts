import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CompatibilityRuleType } from '@iwana/shared';

export class CreateCompatibilityRuleDto {
  @ApiProperty({ enum: CompatibilityRuleType })
  @IsEnum(CompatibilityRuleType)
  ruleType: CompatibilityRuleType;

  @ApiProperty({ description: 'UUID del ítem fuente' })
  @IsUUID()
  sourceItemId: string;

  @ApiProperty({ description: 'UUID del ítem objetivo' })
  @IsUUID()
  targetItemId: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO desde la que aplica la sugerencia (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Mensaje visible al agente al cotizar' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateCompatibilityRuleDto {
  @ApiPropertyOptional({ maxLength: 2000, description: 'Mensaje visible al agente al cotizar' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO desde la que aplica la sugerencia (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ValidateCombinationDto {
  @ApiProperty({ type: [String], description: 'Lista de UUIDs de ítems del catálogo' })
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds: string[];
}
