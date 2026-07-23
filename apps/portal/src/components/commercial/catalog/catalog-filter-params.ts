import { ChargeType, ProductCategory } from '@iwana/shared';

export type CatalogStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
export type ProductCommercialModelFilter = 'ALL' | 'SALE' | 'LOAN';
export type ProductSortMode = 'CATEGORY_NAME' | 'ACTIVE_NAME' | 'RECENTLY_UPDATED';

export interface ProductCatalogFilters {
  q: string;
  category: string;
  status: CatalogStatusFilter;
  model: ProductCommercialModelFilter;
  sort: ProductSortMode;
}

export interface ServiceCatalogFilters {
  q: string;
  status: CatalogStatusFilter;
  charge: string;
}

export const DEFAULT_PRODUCT_CATALOG_FILTERS: ProductCatalogFilters = {
  q: '',
  category: 'ALL',
  status: 'ALL',
  model: 'ALL',
  sort: 'ACTIVE_NAME',
};

export const DEFAULT_SERVICE_CATALOG_FILTERS: ServiceCatalogFilters = {
  q: '',
  status: 'ALL',
  charge: 'ALL',
};

const PRODUCT_FILTER_KEYS = ['q', 'category', 'status', 'model', 'sort'] as const;
const SERVICE_FILTER_KEYS = ['q', 'status', 'charge'] as const;

const STATUS_VALUES: CatalogStatusFilter[] = ['ALL', 'ACTIVE', 'INACTIVE'];
const MODEL_VALUES: ProductCommercialModelFilter[] = ['ALL', 'SALE', 'LOAN'];
const SORT_VALUES: ProductSortMode[] = ['CATEGORY_NAME', 'ACTIVE_NAME', 'RECENTLY_UPDATED'];
const PRODUCT_CATEGORIES = new Set<string>(Object.values(ProductCategory));
const CHARGE_TYPES = new Set<string>(Object.values(ChargeType));

function parseStatus(value: string | null): CatalogStatusFilter {
  if (value && STATUS_VALUES.includes(value as CatalogStatusFilter)) {
    return value as CatalogStatusFilter;
  }
  return 'ALL';
}

function parseModel(value: string | null): ProductCommercialModelFilter {
  if (value && MODEL_VALUES.includes(value as ProductCommercialModelFilter)) {
    return value as ProductCommercialModelFilter;
  }
  return 'ALL';
}

function parseSort(value: string | null): ProductSortMode {
  if (value && SORT_VALUES.includes(value as ProductSortMode)) {
    return value as ProductSortMode;
  }
  return 'ACTIVE_NAME';
}

function parseCategory(value: string | null): string {
  if (value && PRODUCT_CATEGORIES.has(value)) {
    return value;
  }
  return 'ALL';
}

function parseCharge(value: string | null): string {
  if (value && CHARGE_TYPES.has(value)) {
    return value;
  }
  return 'ALL';
}

/** Hidrata filtros de productos desde query params (defaults si ausentes o inválidos). */
export function parseProductCatalogFilters(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): ProductCatalogFilters {
  return {
    q: params.get('q')?.trim() ?? '',
    category: parseCategory(params.get('category')),
    status: parseStatus(params.get('status')),
    model: parseModel(params.get('model')),
    sort: parseSort(params.get('sort')),
  };
}

/** Hidrata filtros de servicios desde query params. */
export function parseServiceCatalogFilters(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): ServiceCatalogFilters {
  return {
    q: params.get('q')?.trim() ?? '',
    status: parseStatus(params.get('status')),
    charge: parseCharge(params.get('charge')),
  };
}

/** Escribe filtros de productos omitiendo defaults; preserva params no relacionados (p. ej. tab). */
export function applyProductCatalogFilters(
  params: URLSearchParams,
  filters: ProductCatalogFilters,
): URLSearchParams {
  for (const key of PRODUCT_FILTER_KEYS) {
    params.delete(key);
  }

  const q = filters.q.trim();
  if (q) {
    params.set('q', q);
  }
  if (filters.category !== 'ALL') {
    params.set('category', filters.category);
  }
  if (filters.status !== 'ALL') {
    params.set('status', filters.status);
  }
  if (filters.model !== 'ALL') {
    params.set('model', filters.model);
  }
  if (filters.sort !== 'ACTIVE_NAME') {
    params.set('sort', filters.sort);
  }

  return params;
}

/** Escribe filtros de servicios omitiendo defaults; preserva params no relacionados. */
export function applyServiceCatalogFilters(
  params: URLSearchParams,
  filters: ServiceCatalogFilters,
): URLSearchParams {
  for (const key of SERVICE_FILTER_KEYS) {
    params.delete(key);
  }

  const q = filters.q.trim();
  if (q) {
    params.set('q', q);
  }
  if (filters.status !== 'ALL') {
    params.set('status', filters.status);
  }
  if (filters.charge !== 'ALL') {
    params.set('charge', filters.charge);
  }

  return params;
}

/** Compatibilidad tipada con `useSearchParams()` de Next. */
export interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null;
}
