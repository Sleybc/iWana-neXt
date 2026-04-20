import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
}

export class ValidateCombinationDto {
  @ApiProperty({ type: [String], description: 'Lista de UUIDs de ítems del catálogo' })
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds: string[];
}
