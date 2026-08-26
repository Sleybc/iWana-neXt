import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CatalogItemType, ChargeType, ProductCategory } from '@iwana/shared';
import { CommercialListQueryDto } from './commercial-list-query.dto';

/** Modelo comercial de producto (FE: `model=SALE|LOAN`). */
export const CATALOG_PRODUCT_MODEL_VALUES = ['SALE', 'LOAN'] as const;
export type CatalogProductModelFilter = (typeof CATALOG_PRODUCT_MODEL_VALUES)[number];

/**
 * Orden servidor alineado a enums FE (`ProductSortMode`).
 * Sin `sort` → name ASC, id ASC (planes/servicios y default histórico).
 */
export const CATALOG_SORT_VALUES = ['CATEGORY_NAME', 'ACTIVE_NAME', 'RECENTLY_UPDATED'] as const;
export type CatalogSortMode = (typeof CATALOG_SORT_VALUES)[number];

/**
 * Orden por columna de planes (ADR-065 `sortBy`/`sortDir`, modo page).
 * Nombres lógicos; el servicio resuelve SQL. Productos/servicios no publican esta lista.
 */
export const PLAN_CATALOG_SORTABLE_FIELDS = [
  'name',
  'downloadSpeedMbps',
  'basePrice',
  'installationFee',
  'isActive',
  'technology',
  'description',
  'createdAt',
  'updatedAt',
] as const;
export type PlanCatalogSortField = (typeof PLAN_CATALOG_SORTABLE_FIELDS)[number];

export function isPlanCatalogSortField(value: string | undefined): value is PlanCatalogSortField {
  return (
    typeof value === 'string' && (PLAN_CATALOG_SORTABLE_FIELDS as readonly string[]).includes(value)
  );
}

/** Orden de categoría alineado a `ProductCategory` / chips FE (ADR-064 sort). */
export const CATALOG_CATEGORY_SORT_ORDER: readonly ProductCategory[] = [
  ProductCategory.ENTERTAINMENT,
  ProductCategory.SECURITY,
  ProductCategory.CONNECTIVITY,
  ProductCategory.BUSINESS,
  ProductCategory.NETWORKING,
  ProductCategory.CPE,
];

function transformQueryBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === '1' || value === 1 || value === true) return true;
  if (value === 'false' || value === '0' || value === 0 || value === false) return false;
  return value;
}

/**
 * Query de listado de catálogo comercial (ADR-064/065).
 * Filtros aplicados en servidor antes del cursor/page; `total` = conjunto filtrado.
 * `page` y `cursor` son excluyentes.
 */
export class CatalogQueryDto extends CommercialListQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Página 1-based (ADR-065 Ola 6). Excluyente con `cursor`. Sin `page` ni `cursor` = primera página keyset.',
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Number(value);
  })
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ enum: CatalogItemType })
  @IsOptional()
  @IsEnum(CatalogItemType)
  type?: CatalogItemType;

  @ApiPropertyOptional({ description: 'Búsqueda ILIKE por nombre (FE: `q` → `name`)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(transformQueryBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Solo ítems activos sin precio vigente RESIDENTIAL (`catalog_price_history.is_current`). FE: `missingPrice=1`.',
    example: true,
  })
  @IsOptional()
  @Transform(transformQueryBoolean)
  @IsBoolean()
  missingPrice?: boolean;

  @ApiPropertyOptional({
    enum: ProductCategory,
    description: 'Filtra productos por categoría (`product_details.category`).',
  })
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @ApiPropertyOptional({
    enum: CATALOG_PRODUCT_MODEL_VALUES,
    description: 'Modelo comercial de producto: SALE (`is_loan=false`) | LOAN (`is_loan=true`).',
  })
  @IsOptional()
  @IsIn(CATALOG_PRODUCT_MODEL_VALUES)
  model?: CatalogProductModelFilter;

  @ApiPropertyOptional({
    enum: ChargeType,
    description: 'Tipo de cargo de servicio (`service_details.charge_type`). FE: `charge`.',
  })
  @IsOptional()
  @IsEnum(ChargeType)
  charge?: ChargeType;

  @ApiPropertyOptional({
    enum: CATALOG_SORT_VALUES,
    description:
      'Orden servidor + cursor keyset coherente. CATEGORY_NAME | ACTIVE_NAME | RECENTLY_UPDATED. ' +
      'Sin valor: name ASC, id ASC. Cambiar sort reinicia cursor (primera página).',
  })
  @IsOptional()
  @IsIn(CATALOG_SORT_VALUES)
  sort?: CatalogSortMode;

  @ApiPropertyOptional({
    enum: PLAN_CATALOG_SORTABLE_FIELDS,
    description:
      'Campo lógico de orden (planes, modo page). Ignorado si no está en la lista blanca. ' +
      'Excluyente de facto con `sort` de productos: si aplica, sustituye el ORDER BY default.',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
