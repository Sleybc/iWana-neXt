'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StockIssuePickableItem } from '@iwana/shared';
import { inventoryApi, type ListPickableItemsParams } from '@/lib/api-client';
import { normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import type { StockIssueSourceTab } from './StockIssueSourceTabs';

export type PickableScope = 'with-stock' | 'catalog';

export function scopeForTab(tab: StockIssueSourceTab): PickableScope {
  return tab === 'suggestions' ? 'with-stock' : 'catalog';
}

/**
 * Estado de un listado de elegibles. El modo de pie lo declara el servidor en
 * `meta.capabilities.randomAccess` (ADR-065): `true` → pager numerado; `false`
 * → «Cargar más» por cursor. Nunca los dos montados a la vez (hallazgo P1).
 */
export interface PickableScopeState {
  items: StockIssuePickableItem[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  page: number;
  limit: number;
  totalPages: number | null;
  randomAccess: boolean;
  loading: boolean;
  error: string | null;
}

export function emptyScopeState(): PickableScopeState {
  return {
    items: [],
    total: 0,
    hasMore: false,
    nextCursor: null,
    page: 1,
    limit: PORTAL_DEFAULT_PAGE_SIZE,
    totalPages: null,
    randomAccess: true,
    loading: false,
    error: null,
  };
}

function mapPickableError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'No fue posible cargar el material disponible.';
}

export interface FetchPickableScopeInput {
  source: string;
  q: string;
  page?: number;
  limit?: number;
  cursor?: string | null;
  append?: boolean;
}

/**
 * Listados de elegibles del composer (S2.1 C4): estado por ámbito, caché de
 * sesión y carga B1 con efectos de dependencias completas. La paginación del
 * selector vive en estado por ser lista efímera del flujo de creación, no en
 * URL (desviación ADR-065 §9 aceptada por AI-EM-ARCH en consolidación S2).
 */
export function usePickableScope(options: {
  sourceLocationId: string;
  activeScope: PickableScope;
  debouncedSearch: string;
  editInitializing: boolean;
}) {
  const { sourceLocationId, activeScope, debouncedSearch, editInitializing } = options;

  // ADR-065 §9 (desviación aceptada por AI-EM-ARCH en consolidación S2): la paginación del selector de captura vive en estado por ser lista efímera del flujo de creación, no en URL.
  const [pickablesByScope, setPickablesByScope] = useState<
    Record<PickableScope, PickableScopeState>
  >({
    'with-stock': emptyScopeState(),
    catalog: emptyScopeState(),
  });

  // Caché de sesión de elegibles B1: al paginar por página el listado activo se
  // reemplaza, pero las selecciones y la vía manual siguen necesitando los
  // ítems de páginas anteriores (disponibilidad y lotes quedaron congelados en
  // las líneas al agregarlas; el caché solo crece dentro del composer).
  const [pickableCache, setPickableCache] = useState<Map<string, StockIssuePickableItem>>(
    () => new Map(),
  );

  // Última consulta completada por ámbito (normalizada con trim): el escaneo
  // solo marca cuando el listado vigente es del barrido de su consulta, no un
  // residuo anterior ni un intermedio previo al fetch (batching con backend
  // rápido que oculta el ciclo loading).
  const [completedQByScope, setCompletedQByScope] = useState<Record<PickableScope, string | null>>({
    'with-stock': null,
    catalog: null,
  });

  const abortByScopeRef = useRef<Record<PickableScope, AbortController | null>>({
    'with-stock': null,
    catalog: null,
  });

  // Espejo para leer límite y modo dentro del fetch sin dependencias: los
  // efectos declaran todas sus dependencias y no necesitan `eslint-disable`.
  const scopeStateRef = useRef(pickablesByScope);
  scopeStateRef.current = pickablesByScope;

  const fetchPickableScope = useCallback(
    async (scope: PickableScope, input: FetchPickableScopeInput): Promise<void> => {
      abortByScopeRef.current[scope]?.abort();
      const controller = new AbortController();
      abortByScopeRef.current[scope] = controller;

      setPickablesByScope((current) => ({
        ...current,
        [scope]: { ...current[scope], loading: true, error: null },
      }));

      const live = scopeStateRef.current[scope];
      const limit = input.limit ?? live.limit;
      const page = input.page ?? 1;
      const params: ListPickableItemsParams = {
        sourceLocationId: input.source,
        scope,
        ...(input.q.trim() ? { q: input.q.trim() } : {}),
        limit,
        // ADR-065: el modo lo declara el servidor. Sin meta previa se asume el
        // default numerado; en degradación (`randomAccess: false`) el avance
        // vuelve al cursor con «Cargar más».
        ...(live.randomAccess || live.total === 0
          ? { page }
          : input.cursor
            ? { cursor: input.cursor }
            : {}),
      };

      try {
        const response = await inventoryApi.listPickableItems(params, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        const meta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit,
        });
        setPickableCache((current) => {
          const next = new Map(current);
          for (const item of response.data) {
            if (!next.has(item.itemId)) {
              next.set(item.itemId, item);
            }
          }
          return next;
        });
        setPickablesByScope((current) => {
          const previous = current[scope];
          const merged = input.append
            ? [
                ...previous.items,
                ...response.data.filter(
                  (item) => !previous.items.some((row) => row.itemId === item.itemId),
                ),
              ]
            : response.data;
          return {
            ...current,
            [scope]: {
              items: merged,
              total: meta.total,
              hasMore: meta.hasMore,
              nextCursor: meta.nextCursor,
              page: meta.page ?? page,
              limit: meta.limit,
              totalPages: meta.totalPages,
              randomAccess: meta.capabilities.randomAccess,
              loading: false,
              error: null,
            },
          };
        });
        if (!input.append) {
          const completedQ = input.q.trim();
          setCompletedQByScope((current) => ({ ...current, [scope]: completedQ }));
        }
      } catch (fetchError: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        setPickablesByScope((current) => ({
          ...current,
          [scope]: {
            ...current[scope],
            ...(input.append ? {} : { items: [], total: 0, hasMore: false, nextCursor: null }),
            loading: false,
            error: mapPickableError(fetchError),
          },
        }));
        if (!input.append) {
          const completedQ = input.q.trim();
          setCompletedQByScope((current) => ({ ...current, [scope]: completedQ }));
        }
      }
    },
    [],
  );

  const abortAllScopes = useCallback(() => {
    abortByScopeRef.current['with-stock']?.abort();
    abortByScopeRef.current.catalog?.abort();
  }, []);

  const clearScopes = useCallback(() => {
    setPickablesByScope({ 'with-stock': emptyScopeState(), catalog: emptyScopeState() });
    setCompletedQByScope({ 'with-stock': null, catalog: null });
  }, []);

  const clearPickableCache = useCallback(() => {
    setPickableCache(new Map());
  }, []);

  // Carga B1 (reemplaza listBalances(100) + listAssets(100) + N+1 getItem(40) y
  // la derivación cliente): el efecto sobre el origen y la búsqueda alimenta
  // ambas pestañas desde B1, con `meta.total` en los contadores y el pie de
  // paginación decidido por `meta.capabilities` (ADR-065).
  useEffect(() => {
    const source = sourceLocationId.trim();
    if (!source || editInitializing) {
      return;
    }
    void fetchPickableScope(activeScope, { source, q: debouncedSearch });
  }, [sourceLocationId, activeScope, debouncedSearch, editInitializing, fetchPickableScope]);

  // El contador de la pestaña inactiva también refleja `meta.total` del servidor.
  useEffect(() => {
    const source = sourceLocationId.trim();
    if (!source || editInitializing) {
      return;
    }
    const inactive: PickableScope = activeScope === 'with-stock' ? 'catalog' : 'with-stock';
    void fetchPickableScope(inactive, { source, q: debouncedSearch });
  }, [sourceLocationId, debouncedSearch, editInitializing, activeScope, fetchPickableScope]);

  useEffect(() => {
    const scopes = abortByScopeRef.current;
    return () => {
      scopes['with-stock']?.abort();
      scopes.catalog?.abort();
    };
  }, []);

  const showStockContext = Boolean(sourceLocationId.trim());

  useEffect(() => {
    if (!showStockContext) {
      setPickablesByScope({ 'with-stock': emptyScopeState(), catalog: emptyScopeState() });
    }
  }, [showStockContext]);

  const retryActiveScope = useCallback(() => {
    const source = sourceLocationId.trim();
    if (!source || editInitializing) {
      return;
    }
    void fetchPickableScope(activeScope, { source, q: debouncedSearch });
  }, [sourceLocationId, editInitializing, activeScope, debouncedSearch, fetchPickableScope]);

  const handleLoadMore = useCallback(() => {
    const state = scopeStateRef.current[activeScope];
    const cursor = state.nextCursor;
    const source = sourceLocationId.trim();
    if (!source || !cursor || state.randomAccess) {
      return;
    }
    void fetchPickableScope(activeScope, {
      source,
      q: debouncedSearch,
      cursor,
      append: true,
    });
  }, [sourceLocationId, activeScope, debouncedSearch, fetchPickableScope]);

  /** Cambio de página del pager numerado (ADR-065): reemplaza el listado. */
  const handlePageChange = useCallback(
    (scope: PickableScope, page: number) => {
      const source = sourceLocationId.trim();
      if (!source) {
        return;
      }
      void fetchPickableScope(scope, {
        source,
        q: debouncedSearch,
        page,
        limit: scopeStateRef.current[scope].limit,
      });
    },
    [sourceLocationId, debouncedSearch, fetchPickableScope],
  );

  /** Cambio de tamaño de página: vuelve a la página 1 (ADR-065). */
  const handlePageSizeChange = useCallback(
    (scope: PickableScope, limit: number) => {
      const source = sourceLocationId.trim();
      if (!source) {
        return;
      }
      void fetchPickableScope(scope, { source, q: debouncedSearch, page: 1, limit });
    },
    [sourceLocationId, debouncedSearch, fetchPickableScope],
  );

  return {
    pickablesByScope,
    setPickablesByScope,
    pickableCache,
    setPickableCache,
    completedQByScope,
    showStockContext,
    fetchPickableScope,
    retryActiveScope,
    handleLoadMore,
    handlePageChange,
    handlePageSizeChange,
    abortAllScopes,
    clearScopes,
    clearPickableCache,
  };
}
