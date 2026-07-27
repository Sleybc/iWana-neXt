import type { ListMeta } from '@iwana/shared';

/**
 * Construye la metadata de paginación unificada (ADR-065 §Decisión 10).
 *
 * Centraliza la lógica que hoy está dispersa en visit-requests, inventory, commercial
 * y otros 25 endpoints que fabrican meta a mano.
 */
export function buildPageMeta(params: {
  total: number;
  page: number;
  limit: number;
  randomAccess?: boolean | undefined;
  sortableFields?: string[] | undefined;
  sortBy?: string | undefined;
  sortDir?: 'asc' | 'desc' | undefined;
}): ListMeta {
  const { total, page, limit, randomAccess = true, sortableFields = [], sortBy, sortDir } = params;

  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const hasMore = page < totalPages;

  const sort = sortBy && sortDir ? { by: sortBy, dir: sortDir } : null;

  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages,
    hasMore,
    mode: 'page',
    capabilities: {
      randomAccess,
      sortableFields,
    },
    sort,
  };
}

/**
 * Construye la metadata para endpoints keyset (modo cursor).
 * `randomAccess` default false (feeds); recursos Ola 6 con `page` aditivo pasan true.
 */
export function buildCursorMeta(params: {
  nextCursor: string | null;
  total: number;
  limit: number;
  totalIsEstimate?: boolean;
  randomAccess?: boolean;
  sortableFields?: string[];
}): ListMeta {
  const {
    nextCursor,
    total,
    limit,
    totalIsEstimate = false,
    randomAccess = false,
    sortableFields = [],
  } = params;
  return {
    nextCursor,
    total,
    totalIsEstimate,
    page: null,
    limit,
    totalPages: null,
    hasMore: nextCursor !== null,
    mode: 'cursor',
    capabilities: {
      randomAccess,
      sortableFields,
    },
    sort: null,
  };
}
