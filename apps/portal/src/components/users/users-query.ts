import type { ListUsersParams } from '@/lib/api-client';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';

/** Tamaño de página del listado de usuarios — alineado a PORTAL_DEFAULT_PAGE_SIZE (ADR-065). */
export const USERS_PAGE_SIZE = PORTAL_DEFAULT_PAGE_SIZE;

export interface UsersQueryState {
  search: string;
  status: string;
  role: string;
  /** ADR-065: página actual (1-based). Vacío = sin página en URL. */
  page: string;
}

export function emptyUsersQuery(): UsersQueryState {
  return { search: '', status: '', role: '', page: '' };
}

/**
 * Hidrata criterios canónicos desde la URL (`search`, `status`, `role`).
 * Acepta `URLSearchParams` o un objeto compatible con `.get`.
 */
export function parseUsersQueryFromSearchParams(
  searchParams: URLSearchParams | { get: (k: string) => string | null },
): UsersQueryState {
  return {
    search: searchParams.get('search')?.trim() ?? '',
    status: searchParams.get('status')?.trim() ?? '',
    role: searchParams.get('role')?.trim() ?? '',
    page: searchParams.get('page')?.trim() ?? '',
  };
}

/**
 * Serializa criterios a search params canónicos.
 * Solo setea keys no vacías: `search`, `status`, `role`.
 */
export function usersQueryToSearchParams(query: UsersQueryState): URLSearchParams {
  const params = new URLSearchParams();
  const search = query.search.trim();
  if (search) params.set('search', search);
  if (query.status) params.set('status', query.status);
  if (query.role) params.set('role', query.role);
  if (query.page) params.set('page', query.page);
  return params;
}

/** Comparación estable para evitar loops router ↔ state. */
export function serializeUsersQuery(query: UsersQueryState): string {
  return usersQueryToSearchParams(query).toString();
}

/**
 * Fuente única de verdad para listado de usuarios: search + status + role (+ limit + page).
 * Un patch parcial preserva los criterios no tocados; cadenas vacías se omiten del request.
 *
 * ADR-065: los cambios de filtro (search / status / role) que no incluyen `page` explícito
 * resetean la página a 1. Así el `PortalTablePager` vuelve a la primera página tras filtrar.
 */
export function buildUsersListParams(
  query: UsersQueryState,
  patch: Partial<UsersQueryState> = {},
  limit = USERS_PAGE_SIZE,
): { nextQuery: UsersQueryState; params: ListUsersParams } {
  const isFilterPatch =
    patch.search !== undefined || patch.status !== undefined || patch.role !== undefined;
  const shouldResetPage = isFilterPatch && patch.page === undefined;

  const nextQuery: UsersQueryState = {
    search: patch.search !== undefined ? patch.search : query.search,
    status: patch.status !== undefined ? patch.status : query.status,
    role: patch.role !== undefined ? patch.role : query.role,
    page: shouldResetPage ? '' : patch.page !== undefined ? patch.page : query.page,
  };

  const params: ListUsersParams = { limit };
  const search = nextQuery.search.trim();
  if (search) params.search = search;
  if (nextQuery.status) params.status = nextQuery.status;
  if (nextQuery.role) params.role = nextQuery.role;

  // ADR-065: página 1-based → query param `page` en el request HTTP.
  const nextPage = nextQuery.page ? parseInt(nextQuery.page, 10) : undefined;
  if (nextPage !== undefined && Number.isFinite(nextPage) && nextPage > 0) {
    params.page = nextPage;
  }

  return { nextQuery, params };
}
