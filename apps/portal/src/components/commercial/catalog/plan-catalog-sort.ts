import type { PlanCatalogColumnId, PlanCatalogVisibleColumnId } from './plan-catalog-columns';
import { PLAN_CATALOG_COLUMN_LABELS } from './plan-catalog-columns';

/**
 * Nombres lógicos ADR-065. Deben coincidir con `PLAN_CATALOG_SORTABLE_FIELDS`
 * del API (`CatalogQueryDto` / `CatalogService.findAll`).
 */
export const PLAN_CATALOG_SORT_FIELD_BY_COLUMN: Record<PlanCatalogColumnId, string> = {
  plan: 'name',
  speed: 'downloadSpeedMbps',
  price: 'basePrice',
  installation: 'installationFee',
  status: 'isActive',
  technology: 'technology',
  description: 'description',
  created: 'createdAt',
  updated: 'updatedAt',
};

const NUMERIC_SORT_COLUMNS = new Set<PlanCatalogColumnId>([
  'speed',
  'price',
  'installation',
  'created',
  'updated',
]);

export function planCatalogSortField(column: PlanCatalogVisibleColumnId): string | null {
  if (column === 'actions') {
    return null;
  }
  return PLAN_CATALOG_SORT_FIELD_BY_COLUMN[column];
}

export function isPlanCatalogSortNumeric(column: PlanCatalogVisibleColumnId): boolean {
  return column !== 'actions' && NUMERIC_SORT_COLUMNS.has(column);
}

export function planCatalogSortLabel(field: string): string {
  const column = (
    Object.entries(PLAN_CATALOG_SORT_FIELD_BY_COLUMN) as Array<[PlanCatalogColumnId, string]>
  ).find(([, value]) => value === field)?.[0];
  return column ? PLAN_CATALOG_COLUMN_LABELS[column] : field;
}
