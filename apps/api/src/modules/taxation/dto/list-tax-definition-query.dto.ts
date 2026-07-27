import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TaxCategory, TaxContext, TaxOrigin } from '@iwana/shared';
import { TAXATION_LIST_DEFAULT_LIMIT, TAXATION_LIST_MAX_LIMIT } from '../../../common/pagination';

export class ListTaxDefinitionQueryDto {
  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: TAXATION_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: TAXATION_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${TAXATION_LIST_DEFAULT_LIMIT}, max ${TAXATION_LIST_MAX_LIMIT})`,
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

  @ApiPropertyOptional({
    default: true,
    description: 'Por defecto solo activas; `isActive=false` incluye inactivas.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean;
}

/** Meta de listado paginado — documentado en OpenAPI. */
export class TaxationListMetaDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Cursor para la siguiente página; null si no hay más resultados',
    example: null,
  })
  nextCursor: string | null;

  @ApiProperty({
    description: 'Total del conjunto filtrado (sin aplicar cursor)',
    example: 42,
  })
  total: number;
}
