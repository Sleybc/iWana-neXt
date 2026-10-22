'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PORTAL_DEFAULT_PAGE_SIZE, PORTAL_PAGE_SIZE_OPTIONS } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';

const SEARCH_DEBOUNCE_MS = 250;

export function useNetworkCatalogQuery(
  namespace: 'routers' | 'networks',
  filterKeys: readonly string[],
) {
  const table = useTableQueryState({
    namespace,
    filterKeys,
    pageSizeOptions: PORTAL_PAGE_SIZE_OPTIONS,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });
  const setQuery = table.setQuery;
  const searchValue = table.filters.q ?? '';
  const [searchDraft, setSearchDraft] = useState(searchValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setSearchDraft(searchValue), [searchValue]);

  useEffect(() => {
    if (searchDraft.trim() === searchValue) return;
    debounceRef.current = setTimeout(() => {
      setQuery({ page: 1, filters: { q: searchDraft.trim() || null } });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchDraft, searchValue, setQuery]);

  const hasActiveFilters = useMemo(
    () => Object.values(table.filters).some((value) => value.trim().length > 0),
    [table.filters],
  );

  const setFilter = (key: string, value: string) => {
    table.setQuery({ page: 1, filters: { [key]: value || null } });
  };

  const clearFilters = () => {
    table.setQuery({
      page: 1,
      filters: Object.fromEntries(filterKeys.map((key) => [key, null])),
    });
    setSearchDraft('');
  };

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return {
    ...table,
    searchDraft,
    setSearchDraft,
    hasActiveFilters,
    setFilter,
    clearFilters,
  };
}
