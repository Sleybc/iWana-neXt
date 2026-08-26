'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { PORTAL_DEFAULT_PAGE_SIZE, PORTAL_PAGE_SIZE_OPTIONS } from '@/lib/portal-page-size';

export type PortalSortDirection = 'asc' | 'desc';

export interface TableSortState {
  by: string;
  dir: PortalSortDirection;
}

export interface TableQueryUpdates {
  page?: number | null | undefined;
  pageSize?: number | null | undefined;
  sortBy?: string | null | undefined;
  sortDir?: PortalSortDirection | null | undefined;
  /** Claves de filtro/búsqueda. `null`/`''` eliminan la clave. */
  filters?: Record<string, string | null | undefined> | undefined;
}

export interface UseTableQueryStateOptions {
  /**
   * Prefijo de namespacing (`items` → `items.page`).
   * Sin prefijo: `page`, `size`, `sortBy`, `sortDir`.
   */
  namespace?: string | undefined;
  defaultPageSize?: number | undefined;
  /** Claves de filtro a hidratar desde la URL (sin prefijo de namespace). */
  filterKeys?: readonly string[] | undefined;
  pageSizeOptions?: readonly number[] | undefined;
}

export interface TableQueryState {
  page: number;
  pageSize: number;
  sortBy: string | null;
  sortDir: PortalSortDirection | null;
  sort: TableSortState | null;
  filters: Record<string, string>;
  setQuery: (
    updates: TableQueryUpdates,
    options?: { history?: 'push' | 'replace' | undefined },
  ) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sort: TableSortState | null) => void;
  setFilters: (filters: Record<string, string | null | undefined>) => void;
}

function namespacedKey(namespace: string | undefined, key: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function parsePageSize(raw: string | null, fallback: number, options: readonly number[]): number {
  const n = parsePositiveInt(raw, fallback);
  return options.includes(n) ? n : fallback;
}

function parseSortDir(raw: string | null): PortalSortDirection | null {
  if (raw === 'asc' || raw === 'desc') return raw;
  return null;
}

/**
 * Estado de tabla operativa en URL (ADR-065).
 *
 * - Cambio de **página** → `history.push` (Atrás vuelve a la página anterior).
 * - Filtros, búsqueda, tamaño y orden → `history.replace` + reset a página 1.
 */
export function useTableQueryState(options: UseTableQueryStateOptions = {}): TableQueryState {
  const {
    namespace,
    defaultPageSize = PORTAL_DEFAULT_PAGE_SIZE,
    filterKeys = [],
    pageSizeOptions = PORTAL_PAGE_SIZE_OPTIONS,
  } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageKey = namespacedKey(namespace, 'page');
  const sizeKey = namespacedKey(namespace, 'size');
  const sortByKey = namespacedKey(namespace, 'sortBy');
  const sortDirKey = namespacedKey(namespace, 'sortDir');

  const page = parsePositiveInt(searchParams.get(pageKey), 1);
  const pageSize = parsePageSize(searchParams.get(sizeKey), defaultPageSize, pageSizeOptions);
  const sortBy = searchParams.get(sortByKey)?.trim() || null;
  const sortDir = parseSortDir(searchParams.get(sortDirKey));
  const sort = useMemo<TableSortState | null>(
    () => (sortBy && sortDir ? { by: sortBy, dir: sortDir } : null),
    [sortBy, sortDir],
  );

  // v2-32: corregir URL en silencio cuando page/size son inválidos
  useEffect(() => {
    const rawPage = searchParams.get(pageKey);
    const rawSize = searchParams.get(sizeKey);
    let needsCorrection = false;
    const patch: Record<string, string | null> = {};

    if (rawPage != null) {
      const n = Number.parseInt(rawPage, 10);
      if (!Number.isFinite(n) || n < 1) {
        patch[pageKey] = null;
        needsCorrection = true;
      }
    }

    if (rawSize != null) {
      const n = Number.parseInt(rawSize, 10);
      if (!Number.isFinite(n) || n < 1 || !pageSizeOptions.includes(n)) {
        patch[sizeKey] = null;
        needsCorrection = true;
      }
    }

    if (needsCorrection) {
      const query = mergeUrlSearchParams(searchParams, patch);
      const href = withSearchParams(pathname, query);
      router.replace(href, { scroll: false });
    }
  }, [pageKey, pageSizeOptions, pathname, router, searchParams, sizeKey]);

  const filters = useMemo(() => {
    const next: Record<string, string> = {};
    for (const key of filterKeys) {
      const urlKey = namespacedKey(namespace, key);
      const value = searchParams.get(urlKey)?.trim() ?? '';
      if (value) next[key] = value;
    }
    return next;
  }, [filterKeys, namespace, searchParams]);

  const setQuery = useCallback(
    (updates: TableQueryUpdates, opts?: { history?: 'push' | 'replace' | undefined }) => {
      const history = opts?.history ?? 'replace';
      const patch: Record<string, string | null | undefined> = {};

      if (updates.page !== undefined) {
        const nextPage = updates.page;
        patch[pageKey] = nextPage == null || nextPage <= 1 ? null : String(Math.floor(nextPage));
      }

      if (updates.pageSize !== undefined) {
        const nextSize = updates.pageSize;
        patch[sizeKey] = nextSize == null || nextSize === defaultPageSize ? null : String(nextSize);
      }

      if (updates.sortBy !== undefined) {
        patch[sortByKey] = updates.sortBy;
      }

      if (updates.sortDir !== undefined) {
        patch[sortDirKey] = updates.sortDir;
      }

      if (updates.filters) {
        for (const [key, value] of Object.entries(updates.filters)) {
          patch[namespacedKey(namespace, key)] = value;
        }
      }

      const query = mergeUrlSearchParams(searchParams, patch);
      const href = withSearchParams(pathname, query);
      if (history === 'push') {
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [
      defaultPageSize,
      namespace,
      pageKey,
      pathname,
      router,
      searchParams,
      sizeKey,
      sortByKey,
      sortDirKey,
    ],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      setQuery({ page: nextPage }, { history: 'push' });
    },
    [setQuery],
  );

  const setPageSize = useCallback(
    (nextSize: number) => {
      setQuery({ pageSize: nextSize, page: 1 }, { history: 'replace' });
    },
    [setQuery],
  );

  const setSort = useCallback(
    (next: TableSortState | null) => {
      setQuery(
        {
          sortBy: next?.by ?? null,
          sortDir: next?.dir ?? null,
          page: 1,
        },
        { history: 'replace' },
      );
    },
    [setQuery],
  );

  const setFilters = useCallback(
    (nextFilters: Record<string, string | null | undefined>) => {
      setQuery({ filters: nextFilters, page: 1 }, { history: 'replace' });
    },
    [setQuery],
  );

  return {
    page,
    pageSize,
    sortBy,
    sortDir,
    sort,
    filters,
    setQuery,
    setPage,
    setPageSize,
    setSort,
    setFilters,
  };
}
