import { IsOptional, IsString, IsIn } from 'class-validator';

/**
 * DTO base reutilizable para parámetros de orden en endpoints de listado.
 * ADR-065 Ola 1 — sortBy + sortDir con lista blanca por recurso.
 */
export class SortQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
