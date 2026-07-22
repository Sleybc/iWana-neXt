import type { ListUsersParams } from '@/lib/api-client';

/** Tamaño de página del listado de usuarios (única fuente; FE-13). */
export const USERS_PAGE_SIZE = 20;

export interface UsersQueryState {
  search: string;
  status: string;
  role: string;
}

export function emptyUsersQuery(): UsersQueryState {
  return { search: '', status: '', role: '' };
}

/**
 * Fuente única de verdad para listado de usuarios: search + status + role (+ limit).
 * Un patch parcial preserva los criterios no tocados; cadenas vacías se omiten del request.
 */
export function buildUsersListParams(
  query: UsersQueryState,
  patch: Partial<UsersQueryState> = {},
  limit = USERS_PAGE_SIZE,
): { nextQuery: UsersQueryState; params: ListUsersParams } {
  const nextQuery: UsersQueryState = {
    search: patch.search !== undefined ? patch.search : query.search,
    status: patch.status !== undefined ? patch.status : query.status,
    role: patch.role !== undefined ? patch.role : query.role,
  };

  const params: ListUsersParams = { limit };
  const search = nextQuery.search.trim();
  if (search) params.search = search;
  if (nextQuery.status) params.status = nextQuery.status;
  if (nextQuery.role) params.role = nextQuery.role;

  return { nextQuery, params };
}
