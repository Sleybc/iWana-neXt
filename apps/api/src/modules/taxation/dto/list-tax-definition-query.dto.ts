import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { TaxCategory, TaxContext, TaxOrigin } from '@iwana/shared';

export class ListTaxDefinitionQueryDto {
  @ApiPropertyOptional({ enum: TaxCategory })
  @IsOptional()
  @IsEnum(TaxCategory)
  category?: TaxCategory;

  @ApiPropertyOptional({ enum: TaxContext })
  @IsOptional()
  @IsEnum(TaxContext)
  context?: TaxContext;

  @ApiPropertyOptional({ enum: TaxOrigin, description: 'Filtrar por origen SYSTEM|CUSTOM' })
  @IsOptional()
  @IsEnum(TaxOrigin)
  origin?: TaxOrigin;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean;
}
