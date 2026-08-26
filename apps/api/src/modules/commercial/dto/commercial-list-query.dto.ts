import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  COMMERCIAL_LIST_DEFAULT_LIMIT,
  COMMERCIAL_LIST_MAX_LIMIT,
} from '../../../common/pagination';

/**
 * Query de listado para superficies comerciales (ADR-064/065).
 * `limit` default 20, máximo 100. Si se omite → default acotado (nunca unbounded).
 */
export class CommercialListQueryDto {
  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: COMMERCIAL_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: COMMERCIAL_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${COMMERCIAL_LIST_DEFAULT_LIMIT}, máximo ${COMMERCIAL_LIST_MAX_LIMIT}).`,
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return COMMERCIAL_LIST_DEFAULT_LIMIT;
    }
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @Max(COMMERCIAL_LIST_MAX_LIMIT)
  limit?: number = COMMERCIAL_LIST_DEFAULT_LIMIT;
}

/** Meta de listado paginado — documentado en OpenAPI. */
export class CommercialListMetaDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Cursor para la siguiente página; null si no hay más resultados',
    example: null,
  })
  nextCursor: string | null;

  @ApiProperty({
    description: 'Total del conjunto filtrado (sin aplicar cursor)',
    example: 128,
  })
  total: number;
}
