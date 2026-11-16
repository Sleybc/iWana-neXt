'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ListMeta,
  SubscriberEquipmentHistoryItem,
  SubscriberEquipmentItem,
  SubscriberEquipmentQuery,
  SubscriberEquipmentResponse,
  SubscriberMaterialItem,
} from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';

/** Textos fijos: no se refleja el mensaje del backend (frontend-security-coder). */
export const SUBSCRIBER_EQUIPMENT_LOAD_ERROR = 'No pudimos cargar los equipos';
const MATERIALS_PAGE_ERROR = 'No pudimos cargar más materiales';
const HISTORY_PAGE_ERROR = 'No pudimos cargar el historial de equipos';

export interface SubscriberEquipmentSection<TItem> {
  items: TItem[];
  meta: ListMeta | null;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Repite la última lectura fallida de la sección. */
  retry: () => void;
}

export interface SubscriberEquipmentLoad {
  loading: boolean;
  error: string | null;
  /** null hasta la primera respuesta. */
  equipment: SubscriberEquipmentItem[] | null;
  reload: () => void;
  materials: SubscriberEquipmentSection<SubscriberMaterialItem>;
  history: SubscriberEquipmentSection<SubscriberEquipmentHistoryItem> & {
    /** Equipo por el que se filtra el historial; null sin filtro. */
    assetId: string | null;
    /** Releyendo la primera página tras cambiar el filtro. */
    filtering: boolean;
    setAssetId: (assetId: string | null) => void;
  };
}

interface PageState<TItem> {
  items: TItem[];
  meta: ListMeta | null;
  loadingMore: boolean;
  error: string | null;
}

const EMPTY_PAGE = { items: [], meta: null, loadingMore: false, error: null };

/**
 * Una sola lectura inicial por ficha, compartida por la tarjeta de la Vista general y la
 * pestaña Equipos (CA-1, CA-3). Las páginas de materiales e historial y el filtro por equipo
 * repiten la misma ruta con los parámetros de su sección y solo toman esa sección.
 * `enabled=false` (sin INVENTORY_STOCK_READ) no llama a la API.
 */
export function useSubscriberEquipment(
  subscriberId: string,
  enabled: boolean,
): SubscriberEquipmentLoad {
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<SubscriberEquipmentItem[] | null>(null);
  const [materials, setMaterials] = useState<PageState<SubscriberMaterialItem>>(EMPTY_PAGE);
  const [history, setHistory] = useState<PageState<SubscriberEquipmentHistoryItem>>(EMPTY_PAGE);
  const [historyAssetId, setHistoryAssetIdState] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [historyRetryKind, setHistoryRetryKind] = useState<'page' | 'filter'>('page');
  // Descarta respuestas de una lectura de historial ya superada por otra.
  const historyRequest = useRef(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !subscriberId) {
      setLoading(false);
      return;
    }
    let active = true;
    historyRequest.current += 1;
    setLoading(true);
    setError(null);
    inventoryApi.getSubscriberEquipment(subscriberId).then(
      (response: SubscriberEquipmentResponse) => {
        if (!active) return;
        setEquipment(response.equipment);
        setMaterials({ ...EMPTY_PAGE, ...response.materials });
        setHistory({ ...EMPTY_PAGE, ...response.history });
        setHistoryAssetIdState(null);
        setFiltering(false);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError(SUBSCRIBER_EQUIPMENT_LOAD_ERROR);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [subscriberId, enabled, revision]);

  const loadMoreMaterials = useCallback(() => {
    const meta = materials.meta;
    if (!meta || materials.loadingMore) return;
    setMaterials((current) => ({ ...current, loadingMore: true, error: null }));
    inventoryApi
      .getSubscriberEquipment(subscriberId, {
        materialsPage: (meta.page ?? 1) + 1,
        materialsLimit: meta.limit,
      })
      .then(
        (response) =>
          setMaterials((current) => ({
            items: [...current.items, ...response.materials.items],
            meta: response.materials.meta,
            loadingMore: false,
            error: null,
          })),
        () =>
          setMaterials((current) => ({
            ...current,
            loadingMore: false,
            error: MATERIALS_PAGE_ERROR,
          })),
      );
  }, [subscriberId, materials.meta, materials.loadingMore]);

  const fetchHistory = useCallback(
    (assetId: string | null, page: number, append: boolean) => {
      const requestId = ++historyRequest.current;
      const query: SubscriberEquipmentQuery = { historyPage: page };
      if (history.meta) query.historyLimit = history.meta.limit;
      if (assetId) query.historyAssetId = assetId;
      inventoryApi.getSubscriberEquipment(subscriberId, query).then(
        (response) => {
          if (requestId !== historyRequest.current) return;
          setHistory((current) => ({
            items: append ? [...current.items, ...response.history.items] : response.history.items,
            meta: response.history.meta,
            loadingMore: false,
            error: null,
          }));
          setFiltering(false);
        },
        () => {
          if (requestId !== historyRequest.current) return;
          setHistory((current) => ({ ...current, loadingMore: false, error: HISTORY_PAGE_ERROR }));
          setFiltering(false);
        },
      );
    },
    [subscriberId, history.meta],
  );

  const loadMoreHistory = useCallback(() => {
    if (!history.meta || history.loadingMore) return;
    setHistoryRetryKind('page');
    setHistory((current) => ({ ...current, loadingMore: true, error: null }));
    fetchHistory(historyAssetId, (history.meta.page ?? 1) + 1, true);
  }, [fetchHistory, history.meta, history.loadingMore, historyAssetId]);

  const setHistoryAssetId = useCallback(
    (assetId: string | null) => {
      setHistoryAssetIdState(assetId);
      setHistoryRetryKind('filter');
      setFiltering(true);
      setHistory((current) => ({ ...current, items: [], loadingMore: false, error: null }));
      fetchHistory(assetId, 1, false);
    },
    [fetchHistory],
  );

  const retryHistory = useCallback(() => {
    if (historyRetryKind === 'filter') {
      setHistoryAssetId(historyAssetId);
    } else {
      loadMoreHistory();
    }
  }, [historyRetryKind, historyAssetId, setHistoryAssetId, loadMoreHistory]);

  return useMemo(
    () => ({
      loading,
      error,
      equipment,
      reload,
      materials: { ...materials, loadMore: loadMoreMaterials, retry: loadMoreMaterials },
      history: {
        ...history,
        loadMore: loadMoreHistory,
        retry: retryHistory,
        assetId: historyAssetId,
        filtering,
        setAssetId: setHistoryAssetId,
      },
    }),
    [
      loading,
      error,
      equipment,
      reload,
      materials,
      loadMoreMaterials,
      history,
      loadMoreHistory,
      retryHistory,
      historyAssetId,
      filtering,
      setHistoryAssetId,
    ],
  );
}
