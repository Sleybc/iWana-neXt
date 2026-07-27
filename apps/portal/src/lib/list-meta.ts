import type { ListMeta, ListResponse } from '@iwana/shared';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';

/** Meta vacía tipada al contrato ADR-065 (cursor o page). */
export const EMPTY_LIST_META: ListMeta = {
  nextCursor: null,
  total: 0,
  totalIsEstimate: false,
  page: null,
  limit: PORTAL_DEFAULT_PAGE_SIZE,
  totalPages: null,
  hasMore: false,
  mode: 'cursor',
  capabilities: {
    randomAccess: false,
    sortableFields: [],
  },
  sort: null,
};

/**
 * Meta de página vacía (randomAccess) para mocks/specs ADR-065.
 * `sortableFields` queda `[]` — no inventar columnas ordenables.
 */
export function emptyPageListMeta(
  overrides: Partial<ListMeta> = {},
  limit = PORTAL_DEFAULT_PAGE_SIZE,
): ListMeta {
  return normalizeListMeta(
    {
      mode: 'page',
      page: 1,
      limit,
      total: 0,
      totalPages: 0,
      hasMore: false,
      nextCursor: null,
      totalIsEstimate: false,
      capabilities: {
        randomAccess: true,
        sortableFields: [],
      },
      sort: null,
      ...overrides,
    },
    { dataLength: 0, limit },
  );
}

/**
 * Acumula páginas de un listado page-mode (calendario / peeks acotados).
 * No usar en directorios con `PortalTablePager`.
 */
export async function collectListPages<T>(
  fetchPage: (page: number) => Promise<ListResponse<T>>,
  options?: { maxPages?: number; limit?: number },
): Promise<ListResponse<T>> {
  const maxPages = options?.maxPages ?? 50;
  const all: T[] = [];
  let lastMeta = EMPTY_LIST_META;
  let page = 1;

  while (page <= maxPages) {
    const response = await fetchPage(page);
    lastMeta = normalizeListMeta(response.meta, {
      dataLength: response.data.length,
      ...(options?.limit != null ? { limit: options.limit } : {}),
    });
    all.push(...response.data);
    if (!lastMeta.hasMore) {
      break;
    }
    page += 1;
  }

  return {
    data: all,
    meta: {
      ...lastMeta,
      page: lastMeta.page ?? 1,
      hasMore: false,
      total: lastMeta.total > 0 ? lastMeta.total : all.length,
      totalPages:
        lastMeta.limit > 0
          ? Math.max(
              1,
              Math.ceil((lastMeta.total > 0 ? lastMeta.total : all.length) / lastMeta.limit),
            )
          : lastMeta.totalPages,
    },
  };
}

/**
 * Normaliza meta parcial (dual-emit Ola 1 / envelopes legacy `nextCursor`+`total`)
 * al contrato `ListMeta` completo.
 */
export function normalizeListMeta(
  input: Partial<ListMeta> | null | undefined,
  fallbacks?: { dataLength?: number; limit?: number },
): ListMeta {
  const dataLength = fallbacks?.dataLength ?? 0;
  const limit = input?.limit ?? fallbacks?.limit ?? PORTAL_DEFAULT_PAGE_SIZE;
  const nextCursor = input?.nextCursor ?? null;
  const total = input?.total ?? dataLength;
  const hasMore = input?.hasMore ?? nextCursor != null;
  const page = input?.page ?? null;
  const totalPages =
    input?.totalPages ?? (page != null && limit > 0 ? Math.max(1, Math.ceil(total / limit)) : null);
  const mode = input?.mode ?? (page != null ? 'page' : 'cursor');
  const capabilities = input?.capabilities ?? {
    randomAccess: mode === 'page',
    sortableFields: [],
  };

  return {
    nextCursor,
    total,
    totalIsEstimate: input?.totalIsEstimate ?? false,
    page,
    limit,
    totalPages,
    hasMore,
    mode,
    capabilities: {
      randomAccess: capabilities.randomAccess ?? mode === 'page',
      sortableFields: capabilities.sortableFields ?? [],
    },
    sort: input?.sort ?? null,
  };
}

/** Rango 1-based de filas visibles a partir de `meta` (contrato DS §3). */
export function listPageWindow(meta: Pick<ListMeta, 'page' | 'limit' | 'total'>): {
  from: number;
  to: number;
} {
  const page = meta.page ?? 1;
  const { limit, total } = meta;
  if (total <= 0 || limit <= 0) {
    return { from: 0, to: 0 };
  }
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return { from, to };
}
