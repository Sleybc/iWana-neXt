'use client';

import { useCallback, useState } from 'react';
import { inventoryApi, type SerializedAssetDetailRecord } from '@/lib/api-client';

const ASSET_DETAIL_SECTION_LIMIT = 20;

export const ASSET_DETAIL_QUERY_DEFAULTS = {
  lifecyclePage: 1,
  lifecycleLimit: ASSET_DETAIL_SECTION_LIMIT,
  movementsPage: 1,
  movementsLimit: ASSET_DETAIL_SECTION_LIMIT,
} as const;

/**
 * Apertura y paginación de la ficha del equipo (`SerializedAssetDetailDrawer`). La comparten
 * Inventario y la ficha del suscriptor, que abre el mismo drawer sin componente nuevo (CA-6).
 * `mapError` traduce el fallo al texto de quien la usa.
 */
export function useSerializedAssetDetail(mapError: (error: unknown) => string) {
  const [detail, setDetail] = useState<SerializedAssetDetailRecord | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMoreLifecycle, setIsLoadingMoreLifecycle] = useState(false);
  const [isLoadingMoreMovements, setIsLoadingMoreMovements] = useState(false);

  const open = useCallback(
    async (assetId: string) => {
      setTargetId(assetId);
      setError(null);
      setIsLoading(true);
      try {
        setDetail(await inventoryApi.getAsset(assetId, ASSET_DETAIL_QUERY_DEFAULTS));
      } catch (detailError) {
        setError(mapError(detailError));
        setDetail(null);
        setTargetId(null);
      } finally {
        setIsLoading(false);
      }
    },
    [mapError],
  );

  const close = useCallback(() => {
    setDetail(null);
    setTargetId(null);
  }, []);

  async function loadMoreLifecycle() {
    if (!detail) {
      return;
    }

    setIsLoadingMoreLifecycle(true);
    try {
      const next = await inventoryApi.getAsset(detail.id, {
        ...ASSET_DETAIL_QUERY_DEFAULTS,
        lifecyclePage: detail.lifecycle.page + 1,
        lifecycleLimit: detail.lifecycle.limit,
        movementsPage: 1,
        movementsLimit: detail.movements.limit,
      });
      setDetail((current) => {
        if (!current || current.id !== next.id) {
          return current;
        }

        return {
          ...next,
          lifecycle: {
            ...next.lifecycle,
            data: [...current.lifecycle.data, ...next.lifecycle.data],
          },
          movements: current.movements,
        };
      });
    } catch (detailError) {
      setError(mapError(detailError));
    } finally {
      setIsLoadingMoreLifecycle(false);
    }
  }

  async function loadMoreMovements() {
    if (!detail) {
      return;
    }

    setIsLoadingMoreMovements(true);
    try {
      const next = await inventoryApi.getAsset(detail.id, {
        ...ASSET_DETAIL_QUERY_DEFAULTS,
        lifecyclePage: 1,
        lifecycleLimit: detail.lifecycle.limit,
        movementsPage: detail.movements.page + 1,
        movementsLimit: detail.movements.limit,
      });
      setDetail((current) => {
        if (!current || current.id !== next.id) {
          return current;
        }

        return {
          ...next,
          lifecycle: current.lifecycle,
          movements: {
            ...next.movements,
            data: [...current.movements.data, ...next.movements.data],
          },
        };
      });
    } catch (detailError) {
      setError(mapError(detailError));
    } finally {
      setIsLoadingMoreMovements(false);
    }
  }

  return {
    detail,
    targetId,
    error,
    isLoading,
    isLoadingMoreLifecycle,
    isLoadingMoreMovements,
    open,
    close,
    loadMoreLifecycle,
    loadMoreMovements,
  };
}
