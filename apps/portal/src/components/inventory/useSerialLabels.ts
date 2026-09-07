'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inventoryApi } from '@/lib/api-client';
import { fallbackSerializedAssetLabel } from './stock-issue-line-utils';
import { resolveLineSerializedAssetIds } from './stock-issue-draft';

interface LabeledLine {
  serializedAssetIds?: string[] | null;
  serializedAssetId?: string | null;
}

/**
 * Etiquetas de seriales (S2.1 C2/C4): se resuelven una vez por activo y se
 * cachean; un fallo degrada al id corto, nunca bloquea la línea. Fuente única
 * para la tabla y el panel. El efecto depende de una clave estable de
 * pendientes (no del mapa de etiquetas), así que no se autorreejecuta al
 * fusionar resultados.
 */
export function useSerialLabels(lines: readonly LabeledLine[]) {
  const [serialLabelsById, setSerialLabelsById] = useState<Record<string, string>>({});
  const resolvedRef = useRef<Set<string>>(new Set());

  const mergeSerialLabels = useCallback((labels: Record<string, string>) => {
    for (const id of Object.keys(labels)) {
      resolvedRef.current.add(id);
    }
    setSerialLabelsById((current) => ({ ...current, ...labels }));
  }, []);

  const resetSerialLabels = useCallback((seed: Record<string, string> = {}) => {
    resolvedRef.current = new Set(Object.keys(seed));
    setSerialLabelsById(seed);
  }, []);

  const pendingKey = useMemo(() => {
    const pending = new Set<string>();
    for (const line of lines) {
      for (const id of resolveLineSerializedAssetIds(line)) {
        if (serialLabelsById[id] == null && !resolvedRef.current.has(id)) {
          pending.add(id);
        }
      }
    }
    return [...pending].sort().join(',');
  }, [lines, serialLabelsById]);

  useEffect(() => {
    if (!pendingKey) {
      return;
    }
    const ids = pendingKey.split(',').filter((id) => id.length > 0);
    if (ids.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      ids.map((assetId) =>
        inventoryApi
          .getAsset(assetId)
          .then((asset) => ({
            assetId,
            label:
              asset.serialNumber?.trim() ||
              asset.assetTag?.trim() ||
              fallbackSerializedAssetLabel(assetId),
          }))
          .catch(() => ({ assetId, label: fallbackSerializedAssetLabel(assetId) })),
      ),
    ).then((resolved) => {
      if (cancelled) {
        return;
      }
      for (const entry of resolved) {
        resolvedRef.current.add(entry.assetId);
      }
      setSerialLabelsById((current) => {
        const next = { ...current };
        for (const entry of resolved) {
          if (next[entry.assetId] == null) {
            next[entry.assetId] = entry.label;
          }
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pendingKey]);

  return { serialLabelsById, mergeSerialLabels, resetSerialLabels };
}
