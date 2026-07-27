import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_LIMIT } from '../../../common/pagination/clamp-limit';

/**
 * Paginación CRM con tope de `limit` (DEF-2 H-1 / Ley 1581).
 * Defense-in-depth junto a `clampLimit` en el service — dictamen AI-SEC-ENG.
 */
export class CrmListPaginationDto {
  @ApiPropertyOptional({ minimum: 1, example: 1, description: 'Número de página (≥ 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_LIMIT,
    example: 20,
    description: `Tamaño de página (1–${MAX_LIMIT})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}
