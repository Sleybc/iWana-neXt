import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { TaxCategory, TaxContext } from '@iwana/shared';

export class ListTaxDefinitionsDto {
  @ApiPropertyOptional({ enum: TaxCategory })
  @IsOptional()
  @IsEnum(TaxCategory)
  category?: TaxCategory;

  @ApiPropertyOptional({ enum: TaxContext })
  @IsOptional()
  @IsEnum(TaxContext)
  context?: TaxContext;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
